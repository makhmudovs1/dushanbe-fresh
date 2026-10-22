import { describe, expect, it } from "vitest";
import { dialogViewport } from "./use-dialog-viewport";

describe("product dialog visible viewport", () => {
  it("uses the actual visible height and offset, not the layout viewport", () => {
    expect(dialogViewport({ height: 540, offsetTop: 44 }, 844)).toEqual({ height: 540, top: 44 });
  });
  it("falls back without VisualViewport", () => {
    expect(dialogViewport(null, 664)).toEqual({ height: 664, top: 0 });
  });
  it.each([0, -1, NaN, Infinity])("ignores transient invalid height %s", height => {
    expect(dialogViewport({ height, offsetTop: -15 }, 664)).toEqual({ height: 664, top: 0 });
  });
  it("ignores an invalid viewport offset", () => {
    expect(dialogViewport({ height: 664, offsetTop: NaN }, 844)).toEqual({ height: 664, top: 0 });
  });
});
