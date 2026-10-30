import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { CategoryShowcase } from "@/components/home-category-sections";
import { CategorySidebar } from "@/components/category-sidebar";
import { CategorySkeleton } from "@/components/loading-state";
import { getPublicCategories, getPublicProducts } from "@/lib/catalog.server";
import { serverI18n } from "@/i18n/server";
import { publicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("/categories", "Категории | Dushanbe Fresh", "Выберите категорию свежих продуктов Dushanbe Fresh.");

async function Categories() {
  const [categories, products] = await Promise.all([getPublicCategories(), getPublicProducts()]);
  return <><div className="category-screen--desktop"><CategorySidebar categories={categories} categoryScreen /></div>
    <div className="category-screen--mobile"><CategoryShowcase categories={categories} products={products} /></div></>;
}

export default async function CategoriesPage() {
  const { t } = await serverI18n();
  return <main className="page mobile-categories-page"><div className="shell shop-shell">
    <header className="mobile-categories-heading"><Link href="/" aria-label={t("На главную")}><ArrowLeft size={22} aria-hidden="true" /></Link><h1>{t("Каталог")}</h1></header>
    <Suspense fallback={<CategorySkeleton />}><Categories /></Suspense>
  </div></main>;
}
