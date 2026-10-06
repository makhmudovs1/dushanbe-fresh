import Link from "next/link";
import { Suspense } from "react";

import { ProductData } from "@/components/product-data";
import { ProductDetailSkeleton } from "@/components/loading-state";

export const dynamic = "force-dynamic";

export default function ProductPage({ params }: { params: { slug: string } }) {
  return (
    <main className="page">
      <section className="shell content-section">
        <Link className="back-link" href="/catalog">
          Назад в каталог
        </Link>
        <Suspense key={params.slug} fallback={<ProductDetailSkeleton />}>
          <ProductData slug={params.slug} />
        </Suspense>
      </section>
    </main>
  );
}
