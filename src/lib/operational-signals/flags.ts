/**
 * F1 — Shadow mode flags. STRICT: while shadow mode is on, the engine may only
 * observe and record. Nothing here can enable sending.
 */
const SHADOW_KEY = "ose:shadow-mode";
const PERSIST_KEY = "ose:shadow-persistence";
const PANEL_KEY = "ose:shadow-panel";
const KILL_KEY = "ose:kill-switch";

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

/** Rollback level 0: nothing is observed, evaluated or stored. */
export function isKillSwitchEngaged(): boolean {
  return read(KILL_KEY) === "on";
}

export function setKillSwitch(engaged: boolean): void {
  write(KILL_KEY, engaged ? "on" : null);
}

/**
 * `operational_signal_shadow_mode`. Defaults to TRUE and, in F1, cannot be
 * turned off — enforcement is out of scope for this phase.
 */
export function isShadowModeEnabled(): boolean {
  return true;
}

/** Only shadow mode is supported in F1. Kept explicit for future phases. */
export function isEnforcementEnabled(): boolean {
  return false;
}

/** Durable recording of shadow decisions (off by default). */
export function isShadowPersistenceEnabled(): boolean {
  if (isKillSwitchEngaged()) return false;
  if (import.meta.env.VITE_OSE_SHADOW_PERSISTENCE === "true") return true;
  return read(PERSIST_KEY) === "on";
}

export function setShadowPersistenceEnabled(enabled: boolean): void {
  write(PERSIST_KEY, enabled ? "on" : null);
}

/** Internal analysis dashboard visibility (staff only, on top of RLS). */
export function isShadowPanelEnabled(): boolean {
  if (isKillSwitchEngaged()) return false;
  if (import.meta.env.VITE_OSE_SHADOW_PANEL === "true") return true;
  return read(PANEL_KEY) !== "off";
}

export function setShadowPanelEnabled(enabled: boolean): void {
  write(PANEL_KEY, enabled ? null : "off");
}
