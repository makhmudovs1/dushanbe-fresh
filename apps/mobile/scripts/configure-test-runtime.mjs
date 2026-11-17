// Reads a local guarded runtime descriptor. Never prints its SMS gateway credential.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const filename = process.argv[2];
if (!filename?.startsWith("/private/tmp/"))
  throw new Error("Explicit private local runtime file required");
const config = JSON.parse(readFileSync(filename, "utf8"));
const url = new URL(config.base);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^[a-f0-9]{32}$/.test(config.runtimeId)
)
  throw new Error("Invalid isolated runtime");
const target = new URL("../.env.local", import.meta.url);
if (existsSync(target))
  throw new Error(
    "Mobile .env.local exists; preserve it and configure the runtime manually",
  );
writeFileSync(
  target,
  `EXPO_PUBLIC_APP_ENV=integration\nEXPO_PUBLIC_API_URL=${config.base}\nEXPO_PUBLIC_ENABLE_ORDER_SUBMISSION=true\nEXPO_PUBLIC_TEST_RUNTIME_ID=${config.runtimeId}\n`,
  { mode: 0o600 },
);
console.log(
  "Mobile configured for this loopback-only isolated test runtime. Rebuild/restart Expo.",
);
