import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";
describe("guest phone identity", () => {
  it("normalizes local numbers and international E.164 without relying on names", () => {
    expect(normalizePhone("900 00-00-00")).toBe("+992900000000");
    expect(normalizePhone("+992 (900) 00-00-00")).toBe("+992900000000");
    expect(normalizePhone("+44 20 7946 0000")).toBe("+442079460000");
    expect(normalizePhone("2025550123", { countryCode: "1", nationalLength: 10 })).toBe("+12025550123");
  });
  it.each(["", "Farid", "+00000000", "123"])("rejects invalid phone %s", value => expect(() => normalizePhone(value)).toThrow());
});
