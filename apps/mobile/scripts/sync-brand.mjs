// Copy existing brand art and pure translations; never import the Next.js runtime.
import { copyFileSync } from "node:fs";
const copies = {
  "../web/src/i18n/messages.ts": "src/i18n/web-messages.ts",
  "../web/src/lib/product-facts.ts": "src/design/product-facts.ts",
  "../web/public/brand/pwa-512-v5.png": "assets/icon.png",
  "../web/public/brand/mark-v3.png": "assets/splash.png",
  "../web/public/brand/wordmark-v3.png": "assets/wordmark.png",
  "../web/public/storefront/home/vegetables.webp": "assets/vegetables.webp",
  "../web/public/storefront/home/fruits.webp": "assets/fruits.webp",
  "../web/public/storefront/home/dairy.webp": "assets/dairy.webp",
  "../web/public/storefront/home/care-v1.webp": "assets/care-v1.webp",
  "../web/public/storefront/v2/vegetables.webp":
    "assets/category-vegetables.webp",
  "../web/public/storefront/v2/fruits.webp": "assets/category-fruits.webp",
  "../web/public/storefront/v2/greens.webp": "assets/category-greens.webp",
  "../web/public/storefront/v2/nuts.webp": "assets/category-nuts.webp",
  "../web/public/storefront/v2/mushrooms.webp":
    "assets/category-mushrooms.webp",
  "../web/public/storefront/v2/seasonal-vegetables.webp":
    "assets/category-seasonal-vegetables.webp",
  "../web/public/storefront/pantry.webp": "assets/category-pantry.webp",
};
for (const [source, target] of Object.entries(copies))
  copyFileSync(source, target);
