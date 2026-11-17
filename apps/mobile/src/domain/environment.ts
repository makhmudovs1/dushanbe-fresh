import { normalizeApiUrl } from "../api/client";
import { isLocalTestTarget } from "./test-environment";
export type AppEnvironment =
  | "development"
  | "integration"
  | "preview"
  | "staging"
  | "production";
export function runtimeEnvironment(input: {
  environment?: string;
  apiUrl?: string;
  assetUrl?: string;
  submit?: string;
  runtimeId?: string;
}) {
  const environment = input.environment ?? "development";
  if (
    ![
      "development",
      "integration",
      "preview",
      "staging",
      "production",
    ].includes(environment)
  )
    throw new Error("INVALID_APP_ENVIRONMENT");
  if (["integration", "staging"].includes(environment) && !input.apiUrl)
    throw new Error("EXPLICIT_API_URL_REQUIRED");
  const release = ["preview", "staging", "production"].includes(environment);
  const apiUrl = normalizeApiUrl(
    input.apiUrl ??
      (release
        ? "https://dushanbefresh.tj/api/v1"
        : "http://localhost:4000/api/v1"),
    release,
  );
  if (
    environment !== "integration" &&
    (input.submit === "true" || input.runtimeId)
  )
    throw new Error("ISOLATED_CHECKOUT_ONLY");
  if (
    environment === "integration" &&
    !isLocalTestTarget(environment, apiUrl, true, input.runtimeId)
  )
    throw new Error("ISOLATED_RUNTIME_REQUIRED");
  const assetUrl = new URL(input.assetUrl ?? new URL(apiUrl).origin);
  if (
    !["http:", "https:"].includes(assetUrl.protocol) ||
    assetUrl.username ||
    assetUrl.password ||
    assetUrl.search ||
    assetUrl.hash ||
    (release && assetUrl.protocol !== "https:")
  )
    throw new Error("INVALID_ASSET_URL");
  return {
    environment: environment as AppEnvironment,
    apiUrl,
    assetUrl: assetUrl.href.replace(/\/$/, ""),
    submissionEnabled: isLocalTestTarget(
      environment,
      apiUrl,
      input.submit === "true",
      input.runtimeId,
    ),
  };
}
