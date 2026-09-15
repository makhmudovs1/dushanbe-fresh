import Link from "next/link";

import { ProductDetail } from "@/components/product-detail";

export default function ProductPage({ params }: { params: { slug: string } }) {
  return (
    <main className="page">
      <section className="shell content-section">
        <Link className="back-link" href="/catalog">
          Назад в каталог
        </Link>
        <ProductDetail slug={params.slug} />
      </section>
    </main>
  );
}
