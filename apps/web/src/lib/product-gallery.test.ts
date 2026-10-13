import { describe, expect, it } from "vitest";
import { productPhotos, swipeDirection } from "./product-gallery";

describe("gallery selection", () => {
  it("prefers sorted gallery with cover first, falls back to the legacy image or placeholder", () => {
    expect(productPhotos({ image: "/legacy", images: [
      { url: "/third", sortOrder: 3, isPrimary: false }, { url: "/cover", sortOrder: 2, isPrimary: true }, { url: "/first", sortOrder: 0, isPrimary: false }
    ] }).map(photo => photo.url)).toEqual(["/cover", "/first", "/third"]);
    expect(productPhotos({ image: "/legacy", images: [] })[0].url).toBe("/legacy");
    expect(productPhotos({ image: null })).toEqual([]);
  });
  it("detects horizontal swipes without stealing vertical scrolling or taps", () => {
    expect(swipeDirection(-60, 10)).toBe(1); expect(swipeDirection(60, 10)).toBe(-1);
    expect(swipeDirection(-20, 0)).toBe(0); expect(swipeDirection(-60, 80)).toBe(0);
  });
});
