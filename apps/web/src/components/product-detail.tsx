"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useCart } from "@/cart/cart-context";
import { getProduct, Product } from "@/lib/api";
import { priceUnitLabel } from "@/lib/format";
import { ProductDetailSkeleton } from "./loading-state";
import { ProductGallery } from "./product-gallery";
import { FavoriteButton } from "./favorite-button";
import { useMobileViewport } from "./use-mobile-viewport";
import { MobileProductSheet } from "./mobile-product-sheet";
import { useRouter } from "next/navigation";
import { ProductPrice, ProductDiscountBadge } from "./product-price";
import { ProductPurchaseActions } from "./product-purchase-actions";
import { ProductInformation } from "./product-information";
import { ProductRecommendations } from "./product-recommendations";
import styles from "./product-detail.module.css";

function MobileProductRoute({ initialProduct }: { initialProduct: Product | string }) {
  const router = useRouter();
  const close = useCallback(() => router.replace("/catalog"), [router]);
  const navigate = useCallback((href: string) => router.push(href), [router]);
  return <MobileProductSheet initialProduct={initialProduct} onClose={close} onNavigate={navigate} />;
}

export function ProductDetail({ slug, initialProduct }: { slug: string; initialProduct?: Product | null }) {
  const { t, name, locale } = useI18n();
  const { state } = useCart();
  const mobile = useMobileViewport();
  const [product, setProduct] = useState<Product | null>(initialProduct ?? null);
  const [error, setError] = useState<string | null>(initialProduct === null ? "Не удалось загрузить товар. Он может быть недоступен, либо возникла ошибка соединения." : null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (initialProduct !== undefined && retry === 0) return;
    let cancelled = false;
    setProduct(null);
    setError(null);
    void getProduct(slug)
      .then((nextProduct) => {
        if (cancelled) return;
        setProduct(nextProduct);
      })
      .catch(() => { if (!cancelled) setError("Не удалось загрузить товар. Он может быть недоступен, либо возникла ошибка соединения."); });
    return () => { cancelled = true; };
  }, [slug, retry, initialProduct]);

  if (mobile) return <MobileProductRoute initialProduct={product ?? slug} />;

  if (error) {
    return <div className="notice" role="alert"><p>{t(error)}</p>
      <button className="secondary-link" type="button" onClick={() => setRetry(retry + 1)}>{t("Повторить загрузку товара")}</button>
    </div>;
  }

  if (!product) {
    return <ProductDetailSkeleton />;
  }

  const inCart = state.items.some(item => item.productId === product.id);
  return <article className={`product-detail ${styles.page}`}>
    <nav className="catalog-breadcrumbs" aria-label={t("Хлебные крошки")}><ol>
      <li><Link href="/">{t("Главная")}</Link></li>
      <li><ChevronRight size={13} aria-hidden="true" /><Link href={`/catalog?category=${encodeURIComponent(product.category.slug)}`}>{name(product.category)}</Link></li>
      <li><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">{name(product)}</span></li>
    </ol></nav>
    <header className={styles.heading}>
      <h1>{name(product)} <span>{priceUnitLabel(product.unit, locale, product.slug)}</span></h1>
      <FavoriteButton product={product} />
    </header>
    <div className={styles.layout}>
      <ProductGallery product={product} eager thumbnails><ProductDiscountBadge product={product} /></ProductGallery>
      <div className={styles.information}>
        <div className={styles.purchase}>
          <ProductPrice product={product} />
          <div className={styles.actions}><ProductPurchaseActions product={product} />
            {inCart ? <Link href="/cart" className="primary-link">{t("Корзина")}<ArrowRight size={20} aria-hidden="true" /></Link> : null}
          </div>
        </div>
        <ProductInformation product={product} />
      </div>
    </div>
    <ProductRecommendations product={product} />
  </article>;
}
