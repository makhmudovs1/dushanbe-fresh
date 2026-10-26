import { NextResponse } from "next/server";
import { addressSearchConfig, isAddressSearchOriginAllowed, parseAddressLanguage, parseAddressPoint, readBoundedJson, reverseDeliveryAddress } from "@/lib/delivery-address-search";
import { reserveAddressRequest } from "@/lib/address-search-limit";

export const dynamic = "force-dynamic";
function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request) {
  if (!isAddressSearchOriginAllowed(request, process.env)) return reply({ status: "invalid", items: [] }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ status: "invalid", items: [] }, 415);
  const config = addressSearchConfig(process.env);
  let input: unknown;
  try { input = await readBoundedJson(request.body, 2048); } catch { return reply({ status: "invalid", items: [] }, 400); }
  const point = parseAddressPoint(input);
  if (!point) return reply({ status: "invalid", items: [] }, 400);
  if (config.provider !== "geoapify") return reply({ status: "unavailable", items: [] });
  const release = reserveAddressRequest();
  if (!release) return reply({ status: "unavailable", items: [] }, 429);
  try {
    const language = parseAddressLanguage((input as { language?: unknown }).language);
    const items = await reverseDeliveryAddress(point, config, request.signal, language);
    return reply({ status: items === null ? "unavailable" : "available", items: items ?? [] });
  } finally { release(); }
}
