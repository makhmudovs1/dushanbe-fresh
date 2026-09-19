import { CatalogBrowser } from "@/components/catalog-browser";

export default function CatalogPage({
  searchParams
}: {
  searchParams?: { category?: string };
}) {
  return (
    <main className="page">
      <section className="shell">
        <header className="page-heading">
          <h1>Каталог</h1>
          <p>Свежие продукты, доступные сегодня</p>
        </header>
        <CatalogBrowser initialCategory={searchParams?.category ?? ""} />
      </section>
    </main>
  );
}
