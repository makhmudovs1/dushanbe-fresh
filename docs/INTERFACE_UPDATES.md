# Customer Interface Updates, 2026-10-21

Initially verified locally. Web rollout on 2026-10-22 is recorded in
`WEB_RELEASE_20261022.md`. No new migrations in this UI task.
The existing uncommitted customer-account migration belongs to the preceding
account feature and remains subject to its own launch checklist.

## Behavior

- One language icon opens the RU/TJ chooser at all sizes; existing cookie
  persistence remains. Mobile header omits cart and collapses to search/brand.
- Favorites is a bottom tab; mobile grid hearts stay hidden. Scroll-to-top honors
  reduced motion. Desktop product navigation remains unchanged.
- Mobile product and cart links open a sheet with share/favorite/close, a swipe
  handle, fresh details, retry, a dark sticky purchase panel and quantity controls.
  Back closes the sheet. Direct product URLs still work. No new price/variant rules.
- Mobile cart adds share-text, focus-search and confirmed clearing. Recommendations
  are up to four real available products excluding cart items, not personalized.
  Empty/error results omit the section. Existing totals/checkout are retained.

## Address Selection

The header opens a shared dialog. Account addresses are session-scoped; guests can
enter street/building and optionally place or drag a map pin. Explicit selection
updates the checkout draft. A typed draft wins over automatic account defaults.
Guest addresses expire after 24 hours in sessionStorage; changing accounts clears
private persisted drafts. No SMS keys or session tokens enter this storage.

No city search provider is connected. The UI offers manual entry, actual saved
address filtering and the existing Leaflet map. It states that city search is
unavailable. No invented suggestions or external search requests are made while
configuration is absent. Map tiles load only after the map opens, with attribution.

City is fixed to Dushanbe. Suggestions and selected coordinates are checked against
the configurable approximate envelope `[west,south,east,north]`, initially
`[68.65,38.45,68.90,38.68]`. This rectangle is NOT a verified municipal boundary or
delivery polygon. A manual address without coordinates cannot be geographically
verified yet. Backend delivery/checkout rules are unchanged. Strict enforcement
requires an approved service polygon and server-side verification of the point.
Moving a pin changes coordinates; automatic reverse geocoding is not connected,
and street/building remain editable.

## Search Adapter

`GET /api/address-search` returns configuration availability/city bounds.
`POST /api/address-search` accepts `{query}`, 3-150 characters. Client debounce is
350ms; superseded requests are cancelled. The server checks origin, bounded body
sizes, coordinates and result count; upstream timeout is four seconds, redirects
are refused. Keys and upstream errors are not exposed to customers.

```dotenv
# Server-side HTTPS endpoint implementing the adapter contract:
ADDRESS_SEARCH_URL=
ADDRESS_SEARCH_API_KEY=
ADDRESS_SEARCH_BOUNDS=[68.65,38.45,68.90,38.68]
WEB_ORIGIN=https://dushanbefresh.tj
```

The adapter receives Bearer authorization and JSON:

```json
{"query":"Рудаки 15","limit":6,"city":"Dushanbe","countryCode":"TJ","bounds":[68.65,38.45,68.90,38.68]}
```

Return `{items:[{street,building,lat,lng}]}` from genuine provider results, checking
locality as well as bounds. Empty building is allowed for street suggestions.
This is not directly compatible with Yandex/Geoapify endpoints: a vendor adapter
and acceptance tests are required. Configure provider quotas and edge rate limits
before activation. Do not use public Nominatim for autocomplete.

## Provider Choice

Trial Geoapify and Yandex on representative public Dushanbe addresses before
committing. Live-key coverage has not been measured. Geoapify is a practical
low-cost trial compatible with the existing map; compare Yandex for address quality.

- [Geoapify pricing](https://www.geoapify.com/pricing/): free 3,000 credits/day
  with attribution, including commercial use; 10,000/day costs USD 59/month on
  monthly billing. Autocomplete costs one credit/request; map tiles share the
  budget. See [credit costs](https://www.geoapify.com/pricing-details/).
- [Yandex tariffs](https://yandex.ru/maps-api/tariffs): cost depends on APIs,
  billing country and license. The Russian tariff is not a final quote for a
  Tajik business. Confirm rights for saved coordinates/results and the selected
  map. [Account/key setup](https://yandex.ru/maps-api/faq).

Owner supplies a provider account, API key through server configuration, domain
restrictions/quotas, approved delivery area, and a small public address sample
including edge neighborhoods. No secrets in git. Prices checked 2026-10-21.

## Verification

- Lint and typecheck pass. Both Web/API production builds pass; Web was built in
  `/tmp/df-interface-preview-20261021` without touching the existing dev build.
- 467 tests pass: shared 6, Web 193, API 268. The final run includes all PostgreSQL
  integration tests with zero skips on the new isolated local database
  `dushanbe_fresh_interface_test_20261021`. All 13 existing migrations applied
  there; no seed or production migration was run.
- 16 targeted browser tests pass, covering 375/390/430/768 and desktop 1440,
  RU/TJ, language persistence, map marker drag, sheet swipe/Back, favorites,
  quantities, cart clearing/share, recommendations, search and address transfer
  into checkout. Browser tests create no actual orders in the preview catalog.
- Full legacy admin browser suites were not rerun for this frontend task. Native
  share sheets/keyboard on physical iOS/Android, actual provider search quality,
  reverse geocoding and exact delivery-zone enforcement still require validation
  or integration. API integration tests cover checkout/order/staff regressions.

## Files Changed In This UI Task

- `apps/web/src/i18n/provider.tsx`, `messages.ts`
- `apps/web/src/app/layout.tsx`, `styles.css`, `customer-navigation.css`,
  `delivery-address.css`, `api/address-search/route.ts`
- `apps/web/src/components/site-header.tsx`, `mobile-navigation.tsx`,
  `catalog-search.tsx`, `scroll-to-top.tsx`, `address-fields.tsx`,
  `checkout-content.tsx`, `product-card.tsx`, `product-gallery.tsx`,
  `mobile-product-sheet*.tsx`, `mobile-product-sheet.module.css`,
  `cart-page-content.tsx`, `cart-mobile-header.tsx`, `cart-enhancements.*`
- `apps/web/src/customer/delivery-address-context.tsx`
- `apps/web/src/lib/delivery-address*.ts`
- `apps/web/e2e/interface-updates.spec.ts`, `cart-enhancements.spec.ts`
- `.env.example`, `docs/DECISIONS.md`, this document
