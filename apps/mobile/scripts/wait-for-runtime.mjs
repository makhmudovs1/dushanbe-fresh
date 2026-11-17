import { readFileSync } from "node:fs";
const filename = process.env.MOBILE_TEST_RUNTIME_CONFIG;
if (!filename) throw new Error("MOBILE_TEST_RUNTIME_CONFIG is required");
const deadline = Date.now() + 30000;
let ready = false;
while (!ready) {
  try {
    const config = JSON.parse(readFileSync(filename, "utf8"));
    if (!["localhost", "127.0.0.1"].includes(new URL(config.base).hostname))
      throw new Error("Loopback required");
    const response = await fetch(`${config.base}/mobile-test/runtime`, {
      signal: AbortSignal.timeout(1000),
    });
    const proof = await response.json();
    ready = proof.isolated && proof.runtimeId === config.runtimeId;
  } catch {
    /* Wait only for this guarded runtime. */
  }
  if (!ready) {
    if (Date.now() >= deadline)
      throw new Error("Isolated runtime did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
console.log("Isolated purchase runtime is ready.");
