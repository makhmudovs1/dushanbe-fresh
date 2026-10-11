import { StaffLayout } from "@/components/staff-layout";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Команда");

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <StaffLayout>{children}</StaffLayout>;
}
