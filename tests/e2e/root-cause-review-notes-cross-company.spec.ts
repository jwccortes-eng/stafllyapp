/**
 * Sprint 32 — Root-Cause Review Notes Cross-Company Negative E2E Guard.
 *
 * Validates that an authenticated user from a DIFFERENT company/tenant
 * cannot view, create, archive or mutate `payroll_review_notes` belonging
 * to another tenant via the RootCauseExplorer, nor emit any mutating
 * request against payroll/timekeeping-adjacent tables from a cross-company
 * session.
 *
 * Complements:
 *   - Sprint 28 / 30 (happy path, payroll:edit)
 *   - Sprint 31 (view-only RLS negative path)
 *
 * SAFETY:
 *   - Opt-in via E2E_NOTE_CROSS_COMPANY_TEST_ENABLED=true.
 *   - Refuses to run against production URLs.
 *   - Uses a dedicated storage state (E2E_STORAGE_STATE_CROSS_COMPANY) so
 *     no other harness auth is overwritten.
 *   - Never uses service_role. Never issues a physical DELETE.
 *   - Never inserts real PII. Any synthetic note uses the prefix
 *     `[E2E cross-company neg] <ISO>`.
 *   - Network guard flags any mutating request to sensitive endpoints as
 *     a violation (method + URL only — no payload is stored).
 *   - Desktop-only for now.
 *
 * Required env vars:
 *   E2E_NOTE_CROSS_COMPANY_TEST_ENABLED=true
 *   E2E_BASE_URL                          QA/staging preview URL
 *   E2E_STORAGE_STATE_CROSS_COMPANY       Playwright storage state for a
 *                                         user in a DIFFERENT company
 *                                         than E2E_EMPLOYEE_ID.
 *   E2E_EMPLOYEE_ID                       employees.id from the OTHER
 *                                         (target) company that the
 *                                         cross-company user must NOT be
 *                                         able to see/mutate.
 *
 * Optional:
 *   E2E_ROOT_CAUSE_URL   Override URL that opens RootCauseExplorer.
 */
import { test, expect, Page, Request } from "@playwright/test";

const ENABLED = process.env.E2E_NOTE_CROSS_COMPANY_TEST_ENABLED === "true";
const BASE_URL = process.env.E2E_BASE_URL ?? "";
const STORAGE_STATE = process.env.E2E_STORAGE_STATE_CROSS_COMPANY ?? "";
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
  if (!ENABLED) return "E2E_NOTE_CROSS_COMPANY_TEST_ENABLED != true";
  if (!BASE_URL) return "E2E_BASE_URL missing";
  if (PROD_URL_RE.test(BASE_URL)) return `Refusing to run against production URL: ${BASE_URL}`;
  if (!STORAGE_STATE) return "E2E_STORAGE_STATE_CROSS_COMPANY missing";
  if (!EMPLOYEE_ID) return "E2E_EMPLOYEE_ID missing";
  return null;
}

function buildExplorerUrl(): string {
  if (CUSTOM_URL) return CUSTOM_URL;
  return `/app/payroll-native-dry-run?explore=${EMPLOYEE_ID}`;
}

/**
 * Cross-company network guard.
 *
 * From a cross-company session, ANY mutating request to sensitive
 * endpoints (notes, payroll/time/shift-adjacent, RPC, edge functions,
 * storage writes) is a violation. Only auth/session traffic is allowed.
 * We store method + URL only — never request bodies — to avoid leaking
 * anything sensitive into logs.
 */
function attachCrossCompanyGuard(page: Page, violations: string[]) {
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

test.describe("Root-Cause review notes · cross-company RLS (QA/staging only)", () => {
  const skipReason = shouldSkip();

  test.use(STORAGE_STATE ? { storageState: STORAGE_STATE } : {});

  test("cross-company user cannot view, create or archive foreign review notes", async ({ page }, testInfo) => {
    test.skip(!!skipReason, skipReason ?? "");
    test.skip(testInfo.project.name === "mobile", "mobile cross-company test deferred (Sprint 32 desktop-only)");

    const violations: string[] = [];
    attachCrossCompanyGuard(page, violations);

    // Navigate to the RootCauseExplorer for an employee that belongs to a
    // DIFFERENT company than the signed-in user. RLS on the relevant
    // tables should prevent any data from rendering, and the UI should
    // either redirect, show empty state, or refuse to open the drawer.
    await page.goto(buildExplorerUrl(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // --- 1. No foreign notes may be visible. ----------------------------
    // The synthetic prefix we use in Sprint 28/30 must never appear here.
    await expect(
      page.getByText(/\[E2E RootCause Note\]/i),
      "cross-company session must not see notes created by the happy-path harness",
    ).toHaveCount(0);
    await expect(
      page.getByText(/\[E2E RLS-neg\]/i),
      "cross-company session must not see notes from the view-only spec",
    ).toHaveCount(0);

    // --- 2. Attempt to create a note. -----------------------------------
    // Preferred outcome: the save UI is not rendered at all (drawer is
    // empty, or RLS blocked employee context). Acceptable fallback: the
    // controls render but any save attempt fails and never reaches
    // payroll_review_notes (guard would flag it).
    const textarea = page.getByPlaceholder(/contexto de revisi[oó]n/i);
    const saveBtn = page.getByRole("button", { name: /Guardar nota/i });

    const textareaCount = await textarea.count();
    const saveCount = await saveBtn.count();

    if (saveCount > 0 && textareaCount > 0) {
      const stamp = new Date().toISOString();
      await textarea.fill(`[E2E cross-company neg] ${stamp}`);
      const chip = page.getByRole("button", { name: /Revisar fichaje/i });
      if ((await chip.count()) > 0) await chip.click();

      const disabled = await saveBtn.isDisabled().catch(() => false);
      if (!disabled) {
        await saveBtn.click({ trial: false }).catch(() => {});
        // Success toast MUST NOT appear for a cross-company user.
        await expect(page.getByText(/Nota guardada/i)).toHaveCount(0);
      }
    }

    // --- 3. Attempt to archive any surfaced note. -----------------------
    // If somehow an archive button appeared (it must not), clicking it
    // must not produce the success toast.
    const archiveBtn = page.getByRole("button", { name: /^Archivar$/i }).first();
    if ((await archiveBtn.count()) > 0) {
      await archiveBtn.click().catch(() => {});
      const confirm = page.getByRole("button", { name: /^Archivar$/i }).last();
      if ((await confirm.count()) > 0) {
        await confirm.click().catch(() => {});
      }
      await expect(page.getByText(/Nota archivada/i)).toHaveCount(0);
    }

    await page.screenshot({
      path: `test-results/root-cause/notes-cross-company-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // --- 4. Network guard: no mutating writes anywhere sensitive. -------
    expect(
      violations,
      `Cross-company session triggered forbidden requests:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
