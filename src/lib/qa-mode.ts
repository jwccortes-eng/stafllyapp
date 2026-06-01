/**
 * QA mode detection — used to add extra guardrails on the worker portal
 * when a developer/owner is testing flows against a real tenant.
 *
 * Activation channels:
 *   1) URL param `?qa=1` (persists in localStorage). `?qa=0` clears it.
 *   2) localStorage key `stafly:qa-mode` === '1'.
 *   3) Demo worker email pattern (`emp_5550100XX@employee.internal`).
 *
 * Never blocks real workers. Pure presentational + soft-confirm layer.
 */

const QA_KEY = "stafly:qa-mode";
const DEMO_WORKER_EMAIL_RE = /^emp_5550100\d{2}@employee\.internal$/i;

export function isDemoWorkerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEMO_WORKER_EMAIL_RE.test(email.trim());
}

export function readQaModeFlag(): boolean {
  try {
    return localStorage.getItem(QA_KEY) === "1";
  } catch {
    return false;
  }
}

export function setQaModeFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(QA_KEY, "1");
    else localStorage.removeItem(QA_KEY);
  } catch {
    /* ignore */
  }
}

/** Reads `?qa=1` / `?qa=0` once and syncs to localStorage. Safe to call in effects. */
export function syncQaModeFromUrl(search: string): void {
  try {
    const p = new URLSearchParams(search);
    const v = p.get("qa");
    if (v === "1") setQaModeFlag(true);
    else if (v === "0") setQaModeFlag(false);
  } catch {
    /* ignore */
  }
}

export interface TenantSafetyFlags {
  isDemo: boolean;
  isTest: boolean;
  isReal: boolean;
}

export function tenantSafetyFlags(
  company: { is_demo?: boolean | null; is_test?: boolean | null } | null | undefined,
): TenantSafetyFlags {
  const isDemo = company?.is_demo === true;
  const isTest = company?.is_test === true;
  return { isDemo, isTest, isReal: !isDemo && !isTest };
}
