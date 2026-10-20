import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileCategoryTabs } from "./mobile-category-tabs";

const root = { id: "root", name: "Овощи", slug: "vegetables", sortOrder: 0 };
const child = { id: "child", parentId: "root", name: "Помидоры", slug: "tomatoes", sortOrder: 0 };
const hidden = { id: "hidden", parentId: "root", name: "Скрытая", slug: "hidden", sortOrder: 1, isVisible: false };
describe("mobile category tabs", () => {
  it("shows real visible children and an All link to the parent", () => {
    const html = renderToStaticMarkup(<MobileCategoryTabs categories={[root, child, hidden]} selected={root} />);
    expect(html).toContain('href="/catalog?category=vegetables"');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>Все<\/a>/);
    expect(html).toContain('href="/catalog?category=tomatoes"');
    expect(html).not.toContain("Скрытая");
  });
  it("retains the parent and sibling navigation on a direct child link", () => {
    const html = renderToStaticMarkup(<MobileCategoryTabs categories={[root, child]} selected={child} />);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>Помидоры<\/a>/);
    expect(html).toContain('href="/catalog?category=vegetables"');
  });
  it("does not invent tabs for a standalone category or all-products page", () => {
    expect(renderToStaticMarkup(<MobileCategoryTabs categories={[root]} selected={root} />)).toBe("");
    expect(renderToStaticMarkup(<MobileCategoryTabs categories={[root, child]} />)).toBe("");
  });
});
