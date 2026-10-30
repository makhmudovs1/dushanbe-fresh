import { Suspense } from "react";

import { ProductData } from "@/components/product-data";
import { ProductDetailSkeleton } from "@/components/loading-state";
import { getInitialProduct } from "@/lib/catalog.server";
import { privateMetadata, publicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getInitialProduct(slug);
  if (!product) return privateMetadata("Товар недоступен");
  const description = product.description?.trim() || `${product.name} с доставкой по Душанбе. Свежие продукты с местных рынков в Dushanbe Fresh.`;
  return publicMetadata(`/products/${encodeURIComponent(product.slug)}`, `${product.name} с доставкой в Душанбе | Dushanbe Fresh`, description.slice(0, 200));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="page product-route">
      <section className="shell content-section product-route__shell">
        <Suspense key={slug} fallback={<ProductDetailSkeleton />}>
          <ProductData slug={slug} />
        </Suspense>
      </section>
    </main>
  );
}
