import { Suspense } from "react";
import { CatalogData } from "@/components/catalog-data";
import { ProductGridSkeleton } from "@/components/loading-state";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/catalog", "Каталог свежих продуктов с доставкой в Душанбе | Dushanbe Fresh", "Овощи, фрукты, зелень, орехи и сухофрукты с рынков Душанбе. Выбирайте доступные сегодня продукты и заказывайте доставку домой.");

export const dynamic = "force-dynamic";

export default function CatalogPage({
  searchParams
}: {
  searchParams?: { category?: string };
}) {
  return (
    <main className="page">
      <section className="shell">
        <header className="page-heading">
          <h1>Каталог</h1>
          <p>Свежие продукты, доступные сегодня</p>
        </header>
        <Suspense key={searchParams?.category ?? ""} fallback={<ProductGridSkeleton />}>
          <CatalogData category={searchParams?.category ?? ""} />
        </Suspense>
      </section>
    </main>
  );
}
