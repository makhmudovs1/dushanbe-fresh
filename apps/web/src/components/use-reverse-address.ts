"use client";
import { useEffect, useState } from "react";
import type { AddressInput } from "@dushanbe-fresh/shared";
import { isWithinDeliveryBounds, parseAddressSuggestion, type AddressSuggestion, type CityBounds } from "@/lib/delivery-address";
import { useI18n } from "@/i18n/provider";

export function useReverseAddress(value: AddressInput, bounds: CityBounds, enabled = true) {
  const { locale } = useI18n();
  const { latitude, longitude } = value;
  const key = JSON.stringify([latitude, longitude, locale]);
  const [result, setResult] = useState<{ key: string; status: "searching" | "available" | "empty" | "unavailable"; address?: AddressSuggestion }>({ key: "", status: "empty" });
  useEffect(() => {
    if (!enabled || latitude == null || longitude == null || !isWithinDeliveryBounds({ latitude, longitude }, bounds)) return;
    const controller = new AbortController();
    let active = true;
    setResult({ key, status: "searching" });
    const deadline = setTimeout(() => controller.abort(), 6500);
    const timer = setTimeout(() => {
      void (async () => {
        const config = await fetch("/api/address-search", { cache: "no-store", signal: controller.signal });
        if (!config.ok || (await config.json()).reverse !== true) throw new Error("Unavailable");
        const response = await fetch("/api/address-reverse", { method: "POST", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude, longitude, language: locale }) });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (data?.status !== "available" || !Array.isArray(data.items)) throw new Error("Unavailable");
        const address = parseAddressSuggestion(data.items[0]);
        if (active) setResult(address?.street && isWithinDeliveryBounds(address, bounds)
          ? { key, status: "available", address: { ...address, latitude, longitude } } : { key, status: "empty" });
      })().catch(() => { if (active) setResult({ key, status: "unavailable" }); });
    }, 400);
    return () => { active = false; clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
  }, [latitude, longitude, locale, bounds, key, enabled]);
  return enabled && result.key === key && latitude != null && longitude != null ? result : null;
}
