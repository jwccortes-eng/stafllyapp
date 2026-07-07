/**
 * Sprint 28 — Root-Cause Review Notes QA Harness Extension.
 *
 * Verifies end-to-end that a payroll review note can be saved and listed
 * from the RootCauseExplorer against a QA/staging environment with a
 * real signed-in user that has payroll module `view` + `edit` permission.
 *
 * SAFETY:
 *   - Never runs against production URLs (staflyapps.com / staflyapp.lovable.app).
 *   - Only inserts into `payroll_review_notes` (the Sprint 27 MVP table).
 *   - Explicitly BLOCKS any mutating request to time_entries, scheduled_shifts,
 *     shift_assignments, pay_periods, payroll_*, movements, reconciliation_*,
 *     compensation_*, payroll_rate_snapshots.
 *   - Never approves / exports / recalculates payroll.
 *   - Only enabled when E2E_NOTE_TEST_ENABLED === "true".
 *   - Skips cleanly (with reason) when env is incomplete.
 *
 * Required env vars:
 *   E2E_NOTE_TEST_ENABLED=true      (opt-in flag)
 *   E2E_BASE_URL                    QA/staging preview URL (NOT production)
 *   E2E_STORAGE_STATE               Auth state for a user with payroll edit
 *   E2E_EMPLOYEE_ID                 Real employees.id in that QA company
 *
 * Optional:
 *   E2E_ROOT_CAUSE_URL              Full URL/path to open RootCauseExplorer.
 *                                   Defaults to
 *                                   `/app/payroll-native-dry-run?explore=<E2E_EMPLOYEE_ID>`.
 *
 * Note: notes are never deleted (MVP has no DELETE). QA may accumulate
 * synthetic notes until archived/cleanup is added in a future sprint.
 */
import { test, expect, Page, Request } from "@playwright/test";

const NOTE_TESTS_ENABLED = process.env.E2E_NOTE_TEST_ENABLED === "true";
const BASE_URL = process.env.E2E_BASE_URL ?? "";
const EMPLOYEE_ID = process.env.E2E_EMPLOYEE_ID ?? "";
const CUSTOM_URL = process.env.E2E_ROOT_CAUSE_URL ?? "";

// Any URL that looks like production must be refused.
const PROD_URL_RE = /staflyapps?\.com|staflyapp\.lovable\.app/i;

// Same sensitive-endpoint pattern used by the read-only harness.
const SENSITIVE_ENDPOINT =
  /(time_entries|scheduled_shifts|shift_assignments|pay_periods|payroll_(?!review_notes)[a-z_]+|movements|reconciliation[a-z_]*|compensation[a-z_]*|payroll_rate_snapshots)/i;

// Notes table is the ONLY sensitive-adjacent endpoint the harness may POST to,
// and only under the opt-in flag on non-prod.
const NOTES_ENDPOINT = /payroll_review_notes/i;

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const AUTH_ALLOWLIST = [/\/auth\/v1\//i, /\/token\?/i, /\/logout/i];

function shouldSkip(): string | null {
  if (!NOTE_TESTS_ENABLED) return "E2E_NOTE_TEST_ENABLED != true";
  if (!BASE_URL) return "E2E_BASE_URL missing";
  if (PROD_URL_RE.test(BASE_URL)) return `Refusing to run against production URL: ${BASE_URL}`;
  if (!EMPLOYEE_ID) return "E2E_EMPLOYEE_ID missing";
  return null;
}

function buildExplorerUrl(): string {
  if (CUSTOM_URL) return CUSTOM_URL;
  return `/app/payroll-native-dry-run?explore=${EMPLOYEE_ID}`;
}

function attachNoteNetworkGuard(page: Page) {
  page.on("request", (req: Request) => {
    const method = req.method().toUpperCase();
    if (!MUTATING_METHODS.has(method)) return;
    const url = req.url();
    if (AUTH_ALLOWLIST.some((re) => re.test(url))) return;

    // Allow ONLY POST to payroll_review_notes.
    if (NOTES_ENDPOINT.test(url)) {
      if (method !== "POST") {
        throw new Error(`Forbidden ${method} on notes endpoint: ${url}`);
      }
      return;
    }
    if (SENSITIVE_ENDPOINT.test(url)) {
      throw new Error(`Forbidden mutating request during note test: ${method} ${url}`);
    }
  });
}

test.describe("Root-Cause review notes · persistence (QA/staging only)", () => {
  const skipReason = shouldSkip();

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!!skipReason, skipReason ?? "");
    // Only run on desktop by default; mobile deferred to a future sprint.
    test.skip(testInfo.project.name === "mobile", "mobile note test deferred");
    attachNoteNetworkGuard(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("save and list a review note from RootCauseExplorer", async ({ page }, testInfo) => {
    const stamp = new Date().toISOString();
    const NOTE_TEXT = `[E2E RootCause Note] ${stamp} · synthetic QA harness`;

    await page.goto(buildExplorerUrl(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // The drawer title identifies the RootCauseExplorer sheet.
    const drawerTitle = page.getByText(/Root-cause explorer/i).first();
    await expect(drawerTitle).toBeVisible({ timeout: 15_000 });

    // Textarea placeholder is stable copy from Sprint 27.
    const textarea = page.getByPlaceholder(/contexto de revisi[oó]n/i);
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.fill(NOTE_TEXT);

    // Chip: "Revisar fichaje" (status = review_time_entry).
    const chip = page.getByRole("button", { name: /Revisar fichaje/i });
    await chip.click();

    // Save button.
    const saveBtn = page.getByRole("button", { name: /Guardar nota/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Success toast (sonner).
    const successToast = page.getByText(/Nota guardada/i).first();
    await expect(successToast).toBeVisible({ timeout: 10_000 });

    // The freshly saved note must show up in the "Notas de revisión" list.
    const savedItem = page.getByText(NOTE_TEXT, { exact: false }).first();
    await expect(savedItem).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: `test-results/root-cause/notes-saved-${testInfo.project.name}.png`,
      fullPage: false,
    });
  });
});
