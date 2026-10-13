import sources from "./product-photo-sources.json";

export function photoAttribution(url?: string) {
  if (!url) return null;
  try {
    const path = new URL(url, "https://catalog.invalid").pathname;
    return sources.find(source => source.imageUrl === path && source.license.startsWith("CC BY")) ?? null;
  } catch {
    return null;
  }
}
