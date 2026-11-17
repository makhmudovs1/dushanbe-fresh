import type { AddressInput } from "@dushanbe-fresh/shared";
import { ApiClient, ApiError } from "./client";
export type Suggestion = AddressInput & { description?: string; placeName?: string };
export class GeocodingClient {
  private grant: { value: string; expiresAt: number } | null = null;
  private issuing: Promise<string> | null = null;
  constructor(
    private api: ApiClient,
    private accountRequest: (
      path: string,
      body: unknown,
      signal?: AbortSignal,
    ) => Promise<{ items: Suggestion[] }> | null,
  ) {}
  async status(signal?: AbortSignal) {
    try {
      return await this.api.request<{ enabled: boolean }>(
        "/mobile/geocoding/status",
        { signal },
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        return { enabled: false };
      throw error;
    }
  }
  private async capability() {
    if (this.grant && this.grant.expiresAt > Date.now() + 10000)
      return this.grant.value;
    if (this.issuing) return this.issuing;
    this.issuing = this.api
      .request<{ grant: string; expiresAt: string }>(
        "/mobile/geocoding/grant",
        { method: "POST", body: {} },
      )
      .then((result) => {
        if (
          !/^[a-f0-9]{64}$/.test(result.grant) ||
          !Number.isFinite(Date.parse(result.expiresAt))
        )
          throw new ApiError("response");
        this.grant = {
          value: result.grant,
          expiresAt: Date.parse(result.expiresAt),
        };
        return result.grant;
      })
      .finally(() => {
        this.issuing = null;
      });
    return this.issuing;
  }
  private async lookup(path: string, body: unknown, signal?: AbortSignal) {
    const account = this.accountRequest(path, body, signal);
    let result: { items: Suggestion[] };
    if (account) result = await account;
    else {
      const grant = await this.capability();
      try {
        result = await this.api.request(path, {
          method: "POST",
          body,
          signal,
          geocoderGrant: grant,
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        this.grant = null;
        result = await this.api.request(path, {
          method: "POST",
          body,
          signal,
          geocoderGrant: await this.capability(),
        });
      }
    }
    if (
      !Array.isArray(result.items) ||
      !result.items.every(
        (i) =>
          i &&
          typeof i.street === "string" &&
          typeof i.building === "string" &&
          typeof i.latitude === "number" &&
          Number.isFinite(i.latitude) &&
          Math.abs(i.latitude) <= 90 &&
          typeof i.longitude === "number" &&
          Number.isFinite(i.longitude) &&
          Math.abs(i.longitude) <= 180,
      )
    )
      throw new ApiError("response");
    return result.items;
  }
  search(query: string, language: "ru" | "tg", signal?: AbortSignal) {
    return this.lookup("/mobile/geocoding/search", { query, language }, signal);
  }
  reverse(
    point: { latitude: number; longitude: number },
    language: "ru" | "tg",
    signal?: AbortSignal,
  ) {
    return this.lookup(
      "/mobile/geocoding/reverse",
      { ...point, language },
      signal,
    );
  }
}
