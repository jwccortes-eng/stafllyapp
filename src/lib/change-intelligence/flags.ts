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
