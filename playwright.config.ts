import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

config({ quiet: true });

// Runs the production build against the isolated test database (created by test:integration).
const swap = (u = "") => u.replace(/\/dar_quran(\?|$)/, "/dar_quran_test$1");
process.env.E2E_DATABASE_URL = swap(process.env.DATABASE_URL);

const EXCLUDED = /(real-media|production-gate)\.spec\.ts/;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", locale: "ar", trace: "retain-on-failure" },
  projects: [
    // real-media and production-gate have their own commands: they need network or a second server.
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: EXCLUDED },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(public|mushaf)\.spec\.ts/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /(public|mushaf)\.spec\.ts/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /(public|mushaf)\.spec\.ts/ },
    { name: "chrome-real", use: { ...devices["Desktop Chrome"], channel: "chrome" }, testMatch: /(public|mushaf)\.spec\.ts/ },
    { name: "real-media", use: { ...devices["Desktop Chrome"] }, testMatch: /real-media\.spec\.ts/ },
    { name: "production-gate", use: { ...devices["Desktop Chrome"] }, testMatch: /production-gate\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "npx next start -p 3100",
      url: "http://localhost:3100/api/health",
      reuseExistingServer: false,
      timeout: 60000,
      env: { DATABASE_URL: swap(process.env.DATABASE_URL), APP_DATABASE_URL: swap(process.env.APP_DATABASE_URL), APP_ENV: "test", APP_URL: "http://localhost:3100" },
    },
    {
      // The same data, served as production. Demo approvals must count for nothing here.
      command: "npx next start -p 3101",
      url: "http://localhost:3101/api/health",
      reuseExistingServer: false,
      timeout: 60000,
      env: { DATABASE_URL: swap(process.env.DATABASE_URL), APP_DATABASE_URL: swap(process.env.APP_DATABASE_URL), APP_ENV: "production", APP_URL: "http://localhost:3101" },
    },
  ],
});
