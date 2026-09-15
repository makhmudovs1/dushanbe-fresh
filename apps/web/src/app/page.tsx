import Link from "next/link";

import { CatalogBrowser } from "@/components/catalog-browser";

export default function HomePage() {
  return (
    <main className="page">
      <section className="shell hero">
        <p className="eyebrow">Свежие продукты с рынков Душанбе</p>
        <h1>Dushanbe Fresh</h1>
        <p>
          Овощи, фрукты, зелень, орехи и сухофрукты с быстрым выбором свежих
          позиций на сегодня.
        </p>
        <Link className="primary-link" href="/catalog">
          Открыть каталог
        </Link>
      </section>
      <section className="shell content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Сегодня доступно</p>
            <h2>Популярные товары</h2>
          </div>
        </div>
        <CatalogBrowser />
      </section>
    </main>
  );
}
