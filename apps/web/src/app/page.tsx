import Link from "next/link";
import { Suspense } from "react";

import { CatalogData } from "@/components/catalog-data";
import { ProductGridSkeleton } from "@/components/loading-state";

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
  return (
    <main className="page">
      <section className="shell home-hero">
        <div className="hero__content">
          <p className="eyebrow">С рынков Душанбе</p>
          <h1>Свежие продукты с доставкой домой</h1>
          <p>
            Мы сами выберем свежие овощи и фрукты на рынке и доставим в удобное
            время.
          </p>
          <Link className="primary-link" href="/catalog">
            Перейти в каталог
          </Link>
        </div>
        <div className="hero-benefits" aria-label="Преимущества">
          <div>
            <strong>Свежий выбор</strong>
            <span>То, что есть на рынке сегодня</span>
          </div>
          <div>
            <strong>Соберём для вас</strong>
            <span>Выберем овощи, фрукты и зелень</span>
          </div>
          <div>
            <strong>Привезём домой</strong>
            <span>Без поездок и тяжёлых пакетов</span>
          </div>
        </div>
      </section>

      <section className="shell content-section" id="categories">
        <div className="section-heading">
          <div>
            <h2>Категории</h2>
          </div>
        </div>
        <div className="category-card-grid">
          {categories.map((category) => (
            <Link className="category-card" href={`/catalog?category=${category.slug}`} key={category.slug}>
              <span>{category.name.slice(0, 1)}</span>
              <strong>{category.name}</strong>
              <p>{category.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="shell content-section">
        <div className="section-heading">
          <div>
            <h2>Сегодня в наличии</h2>
          </div>
          <Link className="secondary-link" href="/catalog">
            Весь каталог
          </Link>
        </div>
        <Suspense fallback={<ProductGridSkeleton />}><CatalogData hideSearch /></Suspense>
      </section>
    </main>
  );
}
