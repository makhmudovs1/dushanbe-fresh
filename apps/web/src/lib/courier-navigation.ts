export function courierNavigation(address: { latitude?: number | null; longitude?: number | null }) {
  const { latitude, longitude } = address;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, url: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}` };
}
