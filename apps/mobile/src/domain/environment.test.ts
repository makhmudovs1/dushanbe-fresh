import { describe, expect, it } from "vitest";
import { runtimeEnvironment } from "./environment";
describe("build environment isolation", () => {
  it.each(["preview", "production"])(
    "defaults %s to current read-only HTTPS API",
    (environment) => {
      expect(runtimeEnvironment({ environment })).toMatchObject({
        apiUrl: "https://dushanbefresh.tj/api/v1",
        submissionEnabled: false,
      });
    },
  );
  it.each(["preview", "production", "staging", "development"])(
    "refuses injected test configuration in %s",
    (environment) => {
      expect(() =>
        runtimeEnvironment({
          environment,
          apiUrl: "https://dushanbefresh.tj/api/v1",
          submit: "true",
          runtimeId: "a".repeat(32),
        }),
      ).toThrow("ISOLATED_CHECKOUT_ONLY");
    },
  );
  it("requires an explicit private target and runtime identity for integration", () => {
    expect(() => runtimeEnvironment({ environment: "integration" })).toThrow();
    expect(() =>
      runtimeEnvironment({
        environment: "integration",
        apiUrl: "https://dushanbefresh.tj/api/v1",
        runtimeId: "a".repeat(32),
      }),
    ).toThrow("ISOLATED_RUNTIME_REQUIRED");
    expect(
      runtimeEnvironment({
        environment: "integration",
        apiUrl: "http://127.0.0.1:4119/api/v1",
        runtimeId: "a".repeat(32),
        submit: "true",
      }).submissionEnabled,
    ).toBe(true);
  });
  it("does not guess staging and rejects misspelled environments or insecure release media", () => {
    expect(() => runtimeEnvironment({ environment: "staging" })).toThrow();
    expect(() => runtimeEnvironment({ environment: "prodution" })).toThrow(
      "INVALID_APP_ENVIRONMENT",
    );
    expect(() =>
      runtimeEnvironment({
        environment: "preview",
        assetUrl: "http://images.invalid",
      }),
    ).toThrow("INVALID_ASSET_URL");
  });
});
