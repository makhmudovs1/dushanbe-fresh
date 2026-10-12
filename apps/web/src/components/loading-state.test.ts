import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartSkeleton, CategorySkeleton, CheckoutSkeleton, DeliverySlotsSkeleton, ProductDetailSkeleton, ProductGridSkeleton, SummarySkeleton } from "./loading-state";
import { ProductImage } from "./product-image";

describe("initial loading markup", () => {
  it.each([CartSkeleton, CategorySkeleton, CheckoutSkeleton, DeliverySlotsSkeleton, ProductDetailSkeleton, ProductGridSkeleton, SummarySkeleton])(
    "%s renders an accessible status and placeholders without waiting for JavaScript or API",
    Component => {
      const html = renderToStaticMarkup(createElement(Component));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('class="skeleton ');
      expect(html).not.toContain('<input');
      expect(html).not.toContain('<button');
    }
  );

  it("does not claim a cart is empty before localStorage hydration", () => {
    const html = renderToStaticMarkup(createElement(CartSkeleton));
    expect(html).toContain('<h1>Корзина</h1>');
    expect(html).not.toContain('Корзина пока пустая');
  });

  it("renders catalog images lazily with asynchronous decoding and reserved dimensions", () => {
    const html = renderToStaticMarkup(createElement(ProductImage, { src: '/test.jpg', name: 'Помидоры' }));
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="640" height="480"');
    expect(html).toContain('alt="Помидоры"');
  });

  it("loads the main product photo eagerly and keeps a fallback when no URL exists", () => {
    expect(renderToStaticMarkup(createElement(ProductImage, { src: '/test.jpg', name: 'Помидоры', eager: true }))).toContain('loading="eager"');
    const fallback = renderToStaticMarkup(createElement(ProductImage, { src: null, name: 'Помидоры' }));
    expect(fallback).toContain('/brand/dushanbe-fresh-icon.png');
    expect(fallback).toContain('фото пока нет');
    expect(fallback).not.toContain('П</span>');
  });
});
