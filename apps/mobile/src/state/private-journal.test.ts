import { describe, expect, it } from "vitest";
import { createPrivateJournal, type PrivateStorage } from "./private-journal";
import type { PendingOrder } from "../domain/checkout";
const id = "7e439da7-60f1-4050-9783-d299181386ea";
function memory() {
  const values = new Map<string, string>();
  const writes: string[] = [];
  const storage: PrivateStorage = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
      writes.push(k);
    },
    removeItem: async (k) => {
      values.delete(k);
    },
  };
  return {
    storage,
    values,
    writes,
    journal: createPrivateJournal(storage, () => id),
  };
}
const payload = {
  input: {
    requestId: id,
    reviewToken: "a".repeat(64),
    name: "Тест 🥕".repeat(300),
  },
} as PendingOrder;
describe("private checkout journal", () => {
  it("round-trips exact Unicode payload under native value limits", async () => {
    const { values, journal, writes } = memory();
    await journal.write(payload);
    expect(await journal.read()).toEqual(payload);
    expect(writes.at(-1)).toBe("df.mobile.pending-order.v1");
    expect(
      [...values.values()].every((v) => Buffer.byteLength(v, "utf8") <= 1800),
    ).toBe(true);
  });
  it("fails closed on missing chunks", async () => {
    const { values, journal, writes } = memory();
    await journal.write(payload);
    values.delete(writes[0]!);
    await expect(journal.read()).rejects.toThrow("INCOMPLETE_JOURNAL");
  });
  it("does not commit a manifest after a write failure", async () => {
    const { storage, values, journal } = memory();
    const set = storage.setItem;
    let count = 0;
    storage.setItem = async (k, v) => {
      if (++count === 2) throw new Error("keychain full");
      return set(k, v);
    };
    await expect(journal.write(payload)).rejects.toThrow("keychain full");
    expect(await journal.read()).toBeNull();
    expect(values.size).toBe(0);
  });
  it("removes the committed capability and its fragments", async () => {
    const { values, journal } = memory();
    await journal.write(payload);
    await journal.remove();
    expect(await journal.read()).toBeNull();
    expect(values.size).toBe(0);
  });
  it("rejects malformed manifests", async () => {
    const { values, journal } = memory();
    values.set(
      "df.mobile.pending-order.v1",
      JSON.stringify({ generation: "bad", count: 999999 }),
    );
    await expect(journal.read()).rejects.toThrow("INVALID_JOURNAL");
  });
  it("isolates journals by owner and environment namespace", async () => {
    const { storage } = memory();
    const one = createPrivateJournal(storage, () => id, "owner-a.api-one");
    const other = createPrivateJournal(storage, () => id, "owner-b.api-one");
    const staging = createPrivateJournal(storage, () => id, "owner-a.api-two");
    await one.write(payload);
    expect(await other.read()).toBeNull();
    expect(await staging.read()).toBeNull();
    expect(await one.read()).toEqual(payload);
  });
});
