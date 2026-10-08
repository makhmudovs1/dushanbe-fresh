import { AdminCatalog } from "@/components/admin-catalog";

export default function AdminPage() {
  return (
    <main className="page">
      <section className="shell">
        <header className="page-heading"><h1>Каталог</h1></header>
        <AdminCatalog />
      </section>
    </main>
  );
}
