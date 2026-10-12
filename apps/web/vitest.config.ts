import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  // Avoid Node 18 fetch/AbortSignal worker-thread shutdown hangs.
  test: { pool: "forks", include: ["src/**/*.test.{ts,tsx}"] }
});
