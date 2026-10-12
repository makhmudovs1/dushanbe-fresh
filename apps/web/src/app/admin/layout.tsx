import { StaffLayout } from "@/components/staff-layout";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Команда");

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div lang="ru"><StaffLayout>{children}</StaffLayout></div>;
}
