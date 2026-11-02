# Release: cart, automatic markup and maps

## Deployed

- API: `7769f79a22bd15d2b4cf4283f28fd10b172801e9`, container
  `df-pricing-api-7769f79a22bd`, loopback 4013.
- Web: `71200edb6b0fc9ab6aaa7b3954fcf7b66e9a6c1f`, container
  `df-pricing-web-71200edb6b0f`, loopback 3005.
- Final Web build: `2ASU67vETqm34dJb6gtVf`; public identity verified at rollout.
- Active Web pointer: `/srv/dushanbe-fresh/state/web-current.json`.
  API compose remains in the pricing release. Do not restart an older combined
  compose's Web service when managing the current Web-only follow-up.

The pricing migration was applied with API writers stopped and an explicit DDL
transaction. All existing business-row fingerprints, including prices, orders,
customers, addresses and sessions, matched before/after. All legacy products
remained manual; no bulk repricing or default-setting write was executed.
PostgreSQL and Caddy were not restarted. SMS secrets and the pilot ledger stayed
unchanged; no SMS was sent.

Fresh encrypted backups were restored before and after the migration. The
post-release snapshot starts with `4b9f9e470df1`; database hashes and all 65 photos
matched. Local backup/offsite limitations remain as previously accepted.

## Verification

- Repository lint, typecheck and production builds passed.
- API suite: 549; shared: 24. Pricing/migration integration rerun: 13, with all
  nine pre/post invariants matching in an isolated PostgreSQL database.
- Web baseline suite: 406. Final empty-history client regression: 5 tests.
- Cart browser regression: seven scenarios each in Chromium and WebKit.
- Admin browser regression: six scenarios, including actual empty HTTP 200 history
  semantics. Admin screenshots were inspected at desktop/mobile sizes.
- Real production staff login, secure refresh rotation, protected catalog/orders/
  waves and pricing reads passed. Unauthenticated pricing access returns 401.
- Real production cart checks passed in desktop Chromium and mobile WebKit,
  including the same progress DOM node after rapid quantity changes and guest
  cart persistence. Checkout validation only; no test customer order was created.
- Real maps passed at desktop 1440 RU, mobile 390 TJ and 375 RU: tiles, autocomplete,
  reverse after dragging, manual clarification and exact guest coordinates.
  Queries returned Гипрозем: 5, Рудаки: 4, Сомони: 6 suggestions.
- Geoapify keys were replaced and restricted. The two old project keys and one
  unused diagnostic-exposed key were revoked. Final public assets were checked
  and do not contain the server key. Required attribution remains visible.

Physical iPhone testing and a native application rebuild were not performed;
WebKit and existing native API contracts were checked. Actual bulk writes/undo
were tested on isolated data, not live catalog products.

## Map Recommendation

Keep the restored Geoapify/Leaflet setup for the current pilot. Positron provides
the requested quieter presentation; genuine district/landmark results now work.
The three real query checks above demonstrate lookup availability, not independently
verified building/entrance accuracy. A tile style cannot add missing address data.
No Yandex/2GIS API keys, paid service, or provider migration was introduced, and no
unsupported accuracy comparison is claimed. Compare alternative APIs on a fixed
ground-truthed address set before paying for or switching geocoders.

Admin instructions: [AUTOMATIC_MARKUP.md](AUTOMATIC_MARKUP.md).

## External DNS Incident, 2 November

At 11:27 Moscow time, public availability was blocked by an authoritative DNS
failure, not a stopped application. See [INCIDENT_DNS_20261102.md](INCIDENT_DNS_20261102.md).
Final public browser verification was interrupted by that failure. Local Web/API
and pinned-host HTTPS checks on TARENA passed. Do not call public availability
restored until DNS and a fresh external browser check succeed.
