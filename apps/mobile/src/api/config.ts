import { runtimeEnvironment } from "../domain/environment";
import { ApiClient } from "./client";
const config = runtimeEnvironment({
  environment: process.env.EXPO_PUBLIC_APP_ENV,
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  assetUrl: process.env.EXPO_PUBLIC_ASSET_URL,
  submit: process.env.EXPO_PUBLIC_ENABLE_ORDER_SUBMISSION,
  runtimeId: process.env.EXPO_PUBLIC_TEST_RUNTIME_ID,
});
export const environment = config.environment;
export const api = new ApiClient(config.apiUrl);
export const orderSubmissionEnabled = config.submissionEnabled;
export async function assertTestOrderTarget() {
  if (!orderSubmissionEnabled) throw new Error("SUBMISSION_DISABLED");
  const proof = await api.request<{ runtimeId: string; isolated: boolean }>(
    "/mobile-test/runtime",
  );
  if (
    !proof.isolated ||
    proof.runtimeId !== process.env.EXPO_PUBLIC_TEST_RUNTIME_ID
  )
    throw new Error("TEST_RUNTIME_MISMATCH");
}

export const assetBaseUrl = config.assetUrl;
