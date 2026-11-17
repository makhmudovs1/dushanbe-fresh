// Deterministic export of existing brand assets, not generated product photography.
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../api/package.json", import.meta.url));
const sharp = require("sharp");
const output = new URL("../store/", import.meta.url);
mkdirSync(output, { recursive: true });
const logo = readFileSync(new URL("../assets/wordmark.png", import.meta.url)).toString("base64");
const image = sharp(new URL("../assets/wordmark.png", import.meta.url).pathname);
const metadata = await image.metadata();
const height = Math.round(450 * metadata.height / metadata.width);
for (const [locale, caption] of [["ru", "Свежие продукты с рынков Душанбе"], ["tg", "Маҳсулоти тару тоза аз бозорҳои Душанбе"]]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><rect width="1024" height="500" fill="white"/><image x="287" y="105" width="450" height="${height}" href="data:image/png;base64,${logo}"/><text x="512" y="350" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#176c42">${caption}</text></svg>`;
  writeFileSync(new URL(`feature-graphic-${locale}.svg`, output), svg);
  await sharp(Buffer.from(svg)).flatten({ background: "white" }).png().toFile(new URL(`feature-graphic-${locale}.png`, output).pathname);
}
await sharp(new URL("../assets/icon.png", import.meta.url).pathname).resize(1024, 1024).flatten({ background: "white" }).png().toFile(new URL("icon-1024.png", output).pathname);
writeFileSync(new URL("README.md", output), "# Store asset drafts\n\nOwner approval required; not published. Real existing wordmark/icon only.\nFeature graphics: 1024×500 PNG without alpha, RU/TJ; icon: 1024×1024 without alpha.\nRegenerate with node scripts/build-store-assets.mjs from apps/mobile.\nThese are brand graphics, not screenshots. Real native screenshots and release gates are in docs/MOBILE_RELEASE_2026.md.\n");
console.log("Exported existing brand assets: 1024x500 RU/TJ feature graphics and opaque 1024 icon. Not published.");
