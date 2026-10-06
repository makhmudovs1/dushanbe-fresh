import { getInitialProduct } from "@/lib/catalog.server";
import { ProductDetail } from "./product-detail";

export async function ProductData({ slug }: { slug: string }) {
  const product = await getInitialProduct(slug);
  return <ProductDetail key={slug} slug={slug} initialProduct={product} />;
}
