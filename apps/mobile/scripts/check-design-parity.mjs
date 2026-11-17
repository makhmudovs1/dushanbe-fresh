// Source drift is an input to visual review, never proof of rendered parity.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../../../", import.meta.url);
const manifestPath = new URL("../design-parity.sources.json", import.meta.url);
const files = [
  "src/app/page.tsx",
  "src/app/styles.css",
  "src/app/globals.css",
  "src/app/storefront-theme.css",
  "src/app/mobile-storefront.css",
  "src/app/mobile-visual-polish.css",
  "src/app/storefront-discovery.css",
  "src/app/catalog-cards.css",
  "src/app/home-promotions.css",
  "src/app/site-header.css",
  "src/app/promotion-carousel.css",
  "src/app/customer-experience.css",
  "src/app/address-picker.css",
  "src/components/site-header.tsx",
  "src/components/mobile-navigation.tsx",
  "src/components/home-promotions.tsx",
  "src/components/primary-promotion.tsx",
  "src/components/home-quick-links.tsx",
  "src/components/category-navigation.tsx",
  "src/components/mobile-category-tabs.tsx",
  "src/components/product-card.tsx",
  "src/components/product-price.tsx",
  "src/components/quantity-stepper.tsx",
  "src/components/product-gallery.tsx",
  "src/components/mobile-product-sheet.tsx",
  "src/components/mobile-product-sheet.module.css",
  "src/components/customer-login.tsx",
  "src/components/customer-account.tsx",
  "src/components/cart-page-content.tsx",
  "src/components/address-picker.tsx",
  "src/components/address-map-canvas.tsx",
  "src/components/checkout-content.tsx",
  "src/components/order-tracking.tsx",
  "src/lib/storefront.ts",
  "src/lib/format.ts",
  "src/lib/customer-login.ts",
  "src/lib/product-facts.ts",
  "src/i18n/messages.ts",
].map((p) => "apps/web/" + p);
const hashes = Object.fromEntries(
  files.map((path) => [
    path,
    createHash("sha256")
      .update(readFileSync(new URL(path, root)))
      .digest("hex"),
  ]),
);
if (process.argv.includes("--record")) {
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        webBaseline: "521b61e115cbed0061c70a569b9e7b7570febe43",
        note: "Reviewed WEB source inputs. Run native screenshot comparison separately; never refresh blindly.",
        files: hashes,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Recorded reviewed WEB inputs; this is not a native visual comparison.",
  );
} else {
  const previous = JSON.parse(readFileSync(manifestPath, "utf8")).files;
  const changed = files.filter((path) => previous[path] !== hashes[path]);
  console.log(
    JSON.stringify(
      {
        sourceInputsChanged: changed,
        sourceCheckPassed: changed.length === 0,
        nativeVisualParityVerified: false,
      },
      null,
      2,
    ),
  );
  if (changed.length) process.exitCode = 1;
}
