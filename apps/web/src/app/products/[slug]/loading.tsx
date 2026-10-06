import Link from "next/link";
import { ProductDetailSkeleton } from "@/components/loading-state";

export default function Loading() {
  return <main className="page"><section className="shell content-section">
    <Link className="back-link" href="/catalog">Назад в каталог</Link>
    <ProductDetailSkeleton />
  </section></main>;
}
