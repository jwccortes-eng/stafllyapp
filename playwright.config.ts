/**
 * Sprint 17 — Root-Cause Ecosystem QA Harness (Playwright).
 *
 * READ-ONLY harness. It only navigates deep-links produced by the
 * Root-Cause Explorer, screenshots the destination, and asserts basic
 * layout invariants (no crash, no horizontal overflow on mobile,
 * expected banners/fallbacks). It NEVER clicks approve/close/export/
 * save/submit/delete/recalc/send buttons and it does not mutate data.
 *
 * Usage (see tests/e2e/README.md):
 *   E2E_BASE_URL=http://localhost:8080 \
 *   E2E_STORAGE_STATE=./.playwright/auth.json \
 *   E2E_COMPANY_ID=... E2E_PAY_PERIOD_ID=... E2E_EMPLOYEE_ID=... \
 *   E2E_TIME_ENTRY_ID=... E2E_SHIFT_ID=... \
 *   bunx playwright test
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const STORAGE_STATE = process.env.E2E_STORAGE_STATE || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    storageState: STORAGE_STATE,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
