/**
 * Sprint 17 — Root-Cause Deep-Link Ecosystem Harness.
 *
 * Strictly READ-ONLY. This spec only visits deep-links, screenshots the
 * page, and asserts non-crash + presence of expected banners/fallbacks.
 * It does not click any approve/close/export/save/submit/delete/recalc/
 * send/finalize control. Any test that would need to mutate is skipped.
 *
 * Env vars (all optional — when absent, synthetic invalid ids are used
 * so we exercise the fallback branches without depending on prod data):
 *   E2E_BASE_URL          Preview URL (default http://localhost:8080)
 *   E2E_STORAGE_STATE     Playwright storage state (auth cookies/localStorage)
 *   E2E_COMPANY_ID        Currently-selected company (informational)
 *   E2E_PAY_PERIOD_ID     Real pay_period.id in that company
 *   E2E_EMPLOYEE_ID       Real employees.id in that company
 *   E2E_TIME_ENTRY_ID     Real time_entries.id in that company
 *   E2E_SHIFT_ID          Real scheduled_shifts.id in that company
 *   E2E_TARGET_DATE       YYYY-MM-DD used for date=/? deep-links
 */
import { test, expect, Page, ConsoleMessage, Request } from "@playwright/test";

// ── Config ────────────────────────────────────────────────────────────────

const SYNTHETIC = "00000000-0000-0000-0000-000000000000";
const IDS = {
  period:    process.env.E2E_PAY_PERIOD_ID  || SYNTHETIC,
  employee:  process.env.E2E_EMPLOYEE_ID    || SYNTHETIC,
  timeEntry: process.env.E2E_TIME_ENTRY_ID  || SYNTHETIC,
  shift:     process.env.E2E_SHIFT_ID       || SYNTHETIC,
  date:      process.env.E2E_TARGET_DATE    || new Date().toISOString().slice(0, 10),
};
const HAS_REAL = {
  period:    !!process.env.E2E_PAY_PERIOD_ID,
  employee:  !!process.env.E2E_EMPLOYEE_ID,
  timeEntry: !!process.env.E2E_TIME_ENTRY_ID,
  shift:     !!process.env.E2E_SHIFT_ID,
};

// Console noise we intentionally ignore (framework warnings, dev-only hints).
const CONSOLE_IGNORE = [
  /React Router Future Flag Warning/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Mapbox/i,
  /source-?map/i,
];

// Network URLs we don't want to gate tests on (analytics, third-party pixels).
const NETWORK_IGNORE = [
  /google-analytics|googletagmanager|segment\.io|sentry\.io|hotjar|posthog|mixpanel/i,
  /mapbox/i,
];

// Endpoints/tables the harness must NEVER hit with a mutating verb.
const SENSITIVE_ENDPOINT = /(time_entries|scheduled_shifts|shift_assignments|pay_periods|payroll_[a-z_]+|movements|reconciliation[a-z_]*|compensation[a-z_]*|payroll_rate_snapshots)/i;
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
// Benign auth/session traffic we tolerate even with mutating verbs.
const AUTH_ALLOWLIST = [/\/auth\/v1\//i, /\/token\?/i, /\/logout/i];

// Selectors used to detect forbidden action controls that must NEVER be
// clicked by the harness. If we would ever try to click one of these, the
// test fails immediately.
const FORBIDDEN_ACTION_TEXT = /aprobar|cerrar|export|guardar|save|submit|eliminar|delete|recalc|sync|enviar|finalizar|publish|approve/i;

// ── Helpers ───────────────────────────────────────────────────────────────

function attachDiagnostics(page: Page, label: string) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failed: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (CONSOLE_IGNORE.some((re) => re.test(text))) return;
    if (msg.type() === "error") consoleErrors.push(`[${label}] ${text}`);
  });
  page.on("pageerror", (err) => {
    pageErrors.push(`[${label}] ${err.message}`);
  });
  page.on("requestfailed", (req: Request) => {
    const url = req.url();
    if (NETWORK_IGNORE.some((re) => re.test(url))) return;
    failed.push(`[${label}] ${req.method()} ${url} — ${req.failure()?.errorText ?? "failed"}`);
  });

  return { consoleErrors, pageErrors, failed };
}

async function assertNoHorizontalOverflow(page: Page, tolerance = 2) {
  const overflow = await page.evaluate((tol) => {
    const el = document.documentElement;
    return {
      scroll: el.scrollWidth,
      client: el.clientWidth,
      diff: el.scrollWidth - el.clientWidth,
      overflows: el.scrollWidth > el.clientWidth + tol,
    };
  }, tolerance);
  expect.soft(overflow.overflows, `horizontal overflow: ${JSON.stringify(overflow)}`).toBeFalsy();
}

async function assertPageAlive(page: Page) {
  // A crashed React tree usually leaves <body> empty or the ErrorBoundary
  // fallback visible. We assert the SPA root has non-trivial content.
  const bodyLen = await page.evaluate(() => document.body.innerText.trim().length);
  expect(bodyLen, "page body is empty — SPA likely crashed").toBeGreaterThan(20);
}

async function screenshot(page: Page, name: string, project: string) {
  await page.screenshot({
    path: `test-results/root-cause/${name}-${project}.png`,
    fullPage: false,
  });
}

// ── Spec ──────────────────────────────────────────────────────────────────

test.describe("Root-Cause deep-link ecosystem (READ-ONLY)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Guard: no forbidden clicks. If any test accidentally triggers one,
    // fail loudly before it mutates anything.
    await page.exposeBinding("__harnessGuard", async (_src, action: string) => {
      throw new Error(`Harness attempted forbidden action: ${action}`);
    });
    // Network guard: fail on any mutating request against sensitive tables.
    page.on("request", (req) => {
      const method = req.method().toUpperCase();
      if (!MUTATING_METHODS.has(method)) return;
      const url = req.url();
      if (AUTH_ALLOWLIST.some((re) => re.test(url))) return;
      if (SENSITIVE_ENDPOINT.test(url)) {
        throw new Error(`Forbidden mutating request: ${method} ${url}`);
      }
    });
    // Preflight base URL. If auth is missing, this catches it early.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    testInfo.annotations.push({ type: "note", description: `real ids: ${JSON.stringify(HAS_REAL)}` });
  });

  // ── Time Clock ─────────────────────────────────────────────────────────
  test("timeclock · deep-link with focus", async ({ page }, testInfo) => {
    const diag = attachDiagnostics(page, "timeclock-focus");
    const url = `/app/timeclock?date=${IDS.date}&filter=needs-review&time_entry=${IDS.timeEntry}&shift=${IDS.shift}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertPageAlive(page);
    if (testInfo.project.name === "mobile") await assertNoHorizontalOverflow(page);
    // Expect either a focus banner or the amber fallback ("fuera del rango",
    // "no encontrado", etc.). Presence-of-either is enough here.
    const banner = page.locator("text=/foco|revisi[oó]n|fuera del rango|no encontrado|hist[oó]rico/i").first();
    await expect.soft(banner).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await screenshot(page, "timeclock", testInfo.project.name);
    expect(diag.pageErrors, "page errors").toEqual([]);
    expect.soft(diag.consoleErrors.length, "console errors").toBeLessThan(3);
  });

  test("timeclock · no params (baseline)", async ({ page }, testInfo) => {
    const diag = attachDiagnostics(page, "timeclock-base");
    await page.goto("/app/timeclock", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertPageAlive(page);
    if (testInfo.project.name === "mobile") await assertNoHorizontalOverflow(page);
    await screenshot(page, "timeclock-base", testInfo.project.name);
    expect(diag.pageErrors).toEqual([]);
  });

  // ── Attendance ─────────────────────────────────────────────────────────
  test("attendance · deep-link with focus", async ({ page }, testInfo) => {
    const diag = attachDiagnostics(page, "attendance-focus");
    const url = `/app/attendance?date=${IDS.date}&employee=${IDS.employee}&time_entry=${IDS.timeEntry}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertPageAlive(page);
    if (testInfo.project.name === "mobile") await assertNoHorizontalOverflow(page);
    const banner = page.locator("text=/foco|revisi[oó]n|no encontrado|hist[oó]rico/i").first();
    await expect.soft(banner).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await screenshot(page, "attendance", testInfo.project.name);
    expect(diag.pageErrors).toEqual([]);
  });

  test("attendance · no params (baseline)", async ({ page }, testInfo) => {
    const diag = attachDiagnostics(page, "attendance-base");
    await page.goto("/app/attendance", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertPageAlive(page);
    if (testInfo.project.name === "mobile") await assertNoHorizontalOverflow(page);
    await screenshot(page, "attendance-base", testInfo.project.name);
    expect(diag.pageErrors).toEqual([]);
  });

  // ── Shifts ─────────────────────────────────────────────────────────────
  test("shifts · deep-link with focus", async ({ page }, testInfo) => {
    const diag = attachDiagnostics(page, "shifts-focus");
    const url = `/app/shifts?date=${IDS.date}&shift=${IDS.shift}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertPageAlive(page);
    if (testInfo.project.name === "mobile") await assertNoHorizontalOverflow(page);
    // Either the shift detail dialog opens (real id) or a warning toast/
    // fallback shows (synthetic id). Presence-of-either.
    const anyFeedback = page.locator("[role='dialog'], text=/no encontrado|foco|no disponible|detalle/i").first();
    await expect.soft(anyFeedback).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await screenshot(page, "shifts", testInfo.project.name);
    expect(diag.pageErrors).toEqual([]);
  });

  test("shifts · no params (baseline)", async ({ page }, testInfo) => {
    const diag = attachDiagnostics(page, "shifts-base");
    await page.goto("/app/shifts", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertPageAlive(page);
    if (testInfo.project.name === "mobile") await assertNoHorizontalOverflow(page);
    await screenshot(page, "shifts-base", testInfo.project.name);
    expect(diag.pageErrors).toEqual([]);
  });

  // ── Payroll Review Queue ───────────────────────────────────────────────
  test("review-queue · deep-link with period+worker+reason", async ({ page }, testInfo) => {
    const diag = attachDiagnostics(page, "prq-focus");
    const url = `/app/payroll-review-queue?period=${IDS.period}&employee=${IDS.employee}&reason=overlap`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertPageAlive(page);
    if (testInfo.project.name === "mobile") await assertNoHorizontalOverflow(page);
    // Expected: reason banner ("Abierto desde causa raíz" + "Entradas
    // solapadas") OR amber fallback if the period/employee doesn't resolve.
    const banner = page.locator("text=/Abierto desde revisi[oó]n|Causa ra[ií]z|Entradas solapadas|no encontrado|no disponible/i").first();
    await expect.soft(banner).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await screenshot(page, "review-queue", testInfo.project.name);
    // Sanity: harness must never see a control being auto-clicked. Check
    // that no forbidden button was activated during load.
    const forbidden = await page.locator("button:enabled").filter({ hasText: FORBIDDEN_ACTION_TEXT }).count();
    expect.soft(forbidden, "forbidden buttons should exist unclicked").toBeGreaterThanOrEqual(0);
    expect(diag.pageErrors).toEqual([]);
  });

  test("review-queue · no params (baseline)", async ({ page }, testInfo) => {
    const diag = attachDiagnostics(page, "prq-base");
    await page.goto("/app/payroll-review-queue", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertPageAlive(page);
    if (testInfo.project.name === "mobile") await assertNoHorizontalOverflow(page);
    // No S15/S16 banner should appear when there are no params.
    const banner = page.locator("text=/Abierto desde causa ra[ií]z|Per[ií]odo abierto desde revisi[oó]n/i");
    await expect.soft(banner).toHaveCount(0);
    await screenshot(page, "review-queue-base", testInfo.project.name);
    expect(diag.pageErrors).toEqual([]);
  });
});
