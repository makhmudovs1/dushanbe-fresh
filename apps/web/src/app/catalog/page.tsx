import { Suspense } from "react";
import { CatalogData } from "@/components/catalog-data";
import { ProductGridSkeleton } from "@/components/loading-state";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/catalog", "Каталог свежих продуктов с доставкой в Душанбе | Dushanbe Fresh", "Овощи, фрукты, зелень, орехи и сухофрукты с рынков Душанбе. Выбирайте доступные сегодня продукты и заказывайте доставку домой.");

export const dynamic = "force-dynamic";

export default function CatalogPage({
  searchParams
}: {
  searchParams?: { category?: string; search?: string };
}) {
  return (
    <main className="page storefront-page">
      <section className="shell shop-shell">
        <Suspense key={`${searchParams?.category}:${searchParams?.search}`} fallback={<ProductGridSkeleton />}>
          <CatalogData category={searchParams?.category ?? ""} search={searchParams?.search ?? ""} withSidebar />
        </Suspense>
      </section>
    </main>
  );
}
