import { readFileSync, lstatSync } from "node:fs";
import * as util from "node:util";
import { checkPayomReadiness } from "../customer-account/payom-readiness";

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--env-file");
  const file = fileIndex >= 0 ? args[fileIndex + 1] : undefined;
  if (!file || args.some((arg, i) => ![fileIndex, fileIndex + 1].includes(i) && arg !== "--network")) throw new Error("arguments");
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o027) !== 0
    || (file === "/etc/dushanbe-fresh/app.env" && (stat.uid !== 0 || (stat.mode & 0o777) !== 0o640))) throw new Error("permissions");
  const parseEnv = (util as typeof util & { parseEnv(source: string): Record<string, string> }).parseEnv;
  const env = parseEnv(readFileSync(file, "utf8"));
  env.NODE_ENV ??= "production";
  const result = await checkPayomReadiness(env, args.includes("--network"));
  console.log(JSON.stringify(result));
  if (!result.configuration.configurationReady || (args.includes("--network") && !result.authenticatedReadReady)) process.exitCode = 2;
}
void main().catch(() => { console.error("Payom preflight failed: check arguments, private ENV permissions and Node.js version. No SMS was sent."); process.exitCode = 1; });
