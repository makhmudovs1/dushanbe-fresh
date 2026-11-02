import { HttpException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { parseCustomerSmsBudgetConfiguration } from "./customer-sms-budget.configuration";

// Stable global keys deliberately do not depend on phone, transport or a rotatable OTP secret.
export const CUSTOMER_SMS_BUDGET_KEYS = {
  hour: "customer-sms-budget:hour:v1",
  day: "customer-sms-budget:day:v1",
  warning: "customer-sms-budget:daily-warning:v1"
} as const;
export const structuredLogger = new Logger("CustomerSmsBudget");

export type CustomerSmsBudgetUsage = {
  configured: boolean;
  hour: { used: number; limit: number; resetsAt: string };
  day: { used: number; limit: number; resetsAt: string };
  dailyWarning: boolean;
};
type Snapshot = CustomerSmsBudgetUsage & { warningLogged: boolean };
export type CustomerSmsBudgetReservation = CustomerSmsBudgetUsage & { warnDailyLimit: boolean };

@Injectable()
export class CustomerSmsBudgetService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async snapshot(db: Pick<Prisma.TransactionClient, "$queryRaw">): Promise<Snapshot> {
    const config = parseCustomerSmsBudgetConfiguration();
    // A single read-only statement gives counts and DB time from the same snapshot.
    const [row] = await db.$queryRaw<Array<{ now: Date; hour: number; day: number; warning: number }>>`
      WITH instant AS (SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now)
      SELECT instant.now,
        COALESCE((SELECT count FROM customer_auth_limits WHERE key = ${CUSTOMER_SMS_BUDGET_KEYS.hour} AND resets_at > instant.now), 0)::int AS hour,
        COALESCE((SELECT count FROM customer_auth_limits WHERE key = ${CUSTOMER_SMS_BUDGET_KEYS.day} AND resets_at > instant.now), 0)::int AS day,
        COALESCE((SELECT count FROM customer_auth_limits WHERE key = ${CUSTOMER_SMS_BUDGET_KEYS.warning} AND resets_at > instant.now), 0)::int AS warning
      FROM instant`;
    const hourReset = new Date(row.now); hourReset.setUTCMinutes(0, 0, 0); hourReset.setUTCHours(hourReset.getUTCHours() + 1);
    const dayReset = new Date(row.now); dayReset.setUTCHours(24, 0, 0, 0);
    return {
      configured: config !== null,
      hour: { used: row.hour, limit: config?.maxPerHour ?? 0, resetsAt: hourReset.toISOString() },
      day: { used: row.day, limit: config?.maxPerDay ?? 0, resetsAt: dayReset.toISOString() },
      dailyWarning: config !== null && row.day >= Math.ceil(config.maxPerDay * 0.8), warningLogged: row.warning > 0
    };
  }

  /** Read-only admin data. Fixed UTC buckets: hours HH:00-HH+1:00, days 00:00-24:00.
   * Not rolling windows; used counts conservative committed attempts, not delivered messages. No identities.
   */
  async usage(): Promise<CustomerSmsBudgetUsage> {
    const { warningLogged: _warningLogged, ...usage } = await this.snapshot(this.prisma);
    void _warningLogged;
    return usage;
  }

  /** Call after cooldown/OTP writes, as the final step of the caller's transaction, before any SMS I/O.
   * Committed reservations are never refunded, including provider errors/timeouts or process crashes.
   * This conservatively bounds possible paid attempts; there is no retry or network I/O in the transaction.
   */
  async reserve(tx: Prisma.TransactionClient): Promise<CustomerSmsBudgetReservation> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"customer-sms-budget:global:v1"}, 7022))`;
    const { warningLogged, ...usage } = await this.snapshot(tx);
    if (!usage.configured) throw new ServiceUnavailableException("Вход по SMS временно недоступен. Попробуйте позже.");
    if (usage.hour.used >= usage.hour.limit || usage.day.used >= usage.day.limit) {
      throw new HttpException({ code: "CUSTOMER_SMS_SEND_LIMIT", message: "Сейчас не получается отправить SMS. Пожалуйста, попробуйте позже." }, 429);
    }
    usage.hour.used++; usage.day.used++;
    usage.dailyWarning = usage.day.used >= Math.ceil(usage.day.limit * 0.8);
    for (const period of ["hour", "day"] as const) {
      const data = { count: usage[period].used, resetsAt: new Date(usage[period].resetsAt) };
      await tx.customerAuthLimit.upsert({ where: { key: CUSTOMER_SMS_BUDGET_KEYS[period] },
        create: { key: CUSTOMER_SMS_BUDGET_KEYS[period], ...data }, update: data });
    }
    const warnDailyLimit = usage.dailyWarning && !warningLogged;
    if (warnDailyLimit) {
      const data = { count: 1, resetsAt: new Date(usage.day.resetsAt) };
      await tx.customerAuthLimit.upsert({ where: { key: CUSTOMER_SMS_BUDGET_KEYS.warning },
        create: { key: CUSTOMER_SMS_BUDGET_KEYS.warning, ...data }, update: data });
    }
    return { ...usage, warnDailyLimit };
  }

  // Log only after the transaction commits. Explicit fields prevent PII/OTP/provider secrets escaping.
  logReservation(reservation: CustomerSmsBudgetReservation) {
    structuredLogger.log(JSON.stringify({
      event: "customer_sms_attempt_reserved", quantity: 1, hour: reservation.hour, day: reservation.day
    }));
    if (reservation.warnDailyLimit) structuredLogger.warn(JSON.stringify({
      event: "customer_sms_daily_budget_near_limit", hour: reservation.hour, day: reservation.day
    }));
  }

  // Acceptance is not handset delivery. Failure/unknown never refunds the committed attempt.
  logOutcome(reservation: CustomerSmsBudgetReservation, outcome: "accepted" | "failed_or_unknown") {
    structuredLogger.log(JSON.stringify({
      event: "customer_sms_provider_outcome", outcome, quantity: 1, hour: reservation.hour, day: reservation.day
    }));
  }
}
