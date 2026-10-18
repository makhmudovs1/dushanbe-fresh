// Query-only navigation on Next 13: retain the router-owned history state as opaque
// data and notify its popstate listener, without refetching the entire RSC page.
export function updateCatalogLocation(target: string): boolean {
  if (typeof window === "undefined" || window.location.pathname !== "/catalog" || !window.history.state) return false;
  const url = new URL(target, window.location.origin);
  if (url.origin !== window.location.origin || url.pathname !== "/catalog") return false;
  if (window.location.href === url.href) return true;
  window.history.pushState(window.history.state, "", url.pathname + url.search);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  return true;
}
