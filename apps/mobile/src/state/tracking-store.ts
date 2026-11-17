import type { SecretStore } from "./session-manager";
import { privateStorageKey } from "../domain/storage-scope";

export function createTrackingStore(storage: SecretStore, baseUrl: string) {
  const valid = (token: string) => /^[a-f0-9]{64}$/.test(token);
  return {
    async save(token: string, owner: string | null) {
      if (!valid(token)) throw new Error("INVALID_TRACKING_TOKEN");
      await storage.setItem(
        privateStorageKey("tracking", baseUrl, owner),
        token,
      );
    },
    async read(owner: string | null) {
      // An old unscoped capability cannot safely be attributed to this API.
      const token = await storage.getItem(
        privateStorageKey("tracking", baseUrl, owner),
      );
      if (token !== null && !valid(token))
        throw new Error("INVALID_TRACKING_TOKEN");
      return token;
    },
  };
}
