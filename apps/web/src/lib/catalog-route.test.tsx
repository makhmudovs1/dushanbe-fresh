import { describe, expect, it, vi } from "vitest";
import CatalogPage from "../app/catalog/page";

vi.mock("@/components/catalog-data", () => ({ CatalogData: () => null }));

describe("async catalog route parameters", () => {
  it("preserves category and search after awaiting Next parameters", async () => {
    const page = await CatalogPage({ searchParams: Promise.resolve({ category: "vegetables", search: "картофель" }) });
    const data = page.props.children.props.children.props.children;
    expect(data.props).toMatchObject({ category: "vegetables", search: "картофель", withSidebar: true });
  });

  it("does not forward ambiguous repeated query parameters as arrays", async () => {
    const page = await CatalogPage({ searchParams: Promise.resolve({ category: ["vegetables", "fruit"], search: ["a", "b"] }) });
    expect(page.props.children.props.children.props.children.props).toMatchObject({ category: "", search: "" });
  });

  it("accepts an absent query", async () => {
    const page = await CatalogPage({});
    expect(page.props.children.props.children.props.children.props).toMatchObject({ category: "", search: "" });
  });
});
