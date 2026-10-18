import { serverI18n } from "@/i18n/server";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { CategoryCards, CategorySidebar } from "@/components/category-navigation";
import { CatalogBrowser } from "@/components/catalog-browser";
import { HomeCategorySections } from "@/components/home-category-sections";
import { CategoryCardsSkeleton, CategorySkeleton, ProductGridSkeleton } from "@/components/loading-state";
import { getPublicCategories, getPublicProducts } from "@/lib/catalog.server";
import { HOME_TITLE, SITE_DESCRIPTION, publicMetadata } from "@/lib/seo";
import { featuredCategories } from "@/lib/storefront";

export const metadata = publicMetadata("/", HOME_TITLE, SITE_DESCRIPTION);
export const dynamic = "force-dynamic";

async function Sidebar() { return <CategorySidebar categories={await getPublicCategories()} />; }
async function Selections() {
  const [categories, products] = await Promise.all([getPublicCategories(), getPublicProducts()]);
  return <CategoryCards categories={categories ? featuredCategories(categories, products ?? []) : null} />;
}
async function AvailableProducts() {
  const products = await getPublicProducts();
  return <CatalogBrowser initialCategories={[]} initialProducts={products?.slice(0, 4) ?? null} />;
}
async function Sections() {
  const [categories, products] = await Promise.all([getPublicCategories(), getPublicProducts()]);
  return <HomeCategorySections categories={categories} products={products} />;
}

export default function HomePage() {
  const { t } = serverI18n();
  return <main className="page storefront-page"><div className="shell shop-shell storefront-layout">
    <div className="storefront-sidebar-slot"><Suspense fallback={<CategorySkeleton />}><Sidebar /></Suspense></div>
    <div className="storefront-main">
      <div className="storefront-heading"><h1>{t("Свежие продукты")}</h1></div>
      <Suspense fallback={<CategoryCardsSkeleton />}><Selections /></Suspense>
      <section className="storefront-section">
        <div className="section-heading storefront-section-heading"><h2>{t("Сегодня в наличии")}</h2>
          <Link className="storefront-more" href="/catalog">{t("Все продукты")}<ArrowRight size={16} aria-hidden="true" /></Link></div>
        <Suspense fallback={<ProductGridSkeleton />}><AvailableProducts /></Suspense>
      </section>
      <Suspense fallback={null}><Sections /></Suspense>
    </div>
  </div></main>;
}
