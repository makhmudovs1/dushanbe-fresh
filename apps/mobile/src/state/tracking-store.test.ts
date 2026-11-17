import { describe, expect, it } from "vitest";
import { createTrackingStore } from "./tracking-store";
import { privateStorageKey } from "../domain/storage-scope";

function storage() {
  const data = new Map<string, string>();
  return {
    data,
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
    async removeItem(key: string) {
      data.delete(key);
    },
  };
}
describe("private tracking capability storage", () => {
  it("restores a guest capability after a restart only within the same API", async () => {
    const disk = storage();
    const api = "https://dushanbefresh.tj/api/v1";
    await createTrackingStore(disk, api).save("a".repeat(64), null);
    expect(await createTrackingStore(disk, api).read(null)).toBe(
      "a".repeat(64),
    );
    expect(
      await createTrackingStore(disk, "http://localhost:4000/api/v1").read(
        null,
      ),
    ).toBeNull();
  });
  it("keeps account capabilities apart from guests and other accounts", async () => {
    const store = createTrackingStore(
      storage(),
      "http://localhost:4000/api/v1",
    );
    await store.save("b".repeat(64), "owner-a");
    expect(await store.read("owner-a")).toBe("b".repeat(64));
    expect(await store.read("owner-b")).toBeNull();
    expect(await store.read(null)).toBeNull();
  });
  it("does not send an unscoped legacy capability to an unrelated API", async () => {
    const disk = storage();
    disk.data.set("df.mobile.tracking.v1", "c".repeat(64));
    expect(
      await createTrackingStore(disk, "http://localhost:4000/api/v1").read(
        null,
      ),
    ).toBeNull();
    expect(disk.data.has("df.mobile.tracking.v1")).toBe(true);
  });
  it("rejects invalid or corrupted capabilities without putting them in a request", async () => {
    const disk = storage();
    const api = "http://localhost:4000/api/v1";
    const store = createTrackingStore(disk, api);
    await expect(store.save("123", null)).rejects.toThrow(
      "INVALID_TRACKING_TOKEN",
    );
    disk.data.set(privateStorageKey("tracking", api, null), "corrupted");
    await expect(store.read(null)).rejects.toThrow("INVALID_TRACKING_TOKEN");
  });
  it("propagates secure storage failures without a plaintext fallback", async () => {
    const disk = storage();
    disk.setItem = async () => {
      throw new Error("Keychain locked");
    };
    await expect(
      createTrackingStore(disk, "http://localhost:4000/api/v1").save(
        "d".repeat(64),
        null,
      ),
    ).rejects.toThrow("Keychain locked");
    expect(disk.data.size).toBe(0);
  });
});
