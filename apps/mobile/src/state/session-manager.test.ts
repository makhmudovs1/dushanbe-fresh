import { describe, expect, it } from "vitest";
import type { MobileSessionDto } from "@dushanbe-fresh/shared";
import { ApiClient, ApiError } from "../api/client";
import { SessionManager, type SecretStore } from "./session-manager";
const KEY = `df.mobile.session.v2.${Array.from("https://test.invalid/api/v1")
  .map((c) => c.charCodeAt(0).toString(16).padStart(4, "0"))
  .join("")}`;
const user = {
  id: "customer-a",
  name: "Test",
  phone: "+992000000000",
  phoneVerifiedAt: new Date().toISOString(),
};
const session = (digit = "a"): MobileSessionDto => ({
  user,
  accessToken: `dfm_access_${digit.repeat(64)}`,
  refreshToken: `dfm_refresh_${digit.repeat(64)}`,
  accessExpiresAt: new Date(Date.now() + 300000).toISOString(),
  refreshExpiresAt: new Date(Date.now() + 86400000).toISOString(),
});
function memory() {
  const values = new Map<string, string>();
  const storage: SecretStore = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
    },
    removeItem: async (k) => {
      values.delete(k);
    },
  };
  return { values, storage };
}
function setup(
  handler: (path: string, init?: RequestInit) => Promise<Response> | Response,
) {
  const m = memory();
  const calls: string[] = [];
  const api = new ApiClient(
    "https://test.invalid/api/v1",
    async (url, init) => {
      const path = String(url).replace("https://test.invalid/api/v1", "");
      calls.push(path);
      return handler(path, init);
    },
  );
  return { ...m, calls, manager: new SessionManager(m.storage, api), api };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
describe("private mobile session lifecycle", () => {
  it("persists structured names from the shared identity without inventing a second user", async () => {
    const updated = {
      ...user,
      name: "Маҳмуд Саидов",
      firstName: "Маҳмуд",
      lastName: "Саидов",
    };
    let body: unknown;
    const s = setup((path, init) => {
      if (path === "/mobile/customer/profile") {
        body = JSON.parse(String(init?.body));
        return json(updated);
      }
      return json(session());
    });
    await s.manager.login("challenge", "123456");
    await s.manager.updateProfile(
      { firstName: "Маҳмуд", lastName: "Саидов" },
      user.id,
    );
    expect(body).toEqual({ firstName: "Маҳмуд", lastName: "Саидов" });
    expect(s.manager.getSnapshot().user).toEqual(updated);
    expect(JSON.parse(s.values.get(KEY)!).session.user).toEqual(updated);
  });
  it("persists a real-shaped session before publishing identity", async () => {
    const s = setup(() => json(session()));
    await s.manager.login("challenge", "123456");
    expect(s.manager.getSnapshot().user?.id).toBe(user.id);
    expect(s.values.has(KEY)).toBe(true);
  });
  it("revokes the issued family when secure persistence fails", async () => {
    const s = setup(() => json(session()));
    s.storage.setItem = async () => {
      throw new Error("keychain");
    };
    await expect(s.manager.login("challenge", "123456")).rejects.toThrow(
      "SESSION_NOT_SAVED",
    );
    expect(s.manager.getSnapshot().user).toBeNull();
    expect(s.calls).toContain("/mobile/auth/logout");
  });
  it("refreshes an expired restored session and serializes concurrent refresh", async () => {
    let refreshes = 0;
    const s = setup((path) => {
      if (path === "/mobile/auth/refresh") {
        refreshes++;
        return json(session("b"));
      }
      return json(user);
    });
    s.values.set(
      KEY,
      JSON.stringify({
        session: { ...session(), accessExpiresAt: new Date(0).toISOString() },
      }),
    );
    await s.manager.restore();
    await Promise.all([
      s.manager.request("/mobile/customer/addresses"),
      s.manager.request("/mobile/customer/orders"),
    ]);
    expect(refreshes).toBe(1);
    expect(s.manager.getSnapshot().phase).toBe("account");
  });
  it("rejects a late account response after logout", async () => {
    let release: ((r: Response) => void) | undefined;
    const s = setup((path) =>
      path === "/mobile/customer/orders"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : json(session()),
    );
    await s.manager.login("challenge", "123456");
    const pending = s.manager.request("/mobile/customer/orders");
    await s.manager.logout();
    release?.(json([{ private: "old" }]));
    await expect(pending).rejects.toThrow("OWNER_CHANGED");
    expect(s.manager.getSnapshot().user).toBeNull();
  });
  it("retains an offline logout tombstone and retries revocation after restart", async () => {
    let offline = false;
    const s = setup((path) => {
      if (offline && path === "/mobile/auth/logout") throw new Error("offline");
      return json(session());
    });
    await s.manager.login("challenge", "123456");
    offline = true;
    await expect(s.manager.logout()).rejects.toBeInstanceOf(ApiError);
    expect(JSON.parse(s.values.get(KEY)!).logoutPending).toBe(true);
    expect(s.manager.getSnapshot().user).toBeNull();
    offline = false;
    await s.manager.restore();
    expect(s.manager.getSnapshot().phase).toBe("guest");
    expect(s.values.has(KEY)).toBe(false);
  });
  it("cannot erase an unrevoked session with a second offline logout", async () => {
    let offline = false;
    const s = setup((path) => {
      if (offline && path === "/mobile/auth/logout") throw new Error("offline");
      return json(session());
    });
    await s.manager.login("challenge", "123456");
    offline = true;
    await expect(s.manager.logout()).rejects.toBeInstanceOf(ApiError);
    await expect(s.manager.logout()).rejects.toBeInstanceOf(ApiError);
    expect(JSON.parse(s.values.get(KEY)!).logoutPending).toBe(true);
    expect(s.manager.getSnapshot().user).toBeNull();
    offline = false;
    await s.manager.logout();
    expect(s.values.has(KEY)).toBe(false);
    expect(s.manager.getSnapshot().phase).toBe("guest");
  });
  it("does not automatically replay an uncertain refresh across restart", async () => {
    const s = setup(() => json(user));
    s.values.set(
      KEY,
      JSON.stringify({ session: session(), refreshPending: true }),
    );
    await s.manager.restore();
    expect(s.calls.filter((p) => p === "/mobile/auth/refresh")).toHaveLength(0);
    expect(s.manager.getSnapshot().user).toBeNull();
  });
  it("keeps malformed private storage locked and never presents it as another account", async () => {
    const s = setup(() => json(user));
    s.values.set(KEY, "broken");
    await s.manager.restore();
    expect(s.manager.getSnapshot()).toMatchObject({
      phase: "locked",
      user: null,
      error: "storage",
    });
  });
  it("does not refresh on forbidden responses", async () => {
    const s = setup((path) =>
      path === "/mobile/auth/verify" ? json(session()) : json({}, 403),
    );
    await s.manager.login("challenge", "123456");
    await expect(
      s.manager.request("/mobile/customer/orders"),
    ).rejects.toMatchObject({ status: 403 });
    expect(s.calls).not.toContain("/mobile/auth/refresh");
  });
  it("clears a revoked restored session", async () => {
    const s = setup(() => json({}, 401));
    s.values.set(KEY, JSON.stringify({ session: session() }));
    await s.manager.restore();
    expect(s.manager.getSnapshot().phase).toBe("guest");
    expect(s.values.has(KEY)).toBe(false);
  });
  it("stays locked without an unhandled rejection when OS storage cannot clear a revoked session", async () => {
    const s = setup(() => json({}, 401));
    s.values.set(KEY, JSON.stringify({ session: session() }));
    s.storage.removeItem = async () => {
      throw new Error("Keychain unavailable");
    };
    await expect(s.manager.restore()).resolves.toBeUndefined();
    expect(s.manager.getSnapshot()).toMatchObject({
      phase: "locked",
      user: null,
      error: "storage",
    });
    expect(s.values.has(KEY)).toBe(true);
    await expect(
      s.manager.request("/mobile/customer/orders"),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("never attaches private authorization to public or arbitrary paths", async () => {
    const s = setup(() => json(session()));
    await s.manager.login("challenge", "123456");
    await expect(s.manager.request("/products")).rejects.toThrow(
      "INVALID_PRIVATE_PATH",
    );
  });
  it("rejects a callback bound to another owner before a request is sent", async () => {
    const s = setup(() => json(session()));
    await s.manager.login("challenge", "123456");
    const before = s.calls.length;
    await expect(
      s.manager.request("/mobile/customer/favorites/item", {
        method: "PUT",
        body: { active: true },
        ownerId: "other-owner",
      }),
    ).rejects.toThrow("OWNER_CHANGED");
    expect(s.calls.length).toBe(before);
  });
  it("does not restore credentials against a different API origin", async () => {
    const s = setup(() => json(session()));
    await s.manager.login("challenge", "123456");
    let requests = 0;
    const other = new SessionManager(
      s.storage,
      new ApiClient("https://other.invalid/api/v1", async () => {
        requests++;
        return json(user);
      }),
    );
    await other.restore();
    expect(other.getSnapshot().phase).toBe("guest");
    expect(requests).toBe(0);
  });
  it("retains an unacknowledged logout until the old family can actually be revoked", async () => {
    let offline = false;
    const s = setup((path) => {
      if (offline && path === "/mobile/auth/logout") throw new Error("offline");
      return json(session());
    });
    await s.manager.login("one", "123456");
    offline = true;
    await expect(s.manager.logout()).rejects.toBeInstanceOf(ApiError);
    const before = s.calls.filter((p) => p === "/mobile/auth/verify").length;
    await expect(s.manager.login("two", "123456")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(s.calls.filter((p) => p === "/mobile/auth/verify").length).toBe(
      before,
    );
    expect(JSON.parse(s.values.get(KEY)!).logoutPending).toBe(true);
  });
});
