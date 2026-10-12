import { serverI18n } from "@/i18n/server";
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
  const { t } = serverI18n();
  return (
    <main className="page">
      <section className="shell">
        <header className="page-heading">
          <h1>{t("Каталог")}</h1>
          <p>{t("Свежие продукты, доступные сегодня")}</p>
        </header>
        <Suspense key={searchParams?.category ?? ""} fallback={<ProductGridSkeleton />}>
          <CatalogData category={searchParams?.category ?? ""} />
        </Suspense>
      </section>
    </main>
  );
}
