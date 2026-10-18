import { getInitialCatalog } from "@/lib/catalog.server";
import { CatalogBrowser } from "./catalog-browser";

export async function CatalogData({ category = "", search = "", hideSearch = false, withSidebar = false }: { category?: string; search?: string; hideSearch?: boolean; withSidebar?: boolean }) {
  const data = await getInitialCatalog(category, search);
  return <CatalogBrowser key={`${category}:${search}`} initialCategory={category} initialSearch={search} hideSearch={hideSearch} withSidebar={withSidebar}
    initialCategories={data.categories} initialProducts={data.products} />;
}
