# Current WEB/native review — 17.11.2026

Current WEB/API source 521b61e; hashes are recorded in
apps/mobile/design-parity.sources.json. Current assets/translations and sourced
product facts are mirrored from WEB. The actual production browser was opened at
375/390/430 px with fresh isolated contexts. Screens cover guest home, categories,
catalog, search, product sheet, favorites, empty/filled cart, guest profile,
address/map, checkout and login invitation. No production SMS/orders were sent.

Updated native +992/OTP/name UX, product facts/characteristics, cart quantities /
server pricing/minimum/progress, fees/total and preserved checkout draft follow
the current components. Real iOS 390 px public home was captured after native
Release launch and actual production products/photos loaded. Full private native
flows and the required platform/size comparison set are **not** accepted just by
source hashes or successful compilation. Final actual results/limitations are in
MOBILE_RELEASE_2026.md. Dynamic carousel frames require a settled same slide;
differences must not be hidden with masks or arbitrary image registration.

The remainder below is historical October analysis, not acceptance of 0.3.0(3).

---

# Mobile / WEB design parity

## Authority and reference

The 2026-10-27 request explicitly replaces the earlier independent mobile styling:
**the current mobile dushanbefresh.tj is the visual and UX authority**. Native
React Native components remain mandatory; DOM, CSS, Next, Leaflet and WebView are
not imported into the native bundle. The old MVP exclusion remains historical.

Reference captured in a clean Chromium mobile context at 375×812, 390×844 and
430×932, DPR1, RU. Public GET/HEAD/OPTIONS only; all server mutations blocked.
Screenshots: [reference](mobile-parity/reference). These are real WEB renders,
not native screenshots. Full-page shots contain lazy-image placeholders below
the original viewport; do not treat those as intended product photography.
The in-app browser was unavailable; standalone Playwright used its own profile.

origin/main was fetched and remains fded9c7 (2026-10-26). The observed composition
matches that revision's **final CSS cascade**, not individual intermediate CSS
files. The exact deployed source commit is not exposed by the public page; no
claim of commit identity is made. Catalog content/prices remain live API data.

`apps/web/src/app/styles.css` fixes the order: globals → catalog-ui → ui-polish →
catalog-cards → storefront → storefront-v2 → home-promotions → mobile-storefront →
customer-account → customer-navigation → delivery-address → mobile-visual-polish →
storefront-theme → customer-experience → site-header → storefront-discovery →
promotion-carousel → address-picker → delivery-zone-editor.

## Measured contract

- Surface #fff, text #1b1b1b, action #1f1f1f, green #17643b, muted #737373,
  muted surface #f5f5f5, selection #edf4ef, border #ededed, heart #ff4d4f.
- Side gutters16; product columns2, horizontal gap10, row gap20. Widths166.5/174/194.
- Header row44, logo108×38 inside address trigger; language icon44; search44/radius24.
  Search starts after a44px brand slot and6px gap. Scroll compact threshold140.
- Home begins12px after header. Promotions: two112px left cards,234px right carousel,
  gap10/radius22; primary carousel has2 slides and6s interval, honours reduced motion.
  Quick links follow. Category showcase is **hidden on WEB home at this breakpoint**;
  it belongs on /categories. All products follow, with real price ABOVE name.
- Product image square/radius24, plus44 white circle over photo bottom/right8.
  Selected quantity uses white pill44. Price21/25 bold, currency10, unit12/16, name14/19.
  WEB hides card hearts on mobile; sheet toolbar exposes the heart. Preserve that.
- Navigation56 plus system bottom inset, top border, five Lucide icons23/stroke2,
  **no visible text labels**, accessible labels retained. Active green, inactive#8b8b8b.
- Product sheet radius28, gallery inset8/radius30, toolbar44, title28/33,
  fixed purchase footer with price26 and purchase/stepper52, docked navigation.
- RU/TJ copy comes from WEB messages and bilingual API fields. Native system font
  follows the platform. WEB specifies Inter then system fallbacks but bundles no
  Inter font asset; do not add a different font from an unrelated source.

## Component map

| WEB source | Native equivalent |
| --- | --- |
| SiteHeader, DeliveryAddressTrigger, CatalogSearch, LanguageSwitcher | StoreHeader |
| HomePromotions, PrimaryPromotion, HomeQuickLinks | HomePromotions, HomeQuickLinks |
| CategoryShowcase, CategoryCards, lib/storefront.ts | CategoryShowcase, design/storefront.ts |
| ProductCard, ProductPrice, QuantityStepper, ProductGallery | components/product-card.tsx |
| MobileNavigation | MobileNavigation and tabs router |
| MobileProductSheet, ProductInformation, ProductPurchaseActions | product/[slug] |
| CartPageContent, CartMobileHeader | (tabs)/cart |
| FavoritesBrowser | (tabs)/favorites |
| CustomerLogin, CustomerDialog | login / native sheet |
| CustomerAccount | (tabs)/profile, orders, addresses |
| AddressPicker, AddressMapCanvas | address / react-native-maps |
| CheckoutContent, public order tracking | checkout, tracking, OrderDetails |

## Assets and icons

`node scripts/sync-brand.mjs` in apps/mobile mirrors the real WEB logo, banners,
category art and messages. Uploaded category/product photos still use API URLs.
No generated product art or emoji. Icon vectors are extracted from the existing
WEB lucide-react0.468.0 by `node scripts/sync-web-icons.mjs`, preserving its ISC
license. Native renderer is Expo's compatible react-native-svg15.16.0. No DOM
library in the bundle; no incompatible React peer dependency from old native Lucide.

## Shared behaviour / differences

Keep the existing mobile API transport, SecureStore sessions, account boundaries,
cart revisions/import/conflict/idempotency, decimal quantity math and server
quote/review tokens. The UI is allowed to change; those protections are not.
Guest favorites never issue a server write; sign-in is required. SMS disabled
remains an honest state. No production checkout submission is enabled by this work.

Safe areas, keyboard, permission prompts, sharing and native sheet dismissal follow
platform conventions. Android Maps key/native geocoding deployment remain external
limitations; never render a fake map or fabricate a verified address. Runtime parity
on Android/iOS must be recorded from actual native screenshots, not source/layout
assertions or a browser rendering React Native Web.

## Keeping parity

For every WEB change to the mapped components, final CSS, translations, catalog
presentation or assets: capture a new reference, review this map, update mobile,
run differential presentation tests and compare actual native captures. Do not
silently refresh golden screenshots to hide a difference. If pricing, auth, cart,
address or checkout contracts change, follow MOBILE_API_COMPATIBILITY as well.

## Acceptance status

Increment A: public WEB captured; cascade, tokens, icon and asset sources recorded.
Increment B/C implemented in source580a40e across the mapped native routes.
905 tests/root lint/typecheck/builds and both preview exports pass; see
[MOBILE_WEB_PARITY_QA_20261027](MOBILE_WEB_PARITY_QA_20261027.md).
Increment D: WEB references and a real-image comparison tool are available; native
captures and visual iteration remain pending. **No native visual parity claim yet.** A new cloud APK requires separate permission. Existing crash fix26022ef,
Expo owner/project UUID, identifiers, Maps ENV, R8 and SecureStore must remain intact.

Source drift check: `corepack pnpm check:design` in apps/mobile compares the reviewed
WEB inputs listed in design-parity.sources.json. Updating this manifest does not
constitute visual acceptance. Renderer interaction tests use host adapters; only
actual Android/iOS screenshots can close the visual gate.
