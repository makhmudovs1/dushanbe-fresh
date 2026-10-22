import { describe, expect, it } from "vitest";
import { mobileDockTop } from "./use-mobile-dock";

describe("mobile navigation document anchor", () => {
  it("stays at the visible bottom while the document scrolls", () => {
    expect(mobileDockTop(844, 0, 0, 56)).toBe(788);
    expect(mobileDockTop(844, 0, 1200, 56)).toBe(1988);
  });
  it("accounts for Safari viewport offset, reduced height and bottom safe area", () => {
    expect(mobileDockTop(610, 24, 500, 90)).toBe(1044);
  });
  it("does not place an oversized dock above the document", () => {
    expect(mobileDockTop(30, 0, 0, 56)).toBe(0);
  });
});
