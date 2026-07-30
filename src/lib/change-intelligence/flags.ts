/**
 * Change Intelligence — F1 Observation Mode flag.
 * Default OFF. Turning it off is rollback level 1: the engine stops running.
 */
const STORAGE_KEY = "ci:observation-mode";

export function isObservationModeEnabled(): boolean {
  if (import.meta.env.VITE_CI_OBSERVATION_MODE === "true") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setObservationMode(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "on");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/* ============================================================
 * F1.2 — Durable Shadow Observation flags.
 * OFF by default. Stage 1 can NEVER activate automatically:
 * it needs this flag AND a live row in ci_pilot_allowlist.
 * ============================================================ */
const DURABLE_KEY = "ci:durable-observation";
const DURABLE_ENV_KEY = "ci:durable-environment";
const DURABLE_STAGE_KEY = "ci:durable-pilot-stage";
const SAMPLE_RATE_KEY = "ci:observation-sample-rate";

export type CiDurableEnvironment = "demo" | "staging" | "production";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Rollback level 0: turn this off and nothing is persisted. */
export function isDurableObservationEnabled(): boolean {
  if (!isObservationModeEnabled()) return false;
  if (import.meta.env.VITE_CI_DURABLE_OBSERVATION === "true") return true;
  return read(DURABLE_KEY) === "on";
}

export function setDurableObservation(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(DURABLE_KEY, "on");
    else localStorage.removeItem(DURABLE_KEY);
  } catch {
    /* noop */
  }
}

export function getDurableEnvironment(): CiDurableEnvironment {
  const value = read(DURABLE_ENV_KEY);
  return value === "staging" || value === "production" ? value : "demo";
}

export function setDurableEnvironment(env: CiDurableEnvironment): void {
  try {
    localStorage.setItem(DURABLE_ENV_KEY, env);
  } catch {
    /* noop */
  }
}

/** Stage 1 only in F1.2. Stages 2 and 3 require a new explicit approval. */
export function getDurablePilotStage(): 1 | 2 | 3 {
  const value = Number(read(DURABLE_STAGE_KEY));
  return value === 2 || value === 3 ? (value as 2 | 3) : 1;
}

export function getObservationSampleRate(): number {
  const raw = Number(read(SAMPLE_RATE_KEY));
  if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return 1;
  return raw;
}

/* ------------------------------------------------------------------
 * F1.2 Stage 1 — per-company activation.
 * There is NO environment fallback and NO role fallback: a company is
 * observed only if its id is explicitly listed here AND has a live row
 * in ci_pilot_allowlist. An empty list means "no company is observed".
 * ------------------------------------------------------------------ */
const DURABLE_COMPANIES_KEY = "ci:durable-companies";

export function getDurableCompanyAllowlist(): string[] {
  const raw = read(DURABLE_COMPANIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function setDurableCompanyAllowlist(companyIds: string[]): void {
  try {
    if (companyIds.length === 0) localStorage.removeItem(DURABLE_COMPANIES_KEY);
    else localStorage.setItem(DURABLE_COMPANIES_KEY, JSON.stringify(companyIds));
  } catch {
    /* noop */
  }
}

export function isDurableCompanyAllowed(companyId: string | null | undefined): boolean {
  if (!companyId) return false;
  return getDurableCompanyAllowlist().includes(companyId);
}
