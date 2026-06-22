import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx vite --config e2e/vite.config.ts --host 127.0.0.1",
    port: 4174,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
