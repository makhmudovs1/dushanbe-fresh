import type { SecretStore } from "./session-manager";
export type SecureDriver = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options: { keychainAccessible: number },
  ): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};
export function createSecureAdapter(
  driver: SecureDriver,
  whenUnlockedDeviceOnly: number,
): SecretStore {
  const key = (value: string) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(value))
      throw new Error("INVALID_PRIVATE_STORAGE_KEY");
    return value;
  };
  return {
    getItem: (value) => driver.getItemAsync(key(value)),
    setItem: (value, data) =>
      driver.setItemAsync(key(value), data, {
        keychainAccessible: whenUnlockedDeviceOnly,
      }),
    removeItem: (value) => driver.deleteItemAsync(key(value)),
  };
}
