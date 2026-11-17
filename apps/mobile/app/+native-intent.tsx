import { parseIncomingLink } from "../src/domain/deep-links";
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (!path.includes("://")) return path;
  const link = parseIncomingLink(path);
  if (!link) return "/";
  if (link.kind === "product")
    return `/product/${encodeURIComponent(link.slug)}`;
  if (link.kind === "category")
    return `/(tabs)/categories?category=${encodeURIComponent(link.slug)}`;
  return `/order/${link.token}`;
}
