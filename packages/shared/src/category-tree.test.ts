import { describe, expect, it } from "vitest";
import { categoryAncestors, categoryDescendantIds, visibleCategoryTree } from "./category-tree";

const tree = [{ id: "a", parentId: null }, { id: "b", parentId: "a" }, { id: "c", parentId: "b" }, { id: "d", parentId: null }];
describe("category tree", () => {
  it("finds a subtree without unrelated categories", () => {
    expect(categoryDescendantIds(tree, "a")).toEqual(["a", "b", "c"]);
    expect(categoryDescendantIds(tree, "b")).toEqual(["b", "c"]);
  });
  it("expands ancestors on a direct child URL", () => { expect(categoryAncestors(tree, "c")).toEqual(["b", "a"]); });
  it("hides a navigation subtree without changing its source records", () => {
    const input = tree.map(category => ({ ...category, isVisible: category.id !== "a" }));
    expect(visibleCategoryTree(input).map(category => category.id)).toEqual(["d"]);
    expect(input[1].isVisible).toBe(true);
  });
  it("does not render orphaned navigation entries", () => {
    expect(visibleCategoryTree([{ id: "child", parentId: "missing" }])).toEqual([]);
  });
  it("does not loop on malformed input", () => {
    expect(categoryDescendantIds([{ id: "a", parentId: "b" }, { id: "b", parentId: "a" }], "a")).toEqual(["a", "b"]);
  });
});
