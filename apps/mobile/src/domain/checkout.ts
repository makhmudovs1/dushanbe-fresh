import type {
  CheckoutInput,
  CheckoutQuote,
  CreateOrderInput,
  OrderReceipt,
} from "@dushanbe-fresh/shared";
export type PendingOrder = {
  input: CreateOrderInput;
  scope?: { apiBaseUrl: string; ownerId: string | null };
};
export type CheckoutJournal = {
  read(): Promise<PendingOrder | null>;
  write(value: PendingOrder): Promise<void>;
  remove(): Promise<void>;
};
export function normalizePhone(value: string) {
  const digits = value.replace(/[\s()+-]/g, "");
  const phone = digits.length === 9 ? `992${digits}` : digits;
  return /^992\d{9}$/.test(phone) ? `+${phone}` : null;
}
export function quoteKey(input: CheckoutInput): string {
  return JSON.stringify(input);
}
// No automatic POST retries; journal exists before the first attempt and survives uncertain responses.
export class OrderSubmission {
  private busy = false;
  constructor(
    private journal: CheckoutJournal,
    private send: (input: CreateOrderInput) => Promise<OrderReceipt>,
    private scope?: { apiBaseUrl: string; ownerId: string | null },
  ) {}
  async submit(input?: CreateOrderInput): Promise<OrderReceipt> {
    if (this.busy) throw new Error("IN_FLIGHT");
    this.busy = true;
    try {
      const pending = await this.journal.read();
      if (
        pending &&
        this.scope &&
        JSON.stringify(pending.scope) !== JSON.stringify(this.scope)
      )
        throw new Error("ORDER_OWNER_CHANGED");
      const payload = pending?.input ?? input;
      if (!payload) throw new Error("NO_ORDER");
      if (!pending)
        await this.journal.write({
          input: payload,
          ...(this.scope ? { scope: this.scope } : {}),
        });
      return await this.send(payload);
    } finally {
      this.busy = false;
    }
  }
  // Call only after receipt and private tracking capability have been stored durably.
  acknowledge() {
    return this.journal.remove();
  }
}
export function isQuote(value: unknown): value is CheckoutQuote {
  if (!value || typeof value !== "object") return false;
  const q = value as CheckoutQuote;
  return (
    typeof q.valid === "boolean" &&
    typeof q.reviewToken === "string" &&
    /^[a-f0-9]{64}$/.test(q.reviewToken) &&
    [
      q.itemsSubtotal,
      q.deliveryFee,
      q.serviceFee,
      q.totalEstimated,
      q.minimumOrderAmount,
      q.minimumOrderShortfall,
    ].every((v) => typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v)) &&
    Array.isArray(q.errors) &&
    Array.isArray(q.items) &&
    q.items.every((i) => Array.isArray(i.errors) && Array.isArray(i.warnings))
  );
}
