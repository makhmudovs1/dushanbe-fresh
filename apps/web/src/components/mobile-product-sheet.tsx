"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Heart, Plus, RotateCw, Share2 } from "lucide-react";
import { useCart } from "@/cart/cart-context";
import { sumCartQuantities } from "@/cart/cart";
import { initialCatalogQuantity, isMinimumQuantity } from "@/cart/catalog-selection";
import { useI18n } from "@/i18n/provider";
import { getProduct, type Product } from "@/lib/api";
import { CatalogDialog } from "./catalog-dialog";
import { FavoriteButton } from "./favorite-button";
import { ProductGallery } from "./product-gallery";
import { ProductPrice } from "./product-price";
import { QuantityStepper } from "./quantity-stepper";
import { ProductSheetSelection } from "./mobile-product-sheet-provider";
import { BrowseAll, RecommendationGrid, selectRecommendations, useRecommendationProducts } from "./product-recommendations";
import styles from "./mobile-product-sheet.module.css";

export function isProductSheetDismissal(dx: number, dy: number) {
  return dy >= 72 && dy > Math.abs(dx);
}

export function MobileProductSheetCart({ product, ready }: { product: Product; ready: boolean }) {
  const { t, name } = useI18n();
  const { state, hydrated, addProduct, incrementItem, decrementItem, removeItem } = useCart();
  const items = state.items.filter(item => item.productId === product.id);
  const current = items.find(item => !item.qualityOptionId) ?? items[items.length - 1];
  const unavailable = product.isActive === false || product.isAvailableToday === false;
  const disabled = !ready || !hydrated || unavailable;

  return <footer className={styles.footer}>
    <ProductPrice product={product} />
    {!hydrated ? <span role="status" className={styles.cartPending}>{t("Загружаем количество в корзине")}</span> :
      unavailable ? <span role="status">{t("Товар больше недоступен.")}</span> :
        current ? <QuantityStepper name={name(product)} quantity={sumCartQuantities(items)} unit={product.unit}
          disabled={disabled} onIncrease={() => incrementItem(current)}
          onDecrease={() => isMinimumQuantity(current) ? removeItem(current) : decrementItem(current)} /> :
          <button className={styles.add} type="button" disabled={disabled}
            onClick={() => addProduct({ product, quantity: initialCatalogQuantity(product), qualityOptionId: null })}>
            <Plus size={20} aria-hidden="true" /><span>{t("В корзину")}</span>
          </button>}
  </footer>;
}

export function MobileProductSheet({ initialProduct, onClose }: {
  initialProduct: Product | string; onClose: () => void;
}) {
  const { t, name, description } = useI18n();
  const [selection, setSelection] = useState(initialProduct);
  const slug = typeof selection === "string" ? selection : selection.slug;
  const [product, setProduct] = useState<Product | null>(typeof initialProduct === "string" ? null : initialProduct);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const requestVersion = useRef(0);
  const [retry, setRetry] = useState(0);
  const [shareNotice, setShareNotice] = useState("");
  const [sharing, setSharing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const recommendedProducts = useRecommendationProducts();
  const excluded = new Set<string>();
  if (product) excluded.add(product.id);
  const recommendations = selectRecommendations(recommendedProducts, excluded, 12);
  const closingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressHandleClick = useRef(false);
  const href = `/products/${encodeURIComponent(slug)}`;
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  function selectProduct(next: Product | string) {
    if (closingRef.current) return;
    requestVersion.current++;
    setSelection(next);
    setProduct(typeof next === "string" ? null : next);
    setStatus("loading");
    setShareNotice("");
    setShowTop(false);
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }
  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 180);
  }

  useEffect(() => {
    let cancelled = false;
    const version = ++requestVersion.current;
    setStatus("loading");
    void getProduct(slug).then(next => {
      if (cancelled || version !== requestVersion.current) return;
      setProduct(next);
      setStatus("ready");
    }).catch(() => { if (!cancelled && version === requestVersion.current) setStatus("error"); });
    return () => { cancelled = true; };
  }, [slug, retry]);

  async function share() {
    setShareNotice("");
    setSharing(true);
    const url = new URL(href, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: product ? name(product) : t("Товар"), url });
      else {
        await navigator.clipboard.writeText(url);
        setShareNotice("Ссылка скопирована.");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setShareNotice("Не удалось поделиться ссылкой.");
    } finally { setSharing(false); }
  }

  return <CatalogDialog title={product ? name(product) : t("Товар")} busy={closing} onClose={requestClose} fitVisualViewport
    closeLabel={t("Закрыть товар")} className={`${styles.viewport}${closing ? ` ${styles.closing}` : ""}`}
    surfaceClassName={styles.sheet}>
    <div className={styles.toolbar}>
      <button className={styles.icon} type="button" onClick={() => void share()} disabled={sharing}
        aria-label={t("Поделиться товаром")} title={t("Поделиться товаром")}><Share2 size={21} aria-hidden="true" /></button>
      {product ? <FavoriteButton product={product} /> :
        <button className={styles.icon} type="button" disabled aria-label={t("Добавить в избранное")}
          title={t("Добавить в избранное")}><Heart size={21} aria-hidden="true" /></button>}
      <button className={styles.handle} type="button" aria-label={t("Закрыть товар")}
        title={t("Закрыть товар")} onClick={event => {
          if (event.detail === 0 || !suppressHandleClick.current) requestClose();
          suppressHandleClick.current = false;
        }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          suppressHandleClick.current = false;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.closest("dialog")?.setAttribute("data-dragging", "true");
        }}
        onPointerMove={event => {
          if (drag.current?.id !== event.pointerId) return;
          const dy = Math.max(0, Math.min(200, event.clientY - drag.current.y));
          event.currentTarget.closest("dialog")?.style.setProperty("--sheet-drag", `${dy}px`);
        }}
        onPointerUp={event => {
          const start = drag.current;
          drag.current = null;
          if (start?.id !== event.pointerId) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          suppressHandleClick.current = Math.hypot(dx, dy) > 8;
          event.currentTarget.closest("dialog")?.removeAttribute("data-dragging");
          event.currentTarget.closest("dialog")?.style.removeProperty("--sheet-drag");
          if (isProductSheetDismissal(dx, dy)) requestClose();
        }}
        onPointerCancel={event => { drag.current = null; event.currentTarget.closest("dialog")?.removeAttribute("data-dragging"); event.currentTarget.closest("dialog")?.style.removeProperty("--sheet-drag"); }}
        onLostPointerCapture={event => { drag.current = null; event.currentTarget.closest("dialog")?.removeAttribute("data-dragging"); event.currentTarget.closest("dialog")?.style.removeProperty("--sheet-drag"); }}><span aria-hidden="true" /></button>
    </div>
    <p role="status" aria-live="polite" className={styles.shareNotice} hidden={!shareNotice}>{shareNotice ? t(shareNotice) : null}</p>
    <div className={styles.scrollArea}>
    <div className={styles.content} ref={contentRef} onScroll={event => setShowTop(event.currentTarget.scrollTop > 320)}>
      {product ? <ProductGallery product={product} eager /> : null}
      <div className={styles.details}>
        {product ? <>
          <h2>{name(product)}</h2>
          <p className={styles.category}>{name(product.category)}</p>
          <p className={styles.description}>{description(product)}</p>
          {product.isWeighted ? <p>{t("Для продуктов на вес итоговая сумма может немного измениться после сборки.")}</p> : null}
        </> : <h2>{t("Товар")}</h2>}
        {status === "loading" ? <p role="status">{t("Загружаем карточку товара")}</p> : null}
        {status === "error" ? <div role="alert">
          <p>{t("Не удалось загрузить товар. Он может быть недоступен, либо возникла ошибка соединения.")}</p>
          <button className={styles.retry} type="button" onClick={() => setRetry(value => value + 1)}>
            <RotateCw size={18} aria-hidden="true" />{t("Повторить загрузку товара")}
          </button>
        </div> : null}
      </div>
      {recommendations.length ? <section className={styles.recommendations} aria-labelledby="product-recommendations-title">
        <h2 id="product-recommendations-title">{t("Может, ещё кое-что?")}</h2>
        <ProductSheetSelection onSelect={selectProduct}><RecommendationGrid products={recommendations} /></ProductSheetSelection>
        <BrowseAll />
      </section> : null}
    </div>
    {showTop ? <button className={styles.scrollTop} type="button" aria-label={t("Наверх")} title={t("Наверх")}
      onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
      <ArrowUp size={22} aria-hidden="true" /></button> : null}
    </div>
    {product ? <MobileProductSheetCart product={product} ready={status === "ready"} /> : null}
  </CatalogDialog>;
}
