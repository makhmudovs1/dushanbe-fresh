"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isWithinDeliveryBounds, type CityBounds } from "@/lib/delivery-address";

export function useDeliveryGeolocation(onPoint: (point: { latitude: number; longitude: number }) => void, bounds: CityBounds) {
  const callback = useRef(onPoint); callback.current = onPoint;
  const request = useRef(0);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { request.current++; }, []);
  const cancel = useCallback(() => { request.current++; setLocating(false); setError(""); }, []);
  function locate() {
    const id = ++request.current;
    setError("");
    if (!navigator.geolocation) { setError("Геолокация недоступна. Укажите адрес вручную."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (id !== request.current) return;
      setLocating(false);
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      if (!isWithinDeliveryBounds(point, bounds)) { setError("Точка за пределами зоны выбора в Душанбе"); return; }
      callback.current(point);
    }, () => {
      if (id !== request.current) return;
      setError("Не удалось определить местоположение. Укажите адрес вручную."); setLocating(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  return { locate, cancel, locating, error };
}
