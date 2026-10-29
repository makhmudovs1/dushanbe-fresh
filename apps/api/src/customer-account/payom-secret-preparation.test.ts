import { createRequire } from "node:module";
import * as util from "node:util";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const parseEnv = (util as typeof util & { parseEnv(source: string): Record<string, string> }).parseEnv;
const { prepareOtpEnvironment } = createRequire(resolve(process.cwd(), "package.json"))("../../scripts/prepare-payom-otp-secret.cjs") as { prepareOtpEnvironment(source: string): string | null };

describe("operator-only private OTP secret generation", () => {
  it("generates a strong secret without changing flags or other environment settings", () => {
    const source = "# private server config\nCUSTOMER_AUTH_ENABLED=false\nCUSTOMER_REQUIRE_PHONE=false\nOTHER_KEY=private-value\n";
    const next = prepareOtpEnvironment(source)!;
    expect(next).toContain(source);
    const env = parseEnv(next);
    expect(env.CUSTOMER_OTP_SECRET).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(env.OTHER_KEY).toBe("private-value");
    expect(prepareOtpEnvironment(next)).toBeNull();
  });
  it.each(["CUSTOMER_OTP_SECRET=", 'CUSTOMER_OTP_SECRET=""', "CUSTOMER_OTP_SECRET='' # placeholder"])("replaces exactly one empty placeholder: %s", value => {
    const next = prepareOtpEnvironment(`${value}\n`)!;
    expect(next.match(/CUSTOMER_OTP_SECRET=/g)).toHaveLength(1);
    expect(parseEnv(next).CUSTOMER_OTP_SECRET).toHaveLength(64);
  });
  it("never rotates an existing secret or permits writing during enabled production auth", () => {
    expect(prepareOtpEnvironment("CUSTOMER_OTP_SECRET=existing-private-value\n")).toBeNull();
    expect(() => prepareOtpEnvironment("CUSTOMER_AUTH_ENABLED=true\n")).toThrow();
    expect(() => prepareOtpEnvironment("CUSTOMER_REQUIRE_PHONE=true\n")).toThrow();
    expect(() => prepareOtpEnvironment("CUSTOMER_OTP_SECRET=\nCUSTOMER_OTP_SECRET=\n")).toThrow();
  });
});
