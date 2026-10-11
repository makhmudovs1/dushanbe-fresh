import Link from "next/link";
import { Suspense } from "react";

import { ProductData } from "@/components/product-data";
import { ProductDetailSkeleton } from "@/components/loading-state";
import { getInitialProduct } from "@/lib/catalog.server";
import { privateMetadata, publicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const product = await getInitialProduct(params.slug);
  if (!product) return privateMetadata("Товар недоступен");
  const description = product.description?.trim() || `${product.name} с доставкой по Душанбе. Свежие продукты с местных рынков в Dushanbe Fresh.`;
  return publicMetadata(`/products/${encodeURIComponent(product.slug)}`, `${product.name} с доставкой в Душанбе | Dushanbe Fresh`, description.slice(0, 200));
}

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
