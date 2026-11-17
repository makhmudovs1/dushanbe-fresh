import { defineConfig } from "vitest/config";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { pool: "forks", include: ["src/**/*.test.ts"] },
});
