# Mobile architecture — 17.11.2026

Current implementation: apps/mobile, Expo 58.0.26 / RN 0.88.1 New Architecture,
React 19.3, strict TS, Expo Router, TanStack Query, Expo Image, Reanimated and
Gesture Handler, react-native-maps, SecureStore. No WebView/DOM/Next/Leaflet/Node
imports in the runtime graph. WEB helper imports exist only in CLI sync/tests.

The integration branch is based on current WEB/API main 521b61e, with native
source restored from preserved feature/mobile-app@1e96057. It does not merge
old API code over main's newer Payom/native/customer implementation.

- app/: five tabs, native full-screen login, product sheet/gallery, map/address,
  checkout, private tracking/history, settings and deletion-request confirmation.
- src/api: bounded abortable requests, sanitized error categories, public DTO
  validation, capability gates; no browser Origin/Cookie impersonation.
- src/state: Query caches, foreground refresh, owner/API scoped stores, serialized
  SecureStore credentials/refresh/logout journals, durable guest/account cart and
  order submission. Server item price is authoritative; cached observation only
  detects a change. Cart quote reads current minimum, fees and totals.
- src/domain: decimal integer arithmetic for display, quantity validation,
  canonical checkout/request journal, cart revision/MAX conflict reconciliation,
  phone/name formatting parity, address snapshots, validated inbound links.
- src/design + assets: current WEB brand/fonts/geometry and real local images,
  product source facts copied by scripts/sync-brand.mjs. Unknown products use
  supplier fallback facts and server descriptions; new products need no APK.
- packages/shared: platform-compatible DTOs and pure rules only. Prisma, server
  secrets, Node and React DOM remain outside the mobile bundle.

The shared NestJS API/PostgreSQL/catalog/orders/admin/picking/courier services
remain the source of truth. Main already includes native access/refresh families,
structured profile and required checkout login. Native order controller injects
verified phone and delegates to the same quote/review/idempotency service.
Browser exact Origin/cookie checks and customer/staff separation are preserved.

Native geocoding is additive: bounded server Geoapify adapter matching current
WEB landmark/transliteration/exact-coordinate rules, short-lived hashed guest
grants, IP/user/global/day cost quotas. Key never goes to the phone. Production
currently returns 404 for native geocoder status: mobile degrades to manual
address/point entry rather than sending a fake Origin.

Account deletion is currently a **request** feature, not erased-data completion.
Capability is closed unless explicit flag, policy version and approved bilingual
retention notice are configured. Browser request uses cookie+exact Origin;
native uses its own bearer and rejects browser headers. User row lock, identity
recheck, unique request and all-device session/OTP revocation are transactional.
Displayed policy version and intended identity are server preconditions (409/412);
client IDs can never select another mutation target. Late browser logout is avoided.
No customer/order/financial records are deleted. Actual execution/retention,
notification, backup lifecycle and owner approval remain release blockers.

Production checkout is intentionally locked at both build profiles and runtime
policy until release acceptance. Integration writes require an explicit owned
local target plus matching test proof. Test gateway/runtime are excluded from
production tsc outputs. No fixed OTP or SMS bypass was introduced into src.

Two new additive migrations: 20261117140000_mobile_geocoder and
20261117143000_account_deletion_requests. Deployment and backwards-compatibility
rehearsal: MOBILE_BACKEND_DEPLOYMENT_20261117.md. No automatic deployment.

For WEB/API updates: fetch/review main, use an isolated integration branch, diff
public DTO/policy and CSS inputs, sync assets/translations, run cross-client
contracts and actual HTTP tests, regenerate CNG and inspect R8, then repeat native
screenshots. design-parity.sources.json records source inputs, never visual proof.
Current audit/results: MOBILE_RELEASE_2026.md. Original MVP exclusions remain
historical; the explicit native assignment extends that scope.
