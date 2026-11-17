import { describe, expect, it } from "vitest";
import {
  editableName,
  formatNationalPhone,
  nationalPhone,
  validNameParts,
} from "./customer";
import {
  nationalPhone as webPhone,
  formatNationalPhone as webFormat,
  editableName as webName,
} from "../../../web/src/lib/customer-login";
describe("current WEB/native customer contracts", () => {
  it.each([
    "+992 90 123 45 67",
    "901234567",
    "992901234567",
    "+7 901234567",
    "",
    "992901234567000",
  ])("keeps the same phone mask and normalization: %s", (value) => {
    expect(nationalPhone(value)).toBe(webPhone(value));
    expect(formatNationalPhone(nationalPhone(value))).toBe(
      webFormat(webPhone(value)),
    );
  });
  it("preserves explicit multiword names and only suggests parts for legacy names", () => {
    for (const user of [
      null,
      {
        id: "one",
        name: "Муҳаммад Али Саидов",
        phone: "+992901234567",
        phoneVerifiedAt: "2026-01-01",
        firstName: "Муҳаммад Али",
        lastName: "Саидов",
      },
      {
        id: "two",
        name: "Прежний клиент",
        phone: "+992901234568",
        phoneVerifiedAt: "2026-01-01",
      },
    ])
      expect(editableName(user)).toEqual(webName(user));
  });
  it("accepts both languages and enforces the server's name limits", () => {
    expect(validNameParts(" Маҳмуд ", " Саидов ")).toBe(true);
    expect(validNameParts("Ситора", "Алиева")).toBe(true);
    for (const [first, last] of [
      ["", "Алиева"],
      ["Ситора", " "],
      ["x".repeat(51), "y"],
      ["x".repeat(50), "y".repeat(50)],
      ["bad\nname", "user"],
    ])
      expect(validNameParts(first!, last!)).toBe(false);
  });
});
