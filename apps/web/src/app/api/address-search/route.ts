import { NextResponse } from "next/server";
import { addressSearchConfig, isAddressSearchOriginAllowed, parseAddressLanguage, parseAddressQuery, readBoundedJson, searchDeliveryAddresses } from "@/lib/delivery-address-search";
import { reserveAddressRequest } from "@/lib/address-search-limit";
import { DELIVERY_CITY } from "@/lib/delivery-address";

export const dynamic = "force-dynamic";

function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

// Configuration availability only; a configured adapter is not necessarily reachable.
export async function GET() {
  const config = addressSearchConfig(process.env);
  return reply({ status: config.url ? "configured" : "unavailable", reverse: config.provider === "geoapify", provider: config.provider ?? null, city: DELIVERY_CITY, bounds: config.bounds });
}

export async function POST(request: Request) {
  if (!isAddressSearchOriginAllowed(request, process.env)) return reply({ status: "invalid", items: [] }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ status: "invalid", items: [] }, 415);
  let query: string | null;
  let language: "ru" | "tg" = "ru";
  try {
    const input = await readBoundedJson(request.body, 2048);
    query = parseAddressQuery(input && typeof input === "object" ? (input as { query?: unknown }).query : null);
    language = parseAddressLanguage(input && typeof input === "object" ? (input as { language?: unknown }).language : null);
  } catch { return reply({ status: "invalid", items: [] }, 400); }
  if (!query) return reply({ status: "invalid", items: [] }, 400);
  const config = addressSearchConfig(process.env);
  if (!config.url) return reply({ status: "unavailable", items: [] });
  const release = reserveAddressRequest();
  if (!release) return reply({ status: "unavailable", items: [] }, 429);
  try {
    const items = await searchDeliveryAddresses(query, config, request.signal, language);
    return reply({ status: items === null ? "unavailable" : "available", items: items ?? [] });
  } finally { release(); }
}
