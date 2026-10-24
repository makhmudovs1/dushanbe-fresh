import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Usage: node scripts/build-brand-assets.mjs /path/to/14.png [--check]
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceArgument = process.argv.slice(2).find(arg => !arg.startsWith("--"));
if (!sourceArgument) {
  console.error("Usage: node scripts/build-brand-assets.mjs /path/to/14.png [--check]");
  process.exit(1);
}
const sharp = createRequire(resolve(root, "apps/api/package.json"))("sharp");
const sourcePath = resolve(sourceArgument);
const check = process.argv.includes("--check");
const publicRoot = resolve(root, "apps/web/public");
const source = await readFile(sourcePath);
const digest = buffer => createHash("sha256").update(buffer).digest("hex");
assert.equal(digest(source), "cfb0e047b2baea2ca1b46e0fe49524c84a1c5ad0a686a6b1b65fb334d3f3902f", "Use the exact supplied 14.png, not a replacement logo");
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.deepEqual([info.width, info.height, info.channels], [1448, 1086, 4]);

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const white = { r: 255, g: 255, b: 255, alpha: 1 };
const pngOptions = { compressionLevel: 9, adaptiveFiltering: true, palette: false };
const ink = (r, g, b) => Math.min(r, g, b) < 232;
const red = (r, g, b) => r - g > 25 && r - b > 25 && g < 180;

function bitmapMask(region, predicate, largestComponent = false) {
  const { left, top, width, height } = region;
  let mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = ((top + y) * info.width + left + x) * 4;
      if (predicate(data[offset], data[offset + 1], data[offset + 2])) mask[y * width + x] = 1;
    }
  }
  if (largestComponent) {
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    let winner = new Int32Array();
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || visited[start]) continue;
      let head = 0; let tail = 1;
      queue[0] = start; visited[start] = 1;
      while (head < tail) {
        const current = queue[head++];
        for (const next of [current - 1, current + 1, current - width, current + width]) {
          if (next < 0 || next >= mask.length || Math.abs(next % width - current % width) > 1 || !mask[next] || visited[next]) continue;
          visited[next] = 1; queue[tail++] = next;
        }
      }
      if (tail > winner.length) winner = queue.slice(0, tail);
    }
    assert(winner.length > 20000, "The supplied capital letter must be isolated, not a neighboring stroke");
    mask = new Uint8Array(mask.length);
    for (const pixel of winner) mask[pixel] = 1;
  }
  // Keep the original antialiased edge around each selected bitmap component.
  const expanded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) expanded[(y + dy) * width + x + dx] = 1;
        }
      }
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!expanded[y * width + x]) continue;
      const sourceOffset = ((top + y) * info.width + left + x) * 4;
      const rgb = [data[sourceOffset], data[sourceOffset + 1], data[sourceOffset + 2]];
      const alpha = 255 - Math.min(...rgb);
      if (!alpha) continue;
      const offset = (y * width + x) * 4;
      // Removing the white matte preserves the original colors when displayed on white.
      for (let channel = 0; channel < 3; channel++) rgba[offset + channel] = Math.max(0, Math.min(255, Math.round((rgb[channel] - 255 + alpha) * 255 / alpha)));
      rgba[offset + 3] = alpha;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  assert(maxX >= minX && maxY >= minY, "Bitmap selection cannot be empty");
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png(pngOptions).toBuffer();
}

const fullBitmap = await bitmapMask({ left: 0, top: 0, width: info.width, height: info.height }, ink);
// This ROI contains the supplied capital and a neighboring stroke; select only its connected capital.
const capital = await bitmapMask({ left: 130, top: 335, width: 425, height: 370 }, ink, true);
const heart = await bitmapMask({ left: 1205, top: 385, width: 112, height: 104 }, red);
const fullSize = await sharp(fullBitmap).metadata();
assert(fullSize.width <= 1176 && fullSize.height <= 404, "Unexpected supplied wordmark bounds");
const wordmark = await sharp({ create: { width: 1200, height: 420, channels: 4, background: transparent } })
  .composite([{ input: fullBitmap, left: Math.floor((1200 - fullSize.width) / 2), top: Math.floor((420 - fullSize.height) / 2) }]).png(pngOptions).toBuffer();
const capitalLayer = await sharp(capital).resize({ width: 420 }).png(pngOptions).toBuffer();
const heartLayer = await sharp(heart).resize({ width: 120 }).png(pngOptions).toBuffer();
const mark = await sharp({ create: { width: 512, height: 512, channels: 4, background: transparent } })
  .composite([{ input: capitalLayer, left: 28, top: 132 }, { input: heartLayer, left: 360, top: 24 }]).png(pngOptions).toBuffer();
const appMark = await sharp(mark).resize(448, 448).png(pngOptions).toBuffer();
const icon = await sharp({ create: { width: 512, height: 512, channels: 4, background: white } })
  .composite([{ input: appMark, left: 32, top: 32 }]).removeAlpha().png(pngOptions).toBuffer();
const apple = await sharp(icon).resize(180, 180).png(pngOptions).toBuffer();
const pwa192 = await sharp(icon).resize(192, 192).png(pngOptions).toBuffer();
const ogLayer = await sharp(wordmark).resize({ width: 1040 }).png(pngOptions).toBuffer();
const og = await sharp({ create: { width: 1200, height: 630, channels: 3, background: white } })
  .composite([{ input: ogLayer, gravity: "centre" }]).removeAlpha().png(pngOptions).toBuffer();

function iconDib(rgba, size) {
  const maskStride = Math.ceil(size / 32) * 4;
  const result = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  result.writeUInt32LE(40, 0); result.writeInt32LE(size, 4); result.writeInt32LE(size * 2, 8);
  result.writeUInt16LE(1, 12); result.writeUInt16LE(32, 14); result.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sourceOffset = (y * size + x) * 4;
      const targetOffset = 40 + ((size - 1 - y) * size + x) * 4;
      result[targetOffset] = rgba[sourceOffset + 2]; result[targetOffset + 1] = rgba[sourceOffset + 1];
      result[targetOffset + 2] = rgba[sourceOffset]; result[targetOffset + 3] = rgba[sourceOffset + 3];
      if (rgba[sourceOffset + 3] < 128) result[40 + size * size * 4 + (size - 1 - y) * maskStride + Math.floor(x / 8)] |= 128 >> (x % 8);
    }
  }
  return result;
}

async function favicon(sizes, artwork = mark) {
  const frames = [];
  for (const size of sizes) {
    const raster = sharp(artwork).flatten({ background: white }).resize(size, size).ensureAlpha();
    const pixels = await raster.clone().raw().toBuffer();
    let darkPixels = 0; let redPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset] < 200 && pixels[offset + 1] < 200 && pixels[offset + 2] < 200) darkPixels++;
      if (red(pixels[offset], pixels[offset + 1], pixels[offset + 2])) redPixels++;
    }
    assert(darkPixels > 10 && (artwork !== mark || redPixels > 0), `Logo must survive at ${size}px`);
    frames.push(size <= 48 ? iconDib(pixels, size) : await raster.png(pngOptions).toBuffer());
  }
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2); directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16;
    directory[entry] = size === 256 ? 0 : size; directory[entry + 1] = directory[entry];
    directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frames[index].length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
    offset += frames[index].length;
  }
  const output = Buffer.concat([directory, ...frames]);
  assert.equal(output.length, offset);
  return output;
}

const ico = await favicon([16, 32, 48]);
const fullIcon = await sharp({ create: { width: 512, height: 512, channels: 3, background: white } })
  .composite([{ input: await sharp(wordmark).resize({ width: 504 }).png(pngOptions).toBuffer(), gravity: "centre" }]).png(pngOptions).toBuffer();
const fullIco = await favicon([16, 32, 48], fullIcon);
// Older v2 consumers expect six entries; retain that container contract with the new bitmap.
const legacyIco = await favicon([16, 32, 48, 64, 128, 256]);
const outputs = new Map();
const add = (path, buffer, width, height) => outputs.set(path, { buffer, width, height });
add("brand/wordmark-v3.png", wordmark, 1200, 420);
add("brand/wordmark-v3.webp", await sharp(wordmark).webp({ lossless: true, effort: 6 }).toBuffer(), 1200, 420);
add("brand/mark-v3.png", mark, 512, 512);
add("brand/mark-v3.webp", await sharp(mark).webp({ lossless: true, effort: 6 }).toBuffer(), 512, 512);
add("brand/icon-v3.png", icon, 512, 512);
add("brand/apple-touch-icon-v3.png", apple, 180, 180);
add("brand/pwa-192-v3.png", pwa192, 192, 192);
add("brand/pwa-512-v3.png", icon, 512, 512);
add("brand/og-v3.png", og, 1200, 630);
add("brand/favicon-v3.ico", ico);
add("brand/favicon-v4.ico", ico);
add("brand/favicon-16-v4.png", await sharp(mark).flatten({ background: white }).resize(16, 16).png(pngOptions).toBuffer(), 16, 16);
add("brand/favicon-32-v4.png", await sharp(mark).flatten({ background: white }).resize(32, 32).png(pngOptions).toBuffer(), 32, 32);
add("brand/favicon-v5.ico", fullIco);
for (const size of [16, 32]) add(`brand/favicon-${size}-v5.png`, await sharp(fullIcon).resize(size, size).png(pngOptions).toBuffer(), size, size);
add("brand/icon-v5.png", fullIcon, 512, 512);
add("brand/apple-touch-icon-v5.png", await sharp(fullIcon).resize(180, 180).png(pngOptions).toBuffer(), 180, 180);
add("brand/pwa-192-v5.png", await sharp(fullIcon).resize(192, 192).png(pngOptions).toBuffer(), 192, 192);
add("brand/pwa-512-v5.png", fullIcon, 512, 512);
add("favicon.ico", fullIco);
add("icon.png", fullIcon, 512, 512);
add("apple-touch-icon.png", await sharp(fullIcon).resize(180, 180).png(pngOptions).toBuffer(), 180, 180);
add("brand/mark-v2.webp", await sharp(mark).resize(128, 128).webp({ lossless: true, effort: 6 }).toBuffer(), 128, 128);
add("brand/icon-v2.png", icon, 512, 512);
add("brand/apple-touch-icon-v2.png", apple, 180, 180);
add("brand/favicon-v2.ico", legacyIco);
add("brand/favicon.ico", legacyIco);
add("brand/apple-touch-icon.png", apple, 180, 180);
add("brand/dushanbe-fresh-logo.png", wordmark, 1200, 420);
add("brand/dushanbe-fresh-icon.png", icon, 512, 512);

for (const [path, { buffer, width, height }] of outputs) {
  const target = resolve(publicRoot, path);
  if (width) {
    const metadata = await sharp(buffer).metadata();
    assert.deepEqual([metadata.width, metadata.height], [width, height], `Wrong dimensions: ${path}`);
  }
  if (check) assert.deepEqual(await readFile(target), buffer, `Asset needs rebuilding: ${path}`);
  else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, buffer); }
  console.log(`${check ? "checked" : "built"} ${path} ${width ? `${width}x${height}` : `ICO ${path.includes("v2") || path === "brand/favicon.ico" ? "16/32/48/64/128/256" : "16/32/48"}`} ${buffer.length} bytes`);
}
