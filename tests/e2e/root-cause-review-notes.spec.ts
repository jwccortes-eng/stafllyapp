/**
 * Sprint 28 → Sprint 30 — Root-Cause Review Notes QA Harness (create + archive cleanup).
 *
 * Verifies end-to-end that a payroll review note can be saved, listed, and
 * archived via soft-delete from the RootCauseExplorer against a QA/staging
 * environment with a real signed-in user that has payroll module
 * `view` + `edit` permission.
 *
 * SAFETY:
 *   - Never runs against production URLs (staflyapps.com / staflyapp.lovable.app).
 *   - Only touches `payroll_review_notes` (Sprint 27 MVP + Sprint 29 archive).
 *   - Explicitly BLOCKS any mutating request to time_entries, scheduled_shifts,
 *     shift_assignments, pay_periods, payroll_* (except payroll_review_notes),
 *     movements, reconciliation_*, compensation_*, payroll_rate_snapshots,
 *     payroll_adjustments.
 *   - Never approves / exports / recalculates payroll.
 *   - Never issues a physical DELETE on `payroll_review_notes` — archiving is
 *     a soft-delete via UPDATE (PATCH) only, gated by RLS + defensive trigger.
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
 * Sprint 30 flow: create → list → archive → hidden. The note is soft-deleted
 * at the end so QA does not accumulate active E2E notes.
 */
import { test, expect, Page, Request } from "@playwright/test";

const NOTE_TESTS_ENABLED = process.env.E2E_NOTE_TEST_ENABLED === "true";
const BASE_URL = process.env.E2E_BASE_URL ?? "";
const EMPLOYEE_ID = process.env.E2E_EMPLOYEE_ID ?? "";
const CUSTOM_URL = process.env.E2E_ROOT_CAUSE_URL ?? "";

// Any URL that looks like production must be refused.
const PROD_URL_RE = /staflyapps?\.com|staflyapp\.lovable\.app/i;

// Same sensitive-endpoint pattern used by the read-only harness.
// Explicitly enumerates payroll_adjustments to keep intent obvious even though
// it already matches the generic payroll_* branch.
const SENSITIVE_ENDPOINT =
  /(time_entries|scheduled_shifts|shift_assignments|pay_periods|payroll_(?!review_notes)[a-z_]+|payroll_adjustments|movements|reconciliation[a-z_]*|compensation[a-z_]*|payroll_rate_snapshots)/i;

// Notes table is the ONLY sensitive-adjacent endpoint the harness may write
// to, and only under the opt-in flag on non-prod.
const NOTES_ENDPOINT = /payroll_review_notes/i;

// RPC / edge functions / storage are strictly forbidden for this spec.
const RPC_ENDPOINT = /\/rest\/v1\/rpc\//i;
const EDGE_FN_ENDPOINT = /\/functions\/v1\//i;
const STORAGE_WRITE_ENDPOINT = /\/storage\/v1\/object\//i;

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

    // Hard bans regardless of table.
    if (RPC_ENDPOINT.test(url)) {
      throw new Error(`Forbidden RPC during note test: ${method} ${url}`);
    }
    if (EDGE_FN_ENDPOINT.test(url)) {
      throw new Error(`Forbidden edge function during note test: ${method} ${url}`);
    }
    if (STORAGE_WRITE_ENDPOINT.test(url)) {
      throw new Error(`Forbidden storage write during note test: ${method} ${url}`);
    }

    // Notes: allow POST (create) + PATCH/PUT (archive). DELETE forbidden.
    if (NOTES_ENDPOINT.test(url)) {
      if (method === "DELETE") {
        throw new Error(`Forbidden physical DELETE on notes endpoint: ${url}`);
      }
      if (method !== "POST" && method !== "PATCH" && method !== "PUT") {
        throw new Error(`Forbidden ${method} on notes endpoint: ${url}`);
      }
      return;
    }

    if (SENSITIVE_ENDPOINT.test(url)) {
      throw new Error(`Forbidden mutating request during note test: ${method} ${url}`);
    }
  });
}

test.describe("Root-Cause review notes · create + archive (QA/staging only)", () => {
  const skipReason = shouldSkip();

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!!skipReason, skipReason ?? "");
    // Only run on desktop by default; mobile deferred to a future sprint.
    test.skip(testInfo.project.name === "mobile", "mobile note test deferred");
    attachNoteNetworkGuard(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("save, list, archive and hide a review note from RootCauseExplorer", async ({ page }, testInfo) => {
    const stamp = new Date().toISOString();
    const NOTE_TEXT = `[E2E RootCause Note] ${stamp} · synthetic QA harness`;

    await page.goto(buildExplorerUrl(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // The drawer title identifies the RootCauseExplorer sheet.
    const drawerTitle = page.getByText(/Root-cause explorer/i).first();
    await expect(drawerTitle).toBeVisible({ timeout: 15_000 });

    // --- 1. Create synthetic note ---------------------------------------
    const textarea = page.getByPlaceholder(/contexto de revisi[oó]n/i);
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.fill(NOTE_TEXT);

    // Chip: "Revisar fichaje" (status = review_time_entry).
    const chip = page.getByRole("button", { name: /Revisar fichaje/i });
    await chip.click();

    const saveBtn = page.getByRole("button", { name: /Guardar nota/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Success toast (sonner).
    await expect(page.getByText(/Nota guardada/i).first()).toBeVisible({ timeout: 10_000 });

    // --- 2. Validate note appears in active list ------------------------
    const savedItem = page.getByText(NOTE_TEXT, { exact: false }).first();
    await expect(savedItem).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: `test-results/root-cause/notes-saved-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // --- 3. Archive the note via the UI (soft-delete) -------------------
    // The archive button lives inside the <li> that contains the note text.
    const noteItem = page.locator("li", { hasText: NOTE_TEXT }).first();
    await expect(noteItem).toBeVisible();

    const archiveBtn = noteItem.getByRole("button", { name: /^Archivar$/i });
    if ((await archiveBtn.count()) === 0) {
      throw new Error(
        "Sprint 30: 'Archivar' button not found on the freshly created note — " +
          "check that the QA user has payroll `edit` permission and Sprint 29 UI is deployed.",
      );
    }
    await archiveBtn.click();

    // Inline confirmation appears with a second "Archivar" CTA inside the same <li>.
    const confirmBtn = noteItem.getByRole("button", { name: /^Archivar$/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Success toast for archive.
    await expect(page.getByText(/Nota archivada/i).first()).toBeVisible({ timeout: 10_000 });

    // --- 4. Validate note disappears from the active list ---------------
    await expect(page.getByText(NOTE_TEXT, { exact: false })).toHaveCount(0, {
      timeout: 10_000,
    });

    await page.screenshot({
      path: `test-results/root-cause/notes-archived-${testInfo.project.name}.png`,
      fullPage: false,
    });
  });
});
