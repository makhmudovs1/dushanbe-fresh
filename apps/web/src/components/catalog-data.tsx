import { getInitialCatalog } from "@/lib/catalog.server";
import { CatalogBrowser } from "./catalog-browser";

export async function CatalogData({ category = "", hideSearch = false }: { category?: string; hideSearch?: boolean }) {
  const data = await getInitialCatalog(category);
  return <CatalogBrowser key={category} initialCategory={category} hideSearch={hideSearch}
    initialCategories={data.categories} initialProducts={data.products} />;
}
