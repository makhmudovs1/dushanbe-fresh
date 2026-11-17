import type { CheckoutJournal, PendingOrder } from "../domain/checkout";
export type PrivateStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
const defaultKey = "df.mobile.pending-order.v1";
function manifest(raw: string) {
  const value = JSON.parse(raw) as { generation: string; count: number };
  if (
    !/^[a-f0-9-]{36}$/.test(value.generation) ||
    !Number.isInteger(value.count) ||
    value.count < 1 ||
    value.count > 100
  )
    throw new Error("INVALID_JOURNAL");
  return value;
}
export function createPrivateJournal(
  storage: PrivateStorage,
  uuid: () => string,
  namespace = defaultKey,
): CheckoutJournal {
  const key = namespace;
  return {
    async read() {
      const raw = await storage.getItem(key);
      if (!raw) return null;
      const { generation, count } = manifest(raw);
      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          storage.getItem(`${key}.${generation}.${i}`),
        ),
      );
      if (parts.some((part) => part === null))
        throw new Error("INCOMPLETE_JOURNAL");
      const value = JSON.parse(parts.join("")) as PendingOrder;
      if (
        !value?.input ||
        typeof value.input.requestId !== "string" ||
        !/^[a-f0-9-]{36}$/.test(value.input.requestId) ||
        !/^[a-f0-9]{64}$/.test(value.input.reviewToken)
      )
        throw new Error("INVALID_JOURNAL");
      return value;
    },
    async write(value) {
      // Code points preserve emoji/surrogate pairs, each chunk <= 1800 UTF-8 bytes.
      const points = Array.from(JSON.stringify(value));
      const generation = uuid();
      const chunks: string[] = [];
      for (let i = 0; i < points.length; i += 450)
        chunks.push(points.slice(i, i + 450).join(""));
      if (chunks.length > 100) throw new Error("ORDER_TOO_LARGE");
      const written: string[] = [];
      try {
        for (let i = 0; i < chunks.length; i++) {
          const part = `${key}.${generation}.${i}`;
          await storage.setItem(part, chunks[i]!);
          written.push(part);
        }
        await storage.setItem(
          key,
          JSON.stringify({ generation, count: chunks.length }),
        );
      } catch (error) {
        await Promise.all(
          written.map((part) => storage.removeItem(part).catch(() => {})),
        );
        throw error;
      }
    },
    async remove() {
      const raw = await storage.getItem(key);
      if (!raw) return;
      const { generation, count } = manifest(raw);
      await storage.removeItem(key);
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          storage.removeItem(`${key}.${generation}.${i}`),
        ),
      );
    },
  };
}
