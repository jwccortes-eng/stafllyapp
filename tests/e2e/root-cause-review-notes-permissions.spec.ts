/**
 * Sprint 31 — Root-Cause Review Notes RLS Negative-Path Spec.
 *
 * Validates that a QA/staging user WITHOUT `payroll:edit` permission cannot
 * create or archive `payroll_review_notes` from the RootCauseExplorer,
 * complementing the happy-path spec (Sprint 28 / Sprint 30) which uses a
 * user with full `payroll:edit`.
 *
 * SAFETY:
 *   - Never runs against production URLs.
 *   - Opt-in via E2E_NOTE_PERMISSIONS_TEST_ENABLED=true.
 *   - Uses a distinct storage state (E2E_STORAGE_STATE_VIEW_ONLY) so the
 *     happy-path harness auth is never overwritten.
 *   - Network guard throws on ANY mutating request to `payroll_review_notes`
 *     or to any sensitive payroll/time/shift table. A view-only session
 *     must not trigger writes; if it does, the test fails loudly.
 *   - Never issues a physical DELETE anywhere.
 *   - No RPC / edge function / storage writes allowed.
 *
 * Required env vars:
 *   E2E_NOTE_PERMISSIONS_TEST_ENABLED=true   (opt-in)
 *   E2E_BASE_URL                             QA/staging preview URL
 *   E2E_STORAGE_STATE_VIEW_ONLY              Playwright storage state for a
 *                                            user with `payroll:view` only
 *                                            (NO `payroll:edit`).
 *   E2E_EMPLOYEE_ID                          Real employees.id in QA company
 *
 * Optional:
 *   E2E_ROOT_CAUSE_URL   Override URL that opens RootCauseExplorer.
 */
import { test, expect, Page, Request } from "@playwright/test";

const ENABLED = process.env.E2E_NOTE_PERMISSIONS_TEST_ENABLED === "true";
const BASE_URL = process.env.E2E_BASE_URL ?? "";
const STORAGE_STATE = process.env.E2E_STORAGE_STATE_VIEW_ONLY ?? "";
const EMPLOYEE_ID = process.env.E2E_EMPLOYEE_ID ?? "";
const CUSTOM_URL = process.env.E2E_ROOT_CAUSE_URL ?? "";

const PROD_URL_RE = /staflyapps?\.com|staflyapp\.lovable\.app/i;

const SENSITIVE_ENDPOINT =
  /(time_entries|scheduled_shifts|shift_assignments|pay_periods|payroll_(?!review_notes)[a-z_]+|payroll_adjustments|movements|reconciliation[a-z_]*|compensation[a-z_]*|payroll_rate_snapshots)/i;
const NOTES_ENDPOINT = /payroll_review_notes/i;
const RPC_ENDPOINT = /\/rest\/v1\/rpc\//i;
const EDGE_FN_ENDPOINT = /\/functions\/v1\//i;
const STORAGE_WRITE_ENDPOINT = /\/storage\/v1\/object\//i;

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const AUTH_ALLOWLIST = [/\/auth\/v1\//i, /\/token\?/i, /\/logout/i];

function shouldSkip(): string | null {
  if (!ENABLED) return "E2E_NOTE_PERMISSIONS_TEST_ENABLED != true";
  if (!BASE_URL) return "E2E_BASE_URL missing";
  if (PROD_URL_RE.test(BASE_URL)) return `Refusing to run against production URL: ${BASE_URL}`;
  if (!STORAGE_STATE) return "E2E_STORAGE_STATE_VIEW_ONLY missing";
  if (!EMPLOYEE_ID) return "E2E_EMPLOYEE_ID missing";
  return null;
}

function buildExplorerUrl(): string {
  if (CUSTOM_URL) return CUSTOM_URL;
  return `/app/payroll-native-dry-run?explore=${EMPLOYEE_ID}`;
}

/**
 * View-only network guard.
 *
 * NO mutating request on `payroll_review_notes` is allowed — the whole
 * point of this spec is that the UI must not attempt writes for a
 * view-only user. If the UI ever fires one, the RLS server-side would
 * reject it, but we still want the client-side surface to be inert.
 */
function attachViewOnlyGuard(page: Page, violations: string[]) {
  page.on("request", (req: Request) => {
    const method = req.method().toUpperCase();
    if (!MUTATING_METHODS.has(method)) return;
    const url = req.url();
    if (AUTH_ALLOWLIST.some((re) => re.test(url))) return;

    if (RPC_ENDPOINT.test(url)) {
      violations.push(`RPC ${method} ${url}`);
      return;
    }
    if (EDGE_FN_ENDPOINT.test(url)) {
      violations.push(`edge-fn ${method} ${url}`);
      return;
    }
    if (STORAGE_WRITE_ENDPOINT.test(url)) {
      violations.push(`storage ${method} ${url}`);
      return;
    }
    if (NOTES_ENDPOINT.test(url)) {
      violations.push(`notes ${method} ${url}`);
      return;
    }
    if (SENSITIVE_ENDPOINT.test(url)) {
      violations.push(`sensitive ${method} ${url}`);
    }
  });
}

test.describe("Root-Cause review notes · view-only RLS (QA/staging only)", () => {
  const skipReason = shouldSkip();

  test.use(STORAGE_STATE ? { storageState: STORAGE_STATE } : {});

  test("view-only user cannot create or archive review notes", async ({ page }, testInfo) => {
    test.skip(!!skipReason, skipReason ?? "");
    test.skip(testInfo.project.name === "mobile", "mobile view-only test deferred");

    const violations: string[] = [];
    attachViewOnlyGuard(page, violations);

    await page.goto(buildExplorerUrl(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const drawerTitle = page.getByText(/Root-cause explorer/i).first();
    await expect(drawerTitle).toBeVisible({ timeout: 15_000 });

    // --- 1. Note section may render, but writes must be inert. ----------
    // Best case: the UI hides the save/archive controls entirely for
    // view-only users. Acceptable fallback: controls are visible but any
    // attempted write triggers an error toast and no mutating request
    // reaches the notes endpoint.
    const textarea = page.getByPlaceholder(/contexto de revisi[oó]n/i);
    const saveBtn = page.getByRole("button", { name: /Guardar nota/i });

    const textareaCount = await textarea.count();
    const saveCount = await saveBtn.count();

    if (saveCount > 0 && textareaCount > 0) {
      // Controls surfaced → attempt to save and expect either:
      //   - the save button stays disabled, or
      //   - the request never reaches payroll_review_notes (no violation), or
      //   - an error toast is shown.
      const stamp = new Date().toISOString();
      await textarea.fill(`[E2E RLS-neg] ${stamp} · view-only harness`);
      const chip = page.getByRole("button", { name: /Revisar fichaje/i });
      if ((await chip.count()) > 0) await chip.click();

      const disabled = await saveBtn.isDisabled().catch(() => false);
      if (!disabled) {
        await saveBtn.click({ trial: false }).catch(() => {});
        // Wait briefly for either a toast or a network attempt.
        const errorToast = page.getByText(
          /No se pudo guardar la nota|permiso|forbidden|denied/i,
        ).first();
        await expect(errorToast).toBeVisible({ timeout: 8_000 }).catch(() => {});
        // "Nota guardada" success toast MUST NOT appear.
        await expect(page.getByText(/Nota guardada/i)).toHaveCount(0);
      }
    }

    // --- 2. Archive controls must not lead to a successful archive. -----
    // If any existing note is visible, the archive button either does not
    // render (preferred) or, if it does, clicking it must not succeed.
    const archiveBtn = page.getByRole("button", { name: /^Archivar$/i }).first();
    if ((await archiveBtn.count()) > 0) {
      await archiveBtn.click().catch(() => {});
      const confirm = page.getByRole("button", { name: /^Archivar$/i }).last();
      if ((await confirm.count()) > 0) {
        await confirm.click().catch(() => {});
      }
      // Success toast for archive MUST NOT appear.
      await expect(page.getByText(/Nota archivada/i)).toHaveCount(0);
    }

    await page.screenshot({
      path: `test-results/root-cause/notes-view-only-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // --- 3. Network guard: no successful writes to sensitive endpoints. -
    // Any recorded violation → hard fail with a readable message.
    expect(
      violations,
      `View-only session triggered forbidden writes:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
