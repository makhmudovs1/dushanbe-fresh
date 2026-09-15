import { CatalogBrowser } from "@/components/catalog-browser";

export default function CatalogPage() {
  return (
    <main className="page">
      <section className="shell hero hero--compact">
        <p className="eyebrow">Каталог</p>
        <h1>Свежие продукты на сегодня</h1>
        <p>Выберите категорию или найдите товар по названию.</p>
      </section>
      <section className="shell content-section">
        <CatalogBrowser />
      </section>
    </main>
  );
}
