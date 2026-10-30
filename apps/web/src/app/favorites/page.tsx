import { Suspense } from "react";
import { CategorySidebar } from "@/components/category-navigation";
import { FavoritesBrowser } from "@/components/favorites-browser";
import { CategorySkeleton, ProductGridSkeleton } from "@/components/loading-state";
import { getPublicCategories, getPublicProducts } from "@/lib/catalog.server";
import { serverI18n } from "@/i18n/server";
import { privateMetadata } from "@/lib/seo";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export const metadata = privateMetadata("Избранное");
export const dynamic = "force-dynamic";
async function Sidebar() { return <CategorySidebar categories={await getPublicCategories()} />; }
async function Products() { return <FavoritesBrowser products={await getPublicProducts()} />; }

export default async function FavoritesPage() {
  const { t } = await serverI18n();
  return <main className="page storefront-page favorites-page"><div className="shell shop-shell">
    <header className="page-heading favorites-page-heading"><nav className="catalog-breadcrumbs" aria-label={t("Хлебные крошки")}><ol><li><Link href="/">{t("Главная")}</Link></li><li><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">{t("Любимое")}</span></li></ol></nav><h1>{t("Любимое")}</h1></header>
    <div className="storefront-layout">
    <div className="storefront-sidebar-slot"><Suspense fallback={<CategorySkeleton />}><Sidebar /></Suspense></div>
    <div className="storefront-main"><Suspense fallback={<ProductGridSkeleton />}><Products /></Suspense></div>
  </div></div></main>;
}
