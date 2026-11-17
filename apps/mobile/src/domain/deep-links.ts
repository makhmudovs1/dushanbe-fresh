export type IncomingLink =
  | { kind: "product"; slug: string }
  | { kind: "category"; slug: string }
  | { kind: "tracking"; token: string };
export function parseIncomingLink(value: string): IncomingLink | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    if (url.protocol === "https:" && url.origin !== "https://dushanbefresh.tj")
      return null;
    if (!["https:", "dushanbefresh:"].includes(url.protocol)) return null;
    const encodedPath =
      url.protocol === "dushanbefresh:"
        ? `/${url.hostname}${url.pathname}`
        : url.pathname;
    const path = decodeURIComponent(encodedPath);
    const product = path.match(/^\/products\/([\p{L}\p{N}_-]{1,200})\/?$/u);
    if (product && !url.search) return { kind: "product", slug: product[1]! };
    const tracking = path.match(/^\/order\/([a-f0-9]{64})\/?$/);
    if (tracking && !url.search)
      return { kind: "tracking", token: tracking[1]! };
    if (path === "/catalog" || path === "/catalog/") {
      if ([...url.searchParams.keys()].some((k) => k !== "category"))
        return null;
      const slug = url.searchParams.get("category") ?? "";
      return /^[\p{L}\p{N}_-]{0,200}$/u.test(slug)
        ? { kind: "category", slug }
        : null;
    }
    return null;
  } catch {
    return null;
  }
}
