import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogBreadcrumbs } from "./catalog-breadcrumbs";

const root = { id: "root", slug: "vegetables", name: "Овощи", sortOrder: 10 };
const child = { id: "child", parentId: "root", slug: "tomatoes", name: "Помидоры", sortOrder: 20 };
describe("catalog breadcrumbs", () => {
  it("keeps home linked and marks the selected category as the current page", () => {
    const html = renderToStaticMarkup(<CatalogBreadcrumbs categories={[root]} category={root} search={false} />);
    expect(html).toContain('href="/"');
    expect(html).toContain('aria-current="page">Овощи');
  });
  it("links real ancestors for a direct child URL without inventing subcategories", () => {
    const html = renderToStaticMarkup(<CatalogBreadcrumbs categories={[root, child]} category={child} search={false} />);
    expect(html).toContain('href="/catalog?category=vegetables"');
    expect(html).toContain('aria-current="page">Помидоры');
    expect(html.indexOf("Овощи")).toBeLessThan(html.indexOf("Помидоры"));
  });
  it("shows search as the current page and retains the category link", () => {
    const html = renderToStaticMarkup(<CatalogBreadcrumbs categories={[root]} category={root} search />);
    expect(html).toContain('href="/catalog?category=vegetables"');
    expect(html).toContain('aria-current="page">Результаты поиска');
  });
});
