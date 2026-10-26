import { expect, it } from "vitest";
import { reserveAddressRequest } from "./address-search-limit";

it("bounds concurrency and request bursts, then recovers without storing IPs", () => {
  const now = Date.now();
  const slots = Array.from({ length: 4 }, () => reserveAddressRequest(now));
  expect(slots.every(Boolean)).toBe(true);
  expect(reserveAddressRequest(now)).toBeNull();
  for (const release of slots) { release?.(); release?.(); }
  for (let index = 0; index < 56; index++) {
    const release = reserveAddressRequest(now);
    expect(release).not.toBeNull(); release?.();
  }
  expect(reserveAddressRequest(now)).toBeNull();
  const release = reserveAddressRequest(now + 60000);
  expect(release).not.toBeNull(); release?.();
});
