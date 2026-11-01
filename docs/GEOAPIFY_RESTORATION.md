# Geoapify: restoration and key rotation

## Scope

This release changes only the Web address picker and its server-side geocoding
routes. The existing API, PostgreSQL, delivery-zone validation, order snapshots
and Payom pilot must remain unchanged.

Production had no Geoapify credentials or explicit Web origin after migration.
Its capabilities endpoint therefore reported unavailable; moving the map could
not produce a reverse-geocoded address. Autocomplete also unnecessarily forced
street-only results, excluding named districts and landmarks.

## Credentials

Two independent replacement keys are used. Server geocoding is restricted to
the TARENA outgoing IPv4. The Web runtime prefers IPv4 DNS results because the
VPS also has an IPv6 route not on this allowlist. The browser tile key is
restricted by origin/referrer to the apex and www production domains. CORS alone
is not an access restriction. The account plan is unchanged.

Fresh credentials are installed outside Git in
`/srv/dushanbe-fresh/state/secrets/geoapify-20261101.env` (0600, deploy-owned).
The existing root-owned app/web ENV files are not rewritten. The supplemental
ENV also sets `WEB_ORIGIN=https://dushanbefresh.tj`. The public tile key is
intentionally browser-visible and is supplied to the local build through a
BuildKit secret mount. The server key must never enter build inputs or assets.

An unused newly generated server key was exposed in a diagnostic exception.
It was revoked with explicit approval before deployment; only its replacement
is installed. After successful public desktop/mobile checks, the two old project
keys were removed with explicit confirmation. Only the fresh browser/server pair
remains; production search and map checks passed again after revocation.

## Address behavior

- Autocomplete accepts real streets, houses, districts and landmarks within
  Dushanbe. Named places never become fabricated street/house data.
- An empty Tajik-spelling search can retry normalized spelling; no results or
  coordinates are manufactured.
- Suggestions respect an enabled delivery polygon. Server zone validation is
  unchanged.
- The center pin keeps the selected coordinates. Reverse results update street
  and house, not the coordinates; stale/aborted requests cannot overwrite newer
  selections.
- The previous visible label remains while the map is moving or resolving.
  Failed/empty reverse results offer manual clarification without losing the
  point, apartment, entrance, floor or courier instructions.
- Positron is the default light Geoapify tile style. Required attribution stays
  visible. OSM remains the fallback when no tile key is configured.

## Rollout

`stage-geoapify.cjs` reads private local key files and passes them via SSH stdin
to `stage-geoapify.py`. Staging requires a real successful geocoding response,
an allowed tile request, and a denied request from an untrusted origin.

`deploy-geoapify-web.py` warms a separate Web container on loopback port 3003,
checks autocomplete/reverse before routing, validates Caddy configuration and
reloads it gracefully. Failure restores the previous TARENA Web route. It never
falls back to the compromised server. API/database/proxy process identities,
root ENV hashes and SMS pilot ledger hashes must remain unchanged.

No paid SMS, customer order or account mutation is part of this rollout.
