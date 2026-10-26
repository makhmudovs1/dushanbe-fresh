"use client";
import { useCallback, useEffect, useState } from "react";
import { parseDeliveryZone, type DeliveryZone } from "@dushanbe-fresh/shared";

export function useDeliveryZone() {
  const [zone, setZone] = useState<DeliveryZone | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 5000);
    setStatus("loading");
    void fetch("/api/v1/delivery-zone", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const value = parseDeliveryZone(await response.json());
      if (!value) throw new Error("Invalid configuration");
      if (active) { setZone(value); setStatus("ready"); }
    }).catch(() => { if (active) { setZone(null); setStatus("unavailable"); } }).finally(() => clearTimeout(timer));
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [revision]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return { zone, status, refresh };
}
