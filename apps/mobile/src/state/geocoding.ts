import { useQuery } from "@tanstack/react-query";
import { api } from "../api/config";
import { GeocodingClient, type Suggestion } from "../api/geocoding";
import { sessionManager } from "./session";
export const geocoding = new GeocodingClient(api, (path, body, signal) =>
  sessionManager.getSnapshot().phase === "account"
    ? sessionManager.request<{ items: Suggestion[] }>(path, {
        method: "POST",
        body,
        signal,
      })
    : null,
);
export function useGeocodingStatus() {
  return useQuery({
    queryKey: ["geocoding-status"],
    queryFn: ({ signal }) => geocoding.status(signal),
    staleTime: 60000,
  });
}
