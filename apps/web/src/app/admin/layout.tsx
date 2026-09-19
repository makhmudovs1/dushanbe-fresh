import { StaffLayout } from "@/components/staff-layout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <StaffLayout>{children}</StaffLayout>;
}
