import { privateMetadata } from "@/lib/seo";

export const metadata = { ...privateMetadata("Ваш заказ"), referrer: "no-referrer" as const };

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
