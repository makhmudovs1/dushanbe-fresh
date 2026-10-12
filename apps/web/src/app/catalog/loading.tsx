import { CategorySkeleton, ProductGridSkeleton } from "@/components/loading-state";
import { serverI18n } from "@/i18n/server";

export default function Loading() {
  const { t } = serverI18n();
  return <main className="page"><section className="shell catalog-browser">
    <header className="page-heading"><h1>{t("Каталог")}</h1><p>{t("Свежие продукты, доступные сегодня")}</p></header>
    <CategorySkeleton /><ProductGridSkeleton />
  </section></main>;
}
