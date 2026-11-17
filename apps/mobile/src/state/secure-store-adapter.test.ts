import { describe, expect, it, vi } from "vitest";
import { createSecureAdapter } from "./secure-store-adapter";
describe("OS private storage adapter", () => {
  it("uses the device-only unlocked Keychain policy for every write", async () => {
    const driver = {
      getItemAsync: vi.fn().mockResolvedValue("saved"),
      setItemAsync: vi.fn().mockResolvedValue(undefined),
      deleteItemAsync: vi.fn().mockResolvedValue(undefined),
    };
    const store = createSecureAdapter(driver, 7);
    await store.setItem("df.private.v2", "test-only");
    expect(driver.setItemAsync).toHaveBeenCalledWith(
      "df.private.v2",
      "test-only",
      { keychainAccessible: 7 },
    );
    expect(await store.getItem("df.private.v2")).toBe("saved");
    await store.removeItem("df.private.v2");
    expect(driver.deleteItemAsync).toHaveBeenCalledWith("df.private.v2");
  });
  it("rejects unsupported keys without falling back to plaintext", () => {
    const set = vi.fn();
    const driver = {
      getItemAsync: vi.fn(),
      setItemAsync: set,
      deleteItemAsync: vi.fn(),
    };
    const store = createSecureAdapter(driver, 7);
    expect(() => store.setItem("https://bad/key", "secret")).toThrow(
      "INVALID_PRIVATE_STORAGE_KEY",
    );
    expect(set).not.toHaveBeenCalled();
  });
});
