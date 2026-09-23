import Link from "next/link";

import { Product } from "@/lib/api";
import { unitLabel } from "@/lib/checkout";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link className="product-card__media" href={`/products/${product.slug}`}>
        <span>{product.name.slice(0, 1)}</span>
      </Link>
      <div className="product-card__body">
        <div>
          <div className="product-card__meta">
            <p className="product-card__category">{product.category.name}</p>
            <span>Сегодня в наличии</span>
          </div>
          <h3>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </h3>
        </div>
        <p className="product-card__description">{product.description}</p>
        <div className="product-card__footer">
          <strong>
            {product.sellingPrice} сомони / {unitLabel(product.unit)}
          </strong>
          <Link className="product-card__action" href={`/products/${product.slug}`}>
            Выбрать
          </Link>
        </div>
      </div>
    </article>
  );
}
