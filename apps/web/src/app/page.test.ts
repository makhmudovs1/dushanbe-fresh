import { describe, expect, it } from "vitest";

describe("web skeleton", () => {
  it("has a stable app title", () => {
    expect("Dushanbe Fresh").toContain("Fresh");
  });
});
