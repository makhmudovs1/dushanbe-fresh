import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Корзина");

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
