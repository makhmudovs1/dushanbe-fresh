import { Suspense } from "react";
import { CatalogData } from "@/components/catalog-data";
import { ProductGridSkeleton } from "@/components/loading-state";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/catalog", "Каталог свежих продуктов с доставкой в Душанбе | Dushanbe Fresh", "Овощи, фрукты, зелень, орехи и сухофрукты с рынков Душанбе. Выбирайте доступные сегодня продукты и заказывайте доставку домой.");

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams
}: {
  searchParams?: Promise<{ category?: string | string[]; search?: string | string[] }>;
}) {
  const query = await searchParams;
  const category = typeof query?.category === "string" ? query.category : "";
  const search = typeof query?.search === "string" ? query.search : "";
  return (
    <main className="page storefront-page">
      <section className="shell shop-shell">
        <Suspense key={`${category}:${search}`} fallback={<ProductGridSkeleton />}>
          <CatalogData category={category} search={search} withSidebar />
        </Suspense>
      </section>
    </main>
  );
}
