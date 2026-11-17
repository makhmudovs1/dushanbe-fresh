import { readFileSync } from "node:fs";
const filename = process.env.MOBILE_TEST_RUNTIME_CONFIG;
if (!filename) throw new Error("MOBILE_TEST_RUNTIME_CONFIG is required");
const config = JSON.parse(readFileSync(filename, "utf8"));
if (!["localhost", "127.0.0.1"].includes(new URL(config.gatewayUrl).hostname))
  throw new Error("Loopback required");
const response = await fetch(`${config.gatewayUrl}/shutdown`, {
  method: "POST",
  headers: { "X-Mobile-Test-Secret": config.secret },
  signal: AbortSignal.timeout(5000),
});
if (!response.ok) throw new Error("Isolated shutdown rejected");
console.log("Isolated fixture shutdown requested.");
