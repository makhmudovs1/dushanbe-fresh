// Preserve WEB's exact Lucide 0.468.0 vectors without React DOM or a second icon set.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const root = dirname(require.resolve("lucide-react/package.json"));
const icons = {
  Home: "house",
  Bookmark: "bookmark",
  BriefcaseBusiness: "briefcase-business",
  ShoppingBag: "shopping-bag",
  LayoutGrid: "layout-grid",
  Heart: "heart",
  ShoppingCart: "shopping-cart",
  UserRound: "user-round",
  Languages: "languages",
  Search: "search",
  X: "x",
  Check: "check",
  ChevronDown: "chevron-down",
  ChevronRight: "chevron-right",
  ArrowLeft: "arrow-left",
  ArrowRight: "arrow-right",
  ArrowUp: "arrow-up",
  History: "history",
  Plus: "plus",
  Minus: "minus",
  Share2: "share-2",
  Trash2: "trash-2",
  MapPin: "map-pin",
  Navigation: "navigation",
  LockKeyhole: "lock-keyhole",
  Clock3: "clock-3",
  Settings2: "settings-2",
  LogOut: "log-out",
  Pencil: "pencil",
  Percent: "percent",
  TrendingDown: "trending-down",
  CircleAlert: "circle-alert",
  PackageCheck: "package-check",
};
let output =
  '// Generated from lucide-react 0.468.0 (ISC). Run node scripts/sync-web-icons.mjs.\n// Copyright (c) Lucide Contributors. See assets/lucide-LICENSE.\nimport { makeIcon } from "./native-icon";\n';
for (const [name, file] of Object.entries(icons)) {
  const source = readFileSync(
    join(root, "dist/esm/icons", file + ".js"),
    "utf8",
  );
  const match = source.match(/createLucideIcon\("[^"]+",\s*(\[[\s\S]*\])\);/);
  if (!match) throw new Error("Cannot extract " + file);
  output += `export const ${name} = makeIcon(${match[1]});\n`;
}
writeFileSync(new URL("../src/design/icons.ts", import.meta.url), output);
writeFileSync(
  new URL("../assets/lucide-LICENSE", import.meta.url),
  readFileSync(join(root, "LICENSE")),
);
