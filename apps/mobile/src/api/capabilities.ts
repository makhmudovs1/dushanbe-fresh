import type { MobileAuthStatus } from "@dushanbe-fresh/shared";
import { ApiClient, ApiError } from "./client";
export async function readAuthStatus(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<MobileAuthStatus> {
  try {
    const status = await api.request<MobileAuthStatus>("/mobile/auth/status", {
      signal,
    });
    if (
      !status ||
      [status.available, status.enabled, status.requiredForCheckout].some(
        (v) => typeof v !== "boolean",
      ) ||
      (status.enabled && !status.available)
    )
      throw new ApiError("response");
    return status;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const legacy = await api.request<{ requiredForCheckout: boolean }>(
      "/customer-auth/status",
      { signal },
    );
    if (!legacy || typeof legacy.requiredForCheckout !== "boolean")
      throw new ApiError("response");
    return {
      available: false,
      enabled: false,
      requiredForCheckout: legacy.requiredForCheckout,
    };
  }
}
