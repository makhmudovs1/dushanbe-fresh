import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration suites share app_settings; concurrency is exercised explicitly inside each suite.
    fileParallelism: false
  }
});
