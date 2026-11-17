export class ApiError extends Error {
  constructor(
    readonly code: "network" | "timeout" | "http" | "response" | "cancelled",
    readonly status = 0,
    readonly data?: unknown,
  ) {
    super(code);
  }
}
export function normalizeApiUrl(value: string, release = false): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (release && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/$/, "") !== "/api/v1"
  )
    throw new Error("INVALID_API_URL");
  return url.href.replace(/\/$/, "");
}
export function mediaUrl(
  value: string | null | undefined,
  baseUrl: string,
  assetBaseUrl?: string,
): string | undefined {
  if (!value || value.startsWith("//") || value.includes("\\"))
    return undefined;
  try {
    const url = new URL(
      value,
      value.startsWith("/storefront/") && assetBaseUrl
        ? assetBaseUrl
        : new URL(baseUrl).origin,
    );
    return url.protocol === "https:" ||
      (url.protocol === "http:" && new URL(baseUrl).protocol === "http:")
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private transport: typeof fetch = fetch,
    private timeoutMs = 12000,
  ) {}
  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      accessToken?: string;
      geocoderGrant?: string;
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    let decoded = path.split("?")[0]!;
    try {
      for (let pass = 0; pass < 3; pass++)
        decoded = decodeURIComponent(decoded);
    } catch {
      throw new Error("INVALID_PATH");
    }
    if (
      !path.startsWith("/") ||
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      decoded.split("/").some((part) => part === "." || part === "..")
    )
      throw new Error("INVALID_PATH");
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.transport(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        headers: {
          Accept: "application/json",
          ...(options.geocoderGrant
            ? { "X-DF-Geocoder-Grant": options.geocoderGrant }
            : {}),
          ...(options.accessToken
            ? { Authorization: `Bearer ${options.accessToken}` }
            : {}),
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ApiError("response", response.status);
      }
      if (!response.ok) throw new ApiError("http", response.status, data);
      return data as T;
    } catch (error) {
      if (timedOut) throw new ApiError("timeout");
      if (options.signal?.aborted) throw new ApiError("cancelled");
      if (error instanceof ApiError) throw error;
      throw new ApiError("network");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
  }
}
export function retryRead(attempt: number, error: Error) {
  return (
    attempt < 2 &&
    error instanceof ApiError &&
    (error.code === "network" ||
      error.code === "timeout" ||
      error.status >= 500)
  );
}
