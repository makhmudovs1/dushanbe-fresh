import { afterEach, describe, expect, it, vi } from "vitest";
import { cookieName, refreshCookie } from "./auth.controller";

afterEach(() => { vi.unstubAllEnvs(); });

describe("refresh cookie transport", () => {
  it("keeps local HTTP development working", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STAFF_COOKIE_SECURE", "false");
    expect(cookieName()).toBe("df_refresh");
    expect(refreshCookie("token")).not.toContain("Secure");
  });

  it("uses a host-only Secure HttpOnly cookie for HTTPS demos without changing NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STAFF_COOKIE_SECURE", "true");
    const cookie = refreshCookie("token");
    expect(cookie).toContain("__Secure-df_refresh=token");
    for (const attribute of ["; Secure", "; HttpOnly", "; SameSite=Lax", "; Path=/api/v1/auth"]) {
      expect(cookie).toContain(attribute);
    }
    expect(cookie).not.toContain("Domain=");
    const cleared = refreshCookie("");
    expect(cleared).toContain("__Secure-df_refresh=;");
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("; Secure");
  });

  it("cannot disable Secure cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STAFF_COOKIE_SECURE", "false");
    expect(cookieName()).toBe("__Secure-df_refresh");
    expect(refreshCookie("token")).toContain("; Secure");
  });
});
