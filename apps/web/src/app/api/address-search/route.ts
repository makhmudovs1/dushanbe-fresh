import { NextResponse } from "next/server";
import { addressSearchConfig, isAddressSearchOriginAllowed, parseAddressQuery, readBoundedJson, searchDeliveryAddresses } from "@/lib/delivery-address-search";
import { DELIVERY_CITY } from "@/lib/delivery-address";

export const dynamic = "force-dynamic";

function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

// Configuration availability only; a configured adapter is not necessarily reachable.
export async function GET() {
  const config = addressSearchConfig(process.env);
  return reply({ status: config.url ? "configured" : "unavailable", city: DELIVERY_CITY, bounds: config.bounds });
}

export async function POST(request: Request) {
  if (!isAddressSearchOriginAllowed(request, process.env)) return reply({ status: "invalid", items: [] }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ status: "invalid", items: [] }, 415);
  let query: string | null;
  try {
    const input = await readBoundedJson(request.body, 2048);
    query = parseAddressQuery(input && typeof input === "object" ? (input as { query?: unknown }).query : null);
  } catch { return reply({ status: "invalid", items: [] }, 400); }
  if (!query) return reply({ status: "invalid", items: [] }, 400);
  const config = addressSearchConfig(process.env);
  const items = await searchDeliveryAddresses(query, config, request.signal);
  return reply({ status: items === null ? "unavailable" : "available", items: items ?? [] });
}
