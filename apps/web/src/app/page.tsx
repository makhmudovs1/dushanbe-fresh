import { serverI18n } from "@/i18n/server";
import Link from "next/link";
import { Suspense } from "react";

import { CatalogData } from "@/components/catalog-data";
import { ProductGridSkeleton } from "@/components/loading-state";
import { HOME_TITLE, SITE_DESCRIPTION, publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/", HOME_TITLE, SITE_DESCRIPTION);

export const dynamic = "force-dynamic";

const categories = [
  { name: "Овощи", slug: "vegetables", description: "Помидоры, огурцы, картофель" },
  { name: "Фрукты", slug: "fruits", description: "Яблоки, бананы, лимоны" },
  { name: "Зелень", slug: "greens", description: "Укроп, петрушка, кинза" },
  {
    name: "Орехи и сухофрукты",
    slug: "nuts-dried-fruits",
    description: "Орехи, курага и сезонные сухофрукты"
  }
];

export default function HomePage() {
  const { t, name } = serverI18n();
  return (
    <main className="page">
      <section className="shell home-hero">
        <div className="hero__content">
          <p className="eyebrow">{t("С рынков Душанбе")}</p>
          <h1>{t("Свежие продукты с доставкой домой")}</h1>
          <p>{t(" Мы сами выберем свежие овощи и фрукты на рынке и доставим в удобное время. ")}</p>
          <Link className="primary-link" href="/catalog">{t(" Перейти в каталог ")}</Link>
        </div>
        <div className="hero-benefits" aria-label={t("Преимущества")}>
          <div>
            <strong>{t("Свежий выбор")}</strong>
            <span>{t("То, что есть на рынке сегодня")}</span>
          </div>
          <div>
            <strong>{t("Соберём для вас")}</strong>
            <span>{t("Выберем овощи, фрукты и зелень")}</span>
          </div>
          <div>
            <strong>{t("Привезём домой")}</strong>
            <span>{t("Без поездок и тяжёлых пакетов")}</span>
          </div>
        </div>
      </section>

      <section className="shell content-section" id="categories">
        <div className="section-heading">
          <div>
            <h2>{t("Категории")}</h2>
          </div>
        </div>
        <div className="category-card-grid">
          {categories.map((category) => (
            <Link className="category-card" href={`/catalog?category=${category.slug}`} key={category.slug}>
              <span>{name(category).slice(0, 1)}</span>
              <strong>{name(category)}</strong>
              <p>{t(category.description)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="shell content-section">
        <div className="section-heading">
          <div>
            <h2>{t("Сегодня в наличии")}</h2>
          </div>
          <Link className="secondary-link" href="/catalog">{t(" Весь каталог ")}</Link>
        </div>
        <Suspense fallback={<ProductGridSkeleton />}><CatalogData hideSearch /></Suspense>
      </section>
    </main>
  );
}
