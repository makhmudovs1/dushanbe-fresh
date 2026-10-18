export function catalogSearchUrl(category: string, search: string) {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (search.trim()) query.set("search", search.trim());
  return `/catalog${query.size ? `?${query}` : ""}`;
}
