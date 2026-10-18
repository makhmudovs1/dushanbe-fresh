import { Suspense } from "react";
import { CategorySidebar } from "@/components/category-navigation";
import { FavoritesBrowser } from "@/components/favorites-browser";
import { CategorySkeleton, ProductGridSkeleton } from "@/components/loading-state";
import { getPublicCategories, getPublicProducts } from "@/lib/catalog.server";
import { serverI18n } from "@/i18n/server";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Избранное");
export const dynamic = "force-dynamic";
async function Sidebar() { return <CategorySidebar categories={await getPublicCategories()} />; }
async function Products() { return <FavoritesBrowser products={await getPublicProducts()} />; }

export default function FavoritesPage() {
  const { t } = serverI18n();
  return <main className="page storefront-page"><div className="shell shop-shell storefront-layout">
    <div className="storefront-sidebar-slot"><Suspense fallback={<CategorySkeleton />}><Sidebar /></Suspense></div>
    <div className="storefront-main"><header className="page-heading"><h1>{t("Избранное")}</h1></header>
      <Suspense fallback={<ProductGridSkeleton />}><Products /></Suspense></div>
  </div></main>;
}
