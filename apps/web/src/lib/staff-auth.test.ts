import { describe, expect, it } from "vitest";
import type { StaffRole, StaffUser } from "@dushanbe-fresh/shared";
import { canOpenStaffPage, staffHome } from "./staff-auth";

const user = (roles: StaffRole[]): StaffUser => ({ id: "ali", email: "ali@test.local", name: "Али", roles });
describe("multi-role staff navigation", () => {
  it("keeps picker/courier on a single wave workspace", () => {
    for (const roles of [["picker"], ["courier"], ["picker", "courier"]] as StaffRole[][]) {
      expect(staffHome(user(roles))).toBe("/admin/delivery-waves");
      expect(canOpenStaffPage("/admin/delivery-waves/wave-1", user(roles))).toBe(true);
      expect(canOpenStaffPage("/admin/orders/order-1", user(roles))).toBe(true);
      expect(canOpenStaffPage("/admin/settings/staff", user(roles))).toBe(false);
      expect(canOpenStaffPage("/admin", user(roles))).toBe(false);
    }
  });
  it("gives administrative navigation to any user with the admin role", () => {
    const admin = user(["picker", "admin"]);
    expect(staffHome(admin)).toBe("/admin/orders");
    expect(canOpenStaffPage("/admin/settings/staff", admin)).toBe(true);
  });
});
