export type CategoryNode = { id: string; parentId?: string | null };

export function categoryDescendantIds<T extends CategoryNode>(categories: T[], rootId: string): string[] {
  const result = new Set([rootId]);
  const children = new Map<string, string[]>();
  for (const category of categories) if (category.parentId) {
    children.set(category.parentId, [...(children.get(category.parentId) ?? []), category.id]);
  }
  const queue = [rootId];
  for (let i = 0; i < queue.length; i++) for (const id of children.get(queue[i]) ?? []) {
    if (!result.has(id)) { result.add(id); queue.push(id); }
  }
  return [...result];
}

export function categoryAncestors<T extends CategoryNode>(categories: T[], id: string): string[] {
  const byId = new Map(categories.map(category => [category.id, category]));
  const result: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId); result.push(current.parentId); current = byId.get(current.parentId);
  }
  return result;
}

export function visibleCategoryTree<T extends CategoryNode & { isVisible?: boolean; isActive?: boolean; deletedAt?: unknown }>(categories: T[]): T[] {
  const available = new Set(categories.filter(category => category.isVisible !== false && category.isActive !== false && !category.deletedAt).map(category => category.id));
  return categories.filter(category => available.has(category.id) && categoryAncestors(categories, category.id).every(id => available.has(id)));
}
