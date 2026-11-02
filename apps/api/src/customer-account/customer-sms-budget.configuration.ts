type Environment = Record<string, string | undefined>;

export type CustomerSmsBudgetConfiguration = { maxPerHour: number; maxPerDay: number };

// Only absent values use defaults. Empty, fractional, signed or overflowing values fail closed.
export function parseCustomerSmsBudgetConfiguration(env: Environment = process.env): CustomerSmsBudgetConfiguration | null {
  const ceiling = (value: string | undefined, fallback: number) => {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= 2147483647 ? parsed : null;
  };
  const maxPerHour = ceiling(env.CUSTOMER_SMS_MAX_PER_HOUR, 10);
  const maxPerDay = ceiling(env.CUSTOMER_SMS_MAX_PER_DAY, 50);
  return maxPerHour === null || maxPerDay === null ? null : { maxPerHour, maxPerDay };
}
