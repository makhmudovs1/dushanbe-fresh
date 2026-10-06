// Early seed versions referenced files that were never supplied with the project.
export function catalogImage(image: string | null | undefined) {
  if (!image?.trim() || image.startsWith("/img/products/") || image === "/images/product-placeholder.svg") return null;
  return image;
}
