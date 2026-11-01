import { describe, expect, it } from "vitest";
import { CUSTOMER_OTP_LENGTH, editableName, formatNationalPhone, nationalPhone } from "./customer-login";

describe("customer login presentation", () => {
  it("accepts national input and international paste without duplicating the prefix", () => {
    for (const value of ["90 000 00 01", "+992 90 000 00 01", "992900000001"]) expect(nationalPhone(value)).toBe("900000001");
    expect(formatNationalPhone(nationalPhone("+992900000001"))).toBe("90 000 00 01");
    expect(nationalPhone("9a0b")).toBe("90");
    expect(nationalPhone("+79990000000")).toBe("");
    expect(formatNationalPhone("90")).toBe("90");
    expect(CUSTOMER_OTP_LENGTH).toBe(6);
  });
  it("prefers explicit parts but only suggests a split for legacy display names", () => {
    const old = { id: "test", name: "Ситора Алиева", phone: "+992900000001", phoneVerifiedAt: "" };
    expect(editableName(old)).toEqual({ firstName: "Ситора", lastName: "Алиева" });
    expect(old.name).toBe("Ситора Алиева");
    expect(editableName({ ...old, firstName: "Фирӯза", lastName: "Саидова" })).toEqual({ firstName: "Фирӯза", lastName: "Саидова" });
    expect(editableName({ ...old, name: "Ситора" })).toEqual({ firstName: "Ситора", lastName: "" });
  });
});
