const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const { parseEnv } = require("node:util");

function prepareOtpEnvironment(source) {
  const env = parseEnv(source);
  if (env.CUSTOMER_AUTH_ENABLED === "true" || env.CUSTOMER_REQUIRE_PHONE === "true") throw new Error("flags");
  if (env.CUSTOMER_OTP_SECRET?.trim()) return null; // Never rotate an existing OTP HMAC secret.
  const lines = source.split(/\r?\n/);
  const definitions = lines.map((line, index) => /^(?:export\s+)?CUSTOMER_OTP_SECRET\s*=/.test(line.trim()) ? index : -1).filter(index => index >= 0);
  if (definitions.length > 1) throw new Error("duplicate");
  if (definitions.length && !/^\s*(?:export\s+)?CUSTOMER_OTP_SECRET\s*=\s*(?:""|'')?\s*(?:#.*)?$/.test(lines[definitions[0]])) throw new Error("multiline");
  const entry = `CUSTOMER_OTP_SECRET=${randomBytes(48).toString("base64url")}`;
  if (definitions.length) lines[definitions[0]] = entry;
  else lines.push(entry);
  return lines.join("\n").replace(/\n*$/, "\n");
}

function main() {
  if (process.argv.slice(2).join(" ") !== "--generate-otp-secret" || process.platform !== "linux" || process.getuid?.() !== 0) throw new Error("operator");
  const file = "/etc/dushanbe-fresh/app.env";
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o027) !== 0) throw new Error("permissions");
  const lock = "/etc/dushanbe-fresh/.payom-env.lock";
  const fd = fs.openSync(lock, "wx", 0o600);
  let temporary;
  try {
    const source = fs.readFileSync(file, "utf8");
    const next = prepareOtpEnvironment(source);
    if (next === null) { console.log("Existing OTP secret preserved. No changes or restarts."); return; }
    temporary = `/etc/dushanbe-fresh/.app.env.${randomBytes(8).toString("hex")}.tmp`;
    const output = fs.openSync(temporary, "wx", stat.mode & 0o777);
    try {
      fs.fchownSync(output, stat.uid, stat.gid);
      fs.fchmodSync(output, stat.mode & 0o777);
      fs.writeFileSync(output, next, "utf8");
      fs.fsyncSync(output);
    } finally { fs.closeSync(output); }
    if (fs.readFileSync(file, "utf8") !== source) throw new Error("concurrent_edit");
    fs.renameSync(temporary, file);
    temporary = undefined;
    console.log("OTP secret generated and saved privately. Auth flags unchanged; no restart.");
  } finally {
    if (temporary) fs.unlinkSync(temporary);
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
module.exports = { prepareOtpEnvironment };
if (require.main === module) {
  try { main(); }
  catch { console.error("OTP secret setup stopped safely. Check flags, file permissions and duplicate/empty OTP entries. No secrets printed."); process.exitCode = 1; }
}
