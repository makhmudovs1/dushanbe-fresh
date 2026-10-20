import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { CategorySidebar } from "@/components/category-sidebar";
import { CategorySkeleton } from "@/components/loading-state";
import { getPublicCategories } from "@/lib/catalog.server";
import { serverI18n } from "@/i18n/server";
import { publicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("/categories", "Категории | Dushanbe Fresh", "Выберите категорию свежих продуктов Dushanbe Fresh.");

async function Categories() {
  return <CategorySidebar categories={await getPublicCategories()} categoryScreen />;
}

export default function CategoriesPage() {
  const { t } = serverI18n();
  return <main className="page mobile-categories-page"><div className="shell shop-shell">
    <header className="mobile-categories-heading"><Link href="/" aria-label={t("На главную")}><ArrowLeft size={22} aria-hidden="true" /></Link><h1>{t("Каталог")}</h1></header>
    <Suspense fallback={<CategorySkeleton />}><Categories /></Suspense>
  </div></main>;
}
