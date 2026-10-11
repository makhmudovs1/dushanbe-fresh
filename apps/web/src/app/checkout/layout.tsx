import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Оформление заказа");

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
