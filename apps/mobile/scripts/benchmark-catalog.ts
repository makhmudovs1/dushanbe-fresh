// CPU microbenchmark only, not a device FPS/startup/memory acceptance test.
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { parseProducts } from "../src/domain/catalog";
import { localizedName } from "../src/i18n";
async function main() {
const response = await fetch("https://dushanbefresh.tj/api/v1/products", { signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error("Public catalog unavailable");
const products = parseProducts(await response.json());
if (!products.length) throw new Error("Cannot benchmark an empty catalog");
const samples = [500, 1000].map(count => {
  const input = Array.from({ length: count }, (_, i) => ({ ...products[i % products.length]!, id: `benchmark-only-${i}` }));
  const durations: number[] = [];
  let checksum = 0;
  for (let run = 0; run < 40; run++) {
    const start = performance.now();
    const parsed = parseProducts(input);
    for (const product of parsed) checksum += localizedName(run % 2 ? "ru" : "tg", product).length;
    if (run >= 10) durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return { count, iterations: durations.length, p50ms: durations[15], p95ms: durations[28], checksum };
});
const report = { measuredAt: new Date().toISOString(), engine: `Node ${process.version}`, syntheticExpansionOfPublicDtos: true, productionWrites: 0, samples, nativeFPSMeasured: false, nativeMemoryLeaksMeasured: false, limitation: "Measures public DTO parsing/localized names only; native 500+ item scrolling, image memory and cold startup require device profiling." };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
}
void main().catch(() => { console.error("Catalog benchmark failed"); process.exitCode = 1; });
