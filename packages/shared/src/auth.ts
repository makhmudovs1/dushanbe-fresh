export type StaffRole = "admin" | "picker" | "courier";
export type StaffUser = { id: string; email: string; name: string | null; roles: StaffRole[] };
export type StaffLogin = { accessToken: string; user: StaffUser };
export type StaffEmployee = StaffUser & { status: "active" | "inactive"; assignments: Array<{ id: string; role: "picker" | "courier"; status: string }> };
