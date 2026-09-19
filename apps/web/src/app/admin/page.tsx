import { AdminCatalog } from "@/components/admin-catalog";

export default function AdminPage() {
  return (
    <main className="page">
      <section className="shell hero hero--compact">
        <p className="eyebrow">Админка</p>
        <h1>Админка каталога</h1>
        <p>Базовое управление категориями, товарами, ценами и доступностью.</p>
      </section>
      <section className="shell content-section">
        <AdminCatalog />
      </section>
    </main>
  );
}
