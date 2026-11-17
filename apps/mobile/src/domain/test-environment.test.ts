import { describe, expect, it } from "vitest";
import { isLocalTestTarget } from "./test-environment";
describe("test checkout boundary", () => {
  it("cannot be enabled for production or public staging by a build flag", () => {
    for (const environment of [
      "production",
      "preview",
      "staging",
      "development",
      "integration",
    ])
      expect(
        isLocalTestTarget(
          environment,
          "https://dushanbefresh.tj/api/v1",
          true,
          "a".repeat(32),
        ),
      ).toBe(false);
  });
  it("requires an explicit isolated runtime capability even for loopback", () => {
    expect(
      isLocalTestTarget(
        "integration",
        "http://127.0.0.1:4119/api/v1",
        true,
        undefined,
      ),
    ).toBe(false);
    expect(
      isLocalTestTarget(
        "integration",
        "http://127.0.0.1:4119/api/v1",
        true,
        "a".repeat(32),
      ),
    ).toBe(true);
  });
});
