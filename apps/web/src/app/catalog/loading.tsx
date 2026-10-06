import { CategorySkeleton, ProductGridSkeleton } from "@/components/loading-state";

export default function Loading() {
  return <main className="page"><section className="shell catalog-browser">
    <header className="page-heading"><h1>Каталог</h1><p>Свежие продукты, доступные сегодня</p></header>
    <CategorySkeleton /><ProductGridSkeleton />
  </section></main>;
}
