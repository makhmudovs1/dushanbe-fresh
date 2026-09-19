export type StaffRole = "admin" | "picker" | "courier";
export type StaffUser = { id: string; email: string; name: string | null; role: StaffRole };
export type StaffLogin = { accessToken: string; user: StaffUser };
