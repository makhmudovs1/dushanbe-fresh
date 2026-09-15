import { AdminCatalog } from "@/components/admin-catalog";

export default function AdminPage() {
  return (
    <main className="page">
      <section className="shell hero hero--compact">
        <p className="eyebrow">Admin</p>
        <h1>Catalog admin</h1>
        <p>
          Управление категориями и товарами. Auth для admin API появится перед
          production.
        </p>
      </section>
      <section className="shell content-section">
        <AdminCatalog />
      </section>
    </main>
  );
}
