import { serverI18n } from "@/i18n/server";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { CategorySidebar } from "@/components/category-navigation";
import { CatalogBrowser } from "@/components/catalog-browser";
import { HomeCategorySections } from "@/components/home-category-sections";
import { HomePromotions } from "@/components/home-promotions";
import { HomePromotionsSkeleton, CategorySkeleton, ProductGridSkeleton } from "@/components/loading-state";
import { getPublicCategories, getPublicProducts } from "@/lib/catalog.server";
import { HOME_TITLE, SITE_DESCRIPTION, publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/", HOME_TITLE, SITE_DESCRIPTION);
export const dynamic = "force-dynamic";

async function Sidebar() { return <CategorySidebar categories={await getPublicCategories()} />; }
async function AvailableProducts() {
  const products = await getPublicProducts();
  return <CatalogBrowser initialCategories={[]} initialProducts={products?.slice(0, 8) ?? null} limit={8} />;
}
async function Sections() {
  const [categories, products] = await Promise.all([getPublicCategories(), getPublicProducts()]);
  return <><HomePromotions categories={categories} products={products} /><HomeCategorySections categories={categories} products={products} /></>;
}

export default function HomePage() {
  const { t } = serverI18n();
  return <main className="page storefront-page"><div className="shell shop-shell storefront-layout">
    <div className="storefront-sidebar-slot"><Suspense fallback={<CategorySkeleton />}><Sidebar /></Suspense></div>
    <div className="storefront-main">
      <Suspense fallback={<HomePromotionsSkeleton />}><Sections /></Suspense>
      <section className="storefront-section">
        <div className="section-heading storefront-section-heading"><h2>{t("Сегодня в наличии")}</h2>
          <Link className="storefront-more" href="/catalog">{t("Все продукты")}<ArrowRight size={16} aria-hidden="true" /></Link></div>
        <Suspense fallback={<ProductGridSkeleton />}><AvailableProducts /></Suspense>
      </section>
    </div>
  </div></main>;
}
