import { describe, expect, it } from "vitest";
import { parseFavorites, toggleFavorite } from "./favorites";

describe("guest favorites", () => {
  it("loads saved IDs, deduplicates and ignores malformed values", () => {
    expect(parseFavorites('["a","a",null,7,"b",""]')).toEqual(["a", "b"]);
  });
  it.each([null, "bad json", "null", "{}"])("handles unavailable/corrupt storage: %s", raw => { expect(parseFavorites(raw)).toEqual([]); });
  it("toggles independently of cart state and keeps the original array", () => {
    const ids = ["a"];
    expect(toggleFavorite(ids, "b")).toEqual(["a", "b"]);
    expect(toggleFavorite(ids, "a")).toEqual([]);
    expect(ids).toEqual(["a"]);
  });
  it("limits unexpected data in storage", () => { expect(parseFavorites(JSON.stringify(Array.from({ length: 600 }, (_, i) => String(i))))).toHaveLength(500); });
});
