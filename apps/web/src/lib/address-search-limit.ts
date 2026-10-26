// A bounded per-process quota guard shared by autocomplete and reverse geocoding.
// Multi-instance deployments also need an edge/shared limit; no client IP is stored.
let windowStart = 0, used = 0, active = 0;
export function reserveAddressRequest(now = Date.now()): (() => void) | null {
  if (now - windowStart >= 60000) { windowStart = now; used = 0; }
  if (used >= 60 || active >= 4) return null;
  used++; active++;
  let released = false;
  return () => { if (!released) { released = true; active--; } };
}
