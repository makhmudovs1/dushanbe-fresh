# Mobile production synchronization — 17 November 2026

This is the current integration record. October mobile release documents are
historical evidence, not the current production policy or a native acceptance.

## Source and isolation

- Fetched origin/main: `521b61e115cbed0061c70a569b9e7b7570febe43`; local main
  matches and has no uncommitted WEB/API changes.
- Preserved mobile source: `1e9605751bb26972761f04c6da5a20e62b630d3e` on
  feature/mobile-app. Its temporary worktree had been deleted; branch history survived.
- Worktree restored at /private/tmp/dushanbe-fresh-mobile, integration branch
  feature/mobile-production-sync-20261117, based on current main. Existing native
  source and mobile-only build/docs are restored from the preserved mobile branch.
  No merge, history rewrite, push, deployment or production database mutation.
- Current main already includes native identity/session/cart routes, structured
  names, Payom templates/budgets, pricing, WEB multidevice refresh and required
  checkout login. Its native geocoder is absent.

## Current production audit

Credential-free HTTPS GET audit on 17 November: WEB/health/catalog/categories/
slots/zone are 200. Browser auth status and native auth status are enabled and
requiredForCheckout=true. Native protected reads return 401 without a session.
The observed catalog has 46 products and five categories; these are observations,
never application constants. No code/SMS/verify/refresh/order POST was sent.

SSH authentication using the existing checked-in connection configuration was
rejected (publickey). Current running image revisions and `_prisma_migrations`
have **not** been independently read. The November 2 activation receipt identifies
adde915 as the deployed application at that time; it is historical evidence only.
Do not infer today's deployed revision/migration list from main or those receipts.

| Capability | Current WEB source | Production API observed | Native baseline / required work |
| --- | --- | --- | --- |
| Catalog/categories/search | Current catalog, sourced product facts | Public GET 200 | Existing native catalog; verify changed products/images and facts |
| Prices/markup | Server-backed automatic markup | Public sellingPrice/priceDrop DTO unchanged | Keep server sellingPrice; add cart quote/delivery/minimum presentation |
| Varieties/quantities | Separate Product.id, server min/step | Same catalog DTO | Preserve decimal/min/step and legacy conflicts |
| SMS/auth | +992 mask, six OTP cells, name/surname | Native status available/enabled; required checkout | Update native UX and structured profile, isolated mock only |
| Sessions/devices | Independent browser/native sessions | Anonymous native me 401 | Preserve SecureStore, rotation, owner fences; cross-device isolated test |
| Cart | Revision/import/MAX, passive refresh | Anonymous native cart 401 | Preserve durable journal; verify conflicts/lost responses and passive updates |
| Favorites | Owned shared favorites | Anonymous native favorites 401 | Existing native UI/optimistic updates; test both devices |
| Saved addresses | Refresh preserves checkout draft | Anonymous native addresses 401 | Preserve selected/manual draft during remote refresh and account switch |
| Geocoding | Current server Geoapify adapter | Native status 404 | Add bounded native transport without Origin spoofing or embedded secret |
| Native map | WEB tiles and delivery polygon | Zone GET 200 | Native maps/GPS exists; Android SDK key still requires owned restrictions |
| Checkout | Read-only quotes; login required to create | requiredForCheckout=true | Match current cards/totals/slots; keep release submission disabled |
| Orders/tracking | Shared admin/picker/courier lifecycle | Anonymous owned orders 401 | Verify with synthetic shared DB and actual operations routes |
| Account deletion | No dedicated public route found | Not probed by mutation | Implement guarded request/deletion flow; retention needs owner approval |
| Store legal materials | No approved policy routes found | Not established | Draft factual RU/TJ copy; owner details/approval needed before publication |
| Push | Tracking exists | No readiness evidence | Do not add infrastructure to block first release |

## Execution evidence and gates

In progress. Baseline native suite after Vitest adaptation: 163 passed, eight
isolated HTTP tests not yet run. Fresh production WEB captures, current API/WEB/
native integration tests and native runtime acceptance will be recorded here.
Do not treat this baseline as a full regression or physical-device result.

Local Xcode 27.1 and iOS 27/27.1 Simulator runtimes are now available. CocoaPods is
being prepared; Android SDK is not installed. No new EAS job or store upload is
authorized by this task. Production checkout remains disabled in build profiles.

## Store requirements checked on 17 November 2026

- SDK 58 targets React Native 0.88 / React 19.3 and requires Node 22.13+ and
  Xcode 26.4+: [Expo SDK reference](https://docs.expo.dev/versions/v58.0.0/).
- New Google Play phone app submissions require API 36+ since 31 August 2026:
  [Google target API policy](https://support.google.com/googleplay/android-developer/answer/11926878).
- Store uploads require Xcode 26+ / iOS 26 SDK+ since 28 April 2026; SDK 58's
  requirement is stronger: [Apple requirement](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).
- The 12 testers / 14 continuous days rule is conditional on a personal Play
  account created after 13 November 2023. Account type/date are not known here:
  [Google testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465).

Candidate production identifiers remain tj.dushanbefresh.app on both platforms;
availability/ownership and first publication need owner confirmation. The preview
identifier stays tj.dushanbefresh.app.preview. No published identifier is changed.

Android: **NO-GO pending full integration/native/store acceptance**.
iOS: **NO-GO pending full integration/native/store acceptance**.
