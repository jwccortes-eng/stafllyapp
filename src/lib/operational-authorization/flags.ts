/**
 * OAI F1 Stage 1 — feature flags. ALL OFF BY DEFAULT.
 *
 * Three independent flags. A global flag is never the only protection:
 * persistence additionally requires the company to be in the local allowlist
 * AND a live row in `oai_pilot_allowlist` (enforced server side).
 */
const OBSERVATION_KEY = "oai:observation-enabled";
const PANEL_KEY = "oai:observation-panel-enabled";
const PERSISTENCE_KEY = "oai:observation-persistence-enabled";
const COMPANIES_KEY = "oai:observation-companies";
const KILL_SWITCH_KEY = "oai:kill-switch";
const DAILY_CAP_KEY = "oai:daily-cap";

/** Hard ceiling for Stage 1, per company, per day. */
export const OAI_DEFAULT_DAILY_CAP = 2000;

function read(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

/** Rollback level 0. When engaged nothing is observed, evaluated or stored. */
export function isKillSwitchEngaged(): boolean {
  return read(KILL_SWITCH_KEY) === "on";
}

export function setKillSwitch(engaged: boolean): void {
  write(KILL_SWITCH_KEY, engaged ? "on" : null);
}

export function isObservationEnabled(): boolean {
  if (isKillSwitchEngaged()) return false;
  if (import.meta.env.VITE_OAI_OBSERVATION_ENABLED === "true") return true;
  return read(OBSERVATION_KEY) === "on";
}

export function setObservationEnabled(enabled: boolean): void {
  write(OBSERVATION_KEY, enabled ? "on" : null);
}

export function isPanelEnabled(): boolean {
  if (isKillSwitchEngaged()) return false;
  if (import.meta.env.VITE_OAI_OBSERVATION_PANEL_ENABLED === "true") return true;
  return read(PANEL_KEY) === "on";
}

export function setPanelEnabled(enabled: boolean): void {
  write(PANEL_KEY, enabled ? "on" : null);
}

export function isPersistenceEnabled(): boolean {
  if (!isObservationEnabled()) return false;
  if (import.meta.env.VITE_OAI_OBSERVATION_PERSISTENCE_ENABLED === "true") return true;
  return read(PERSISTENCE_KEY) === "on";
}

export function setPersistenceEnabled(enabled: boolean): void {
  write(PERSISTENCE_KEY, enabled ? "on" : null);
}

/* ---------------- per-company activation (no fallbacks) ---------------- */

export function getCompanyAllowlist(): string[] {
  const raw = read(COMPANIES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function setCompanyAllowlist(companyIds: string[]): void {
  write(COMPANIES_KEY, companyIds.length === 0 ? null : JSON.stringify(companyIds));
}

export function isCompanyObserved(companyId: string | null | undefined): boolean {
  if (!companyId) return false;
  if (isKillSwitchEngaged()) return false;
  return getCompanyAllowlist().includes(companyId);
}

export function getDailyCap(): number {
  const value = Number(read(DAILY_CAP_KEY));
  return Number.isFinite(value) && value > 0 ? value : OAI_DEFAULT_DAILY_CAP;
}

export function setDailyCap(cap: number): void {
  write(DAILY_CAP_KEY, Number.isFinite(cap) && cap > 0 ? String(cap) : null);
}
