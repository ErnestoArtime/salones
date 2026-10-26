import "dotenv/config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: process.env.TEST_WEB_URL ?? "http://localhost:8130",
    headless: true,
    trace: "retain-on-failure",
  },
  reporter: "list",
});
