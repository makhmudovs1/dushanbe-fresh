# Product Presentation And Reference Facts

## Scope

Web-only change: gentle media hover tint on fine-pointer devices, no previous/next
gallery arrows, retained accessible dots/thumbnails and touch swipes. Desktop CTA
is 156px wide; mobile retains its existing purchase strip and navigation geometry.
Nutrition and storage share one RU/TJ component across desktop and mobile.
No catalog rows, prices, purchase quantities, account flags or API behavior change.

## Nutrition Sources

`apps/web/src/lib/product-facts.ts` contains an explicit allowlist for the 44
currently published catalog slugs. Source: USDA FoodData Central SR Legacy,
April 2018, [official download](https://fdc.nal.usda.gov/download-datasets/).
Each entry retains the FDC ID and links to the individual food record. All four
values were compared programmatically against the official downloadable JSON.
Values are per 100g of edible portion, not per bunch or whole unpeeled fruit.
Carbohydrate is USDA carbohydrate-by-difference, including dietary fiber.
Legumes refer to dry seeds before cooking. Simirenko uses the generic raw apple
reference; Gala has a specific entry. Pepper/mint and other unbranded produce
use the documented generic reference, not a laboratory analysis of our batches.
The optional 1kg view multiplies these reference values by ten; it is independent
of checkout prices and the actual cart quantity. Bunch/piece products have no
inferred weight or whole-unit nutrition.

New slugs are deliberately not matched by substring/category: they show no
invented nutrition. Add a reviewed reference entry when introducing a new kind
of product. This display-only catalog does not introduce a Product migration or
automatically resurrect or modify any real product. Per-batch supplier labels
must replace generic references if packaged/prepared goods are introduced.

## Storage Is Not A Batch Expiry Guarantee

Storage recommendations link to their source in the expandable information:
- [Maryland Extension](https://extension.umd.edu/resource/storing-garden-fruits-and-vegetables)
- [Minnesota Extension](https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/harvesting-and-storing-home-garden-vegetables)
- [Virginia Cooperative Extension](https://www.pubs.ext.vt.edu/348/348-960/348-960.html)
- [Utah State Extension](https://extension.usu.edu/preserve-the-harvest/research/food-storage-in-home)
- [FAO](https://www.fao.org/4/s8270e/S8270E07.htm)

These are indicative household storage recommendations, not a promise of days
remaining after delivery. No harvest date or lot expiry is stored in the current
Product model, so the interface refers exact batch expiry to supplier labeling
or support, rather than inventing a date. Unsourced durations are not fabricated.

## Release Boundary

The unrelated local Payom changes must not enter this Web release. No SMS,
auth activation, database migrations, seed, catalog import or API restart.
Build from the reviewed commit in an independent server directory, preserve
the private Geoapify environment, retain old static assets and rollback runtime.
Verify API PID, auth status, environment checksums and public catalog before/after.

## Verification And Production, 2026-10-28

- Local lint, typecheck and Shared/API/Web builds passed. All 818 tests passed:
  Shared 23, Web 357, API 438. Database tests used a new isolated local database,
  removed after the run; no paid SMS or real orders were submitted.
- Chromium and WebKit: 11 browser scenarios per engine passed. Desktop widths
  1024/1280/1440, mobile/tablet 375/390/430/768, RU/TJ, orientation change,
  gallery selection, hover, quantity increments and nutrition basis switching.
- Runtime commit `b661096f784666b5dcb6ef206cce876c5670e759` activated at
  `2026-10-28T11:19:49Z`; build ID `5rvWnXPIOGEyq3VRtzGkb`.
- API PID stayed `1382577`; API runtime paths and entrypoint, production ENV
  checksums and the public catalog response matched before/after activation.
  Auth stayed disabled/not required; no migrations, catalog edits or API restart.
- Production browser smoke: 3/3 per engine passed on desktop1440, mobile375 RU
  and mobile390 TJ. Mutating API requests were blocked. Screenshots were opened
  and visually reviewed; these are browser-engine checks, not a physical iPhone.
- Production now names the same potato slug "Картофель мытый". The test reads
  the live display name instead of assuming it stays "Картофель"; the release
  does not rename products. Screenshots wait for visible photographs to decode.
- Ignored screenshots are in `apps/web/test-results/product-reference-*`.
  Rollback runtime is retained at
  `/opt/dushanbe-fresh/dist/web-releases/product-facts-20261028-b661096/rollback`.
  A short Web-only restart occurred; no claim of zero downtime.
