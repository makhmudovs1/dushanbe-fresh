import Link from "next/link";

import { Product } from "@/lib/api";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link className="product-card__media" href={`/products/${product.slug}`}>
        <span>{product.name.slice(0, 1)}</span>
      </Link>
      <div className="product-card__body">
        <div>
          <p className="product-card__category">{product.category.name}</p>
          <h3>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </h3>
        </div>
        <p className="product-card__description">{product.description}</p>
        <div className="product-card__footer">
          <strong>
            {product.sellingPrice} сомони / {product.unit}
          </strong>
          <button disabled>В корзину</button>
        </div>
      </div>
    </article>
  );
}
