/**
 * P0 — Persistent Session & Last Workspace Restoration.
 *
 * Device-scoped operational memory: remembers, per authenticated user and per
 * device, the last company, the last active mode/role and the last valid
 * route. Lives in localStorage (device), NOT sessionStorage (tab), so closing
 * the browser / locking the phone / killing the app never loses the context.
 *
 * Frontend-only. Never touches auth tokens, RLS, memberships, roles, payroll,
 * time_entries, shift_assignments, scheduled_shifts, documents or any data.
 */

import { safeLocalStorage } from "@/lib/safe-storage";

const WORKSPACE_MEMORY_PREFIX = "stafly:workspace-memory:v1:";

/** Routes we are willing to remember and restore. */
const SAFE_ROUTE_PREFIXES = ["/app", "/portal", "/parceros"];

export interface WorkspaceMemory {
  /** Last company the user actually worked in on this device. */
  companyId: string | null;
  /** Last active mode ("admin" | "portal" | ...) — informational. */
  mode: string | null;
  /** Last valid in-app route (path + search). */
  route: string | null;
  updatedAt: number;
}

const EMPTY: WorkspaceMemory = { companyId: null, mode: null, route: null, updatedAt: 0 };

function key(userId: string): string {
  return WORKSPACE_MEMORY_PREFIX + userId;
}

export function isRestorableRoute(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path === "/" || path.startsWith("/auth") || path.startsWith("/login")) return false;
  return SAFE_ROUTE_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"),
  );
}

export function readWorkspaceMemory(userId: string | null | undefined): WorkspaceMemory {
  if (!userId) return EMPTY;
  const raw = safeLocalStorage.getItem(key(userId));
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceMemory>;
    return {
      companyId: typeof parsed.companyId === "string" ? parsed.companyId : null,
      mode: typeof parsed.mode === "string" ? parsed.mode : null,
      route: typeof parsed.route === "string" && isRestorableRoute(parsed.route) ? parsed.route : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return EMPTY;
  }
}

function write(userId: string, next: WorkspaceMemory) {
  safeLocalStorage.setItem(key(userId), JSON.stringify({ ...next, updatedAt: Date.now() }));
}

export function rememberCompany(userId: string | null | undefined, companyId: string | null): void {
  if (!userId) return;
  const current = readWorkspaceMemory(userId);
  if (current.companyId === companyId) return;
  // A company switch invalidates the remembered route: it belonged to the
  // previous tenant and would be an invalid screen in the new one.
  write(userId, { ...current, companyId, route: null });
}

export function rememberRoute(userId: string | null | undefined, route: string | null): void {
  if (!userId || !isRestorableRoute(route)) return;
  const current = readWorkspaceMemory(userId);
  if (current.route === route) return;
  write(userId, { ...current, route });
}

/**
 * Resolve where a returning user should land, given the surfaces they can
 * access. Returns null when there is nothing valid to restore, so callers
 * fall back to their normal defaults (dashboard of the active company).
 */
export function resolveRestoreTarget(args: {
  userId: string | null | undefined;
  canAccessAdmin?: boolean;
  canAccessPortal?: boolean;
}): string | null {
  const { userId, canAccessAdmin = false, canAccessPortal = false } = args;
  if (!userId) return null;
  const route = readWorkspaceMemory(userId).route;
  if (!route || !isRestorableRoute(route)) return null;
  if (route.startsWith("/app")) return canAccessAdmin ? route : null;
  if (route.startsWith("/portal")) return canAccessPortal ? route : null;
  if (route.startsWith("/parceros")) return route;
  return null;
}


export function rememberMode(userId: string | null | undefined, mode: string | null): void {
  if (!userId) return;
  const current = readWorkspaceMemory(userId);
  if (current.mode === mode) return;
  write(userId, { ...current, mode });
}

/** Explicit security events only: logout, PIN change, revoked access. */
export function clearWorkspaceMemory(userId: string | null | undefined): void {
  if (!userId) return;
  safeLocalStorage.removeItem(key(userId));
}

/** Wipe every remembered workspace on this device (used on hard sign-out). */
export function clearAllWorkspaceMemory(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(WORKSPACE_MEMORY_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      try { window.localStorage.removeItem(k); } catch { /* noop */ }
    }
  } catch { /* noop */ }
}

export { WORKSPACE_MEMORY_PREFIX };
