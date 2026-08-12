/**
 * Auth session hardening helpers.
 *
 * Frontend-only. Coordinates session-expired UX, stale localStorage cleanup,
 * intended-route preservation, and lightweight multi-tab detection between
 * useAuth and the route guards / Auth screen.
 *
 * Never touches RLS, auth.users, roles, payroll, time_entries, or any other
 * protected table.
 */

import { safeLocalStorage, safeSessionStorage } from "@/lib/safe-storage";
import { readWorkspaceMemory, rememberCompany } from "@/lib/session/workspace-memory";

const SESSION_EXPIRED_KEY = "stafly:auth:session-expired:v1";
const INTENDED_ROUTE_KEY = "stafly:auth:intended-route:v1";
const TAB_CHANNEL = "stafly-auth-tabs";

export type SessionExpiredReason =
  | "signed_out"
  | "session_not_found"
  | "stale_local"
  | "user_initiated"; // user_initiated is NEVER stored — explicit signOut suppresses the flag

export function markSessionExpired(reason: Exclude<SessionExpiredReason, "user_initiated">) {
  safeSessionStorage.setItem(
    SESSION_EXPIRED_KEY,
    JSON.stringify({ reason, at: Date.now() })
  );
}

export function consumeSessionExpired(): { reason: SessionExpiredReason; at: number } | null {
  const raw = safeSessionStorage.getItem(SESSION_EXPIRED_KEY);
  if (!raw) return null;
  safeSessionStorage.removeItem(SESSION_EXPIRED_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSessionExpired() {
  safeSessionStorage.removeItem(SESSION_EXPIRED_KEY);
}

const SAFE_ROUTE_PREFIXES = ["/app", "/portal", "/parceros"];

export function saveIntendedRoute(path: string | null | undefined) {
  if (!path) return;
  if (path === "/" || path.startsWith("/auth") || path.startsWith("/login")) return;
  if (!SAFE_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"))) {
    return;
  }
  safeSessionStorage.setItem(INTENDED_ROUTE_KEY, path);
}

export function consumeIntendedRoute(): string | null {
  const v = safeSessionStorage.getItem(INTENDED_ROUTE_KEY);
  if (v) safeSessionStorage.removeItem(INTENDED_ROUTE_KEY);
  return v;
}

/**
 * Best-effort wipe of Supabase auth tokens from localStorage when we detect
 * a stale / invalid session. Keys are `sb-<ref>-auth-token` or related.
 */
export function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith("sb-") && k.includes("-auth-"))) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // noop
      }
    }
  } catch {
    // storage unavailable — ignore
  }
}

/**
 * Lightweight multi-tab detector via BroadcastChannel. Returns an unsubscribe
 * fn. `onMultipleTabs` fires once when more than one tab is observed in the
 * same browser profile. Safe no-op when BroadcastChannel isn't available.
 */
export function watchTabPresence(onMultipleTabs: () => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  let fired = false;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(TAB_CHANNEL);
  } catch {
    return () => {};
  }
  const tabId = Math.random().toString(36).slice(2);
  const handle = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; from?: string } | null;
    if (!data || data.from === tabId) return;
    if (data.type === "ping") {
      channel?.postMessage({ type: "pong", from: tabId });
    }
    if ((data.type === "ping" || data.type === "pong") && !fired) {
      fired = true;
      try { onMultipleTabs(); } catch { /* noop */ }
    }
  };
  channel.addEventListener("message", handle);
  // Announce ourselves shortly after mount.
  const timer = window.setTimeout(() => {
    try { channel?.postMessage({ type: "ping", from: tabId }); } catch { /* noop */ }
  }, 300);
  return () => {
    window.clearTimeout(timer);
    try { channel?.removeEventListener("message", handle); } catch { /* noop */ }
    try { channel?.close(); } catch { /* noop */ }
  };
}

export { SESSION_EXPIRED_KEY, INTENDED_ROUTE_KEY };

/* -------------------------------------------------------------------------
 * Per-tab Company Context storage (STAFLY-CTX-001 fix)
 *
 * Auth is shared across tabs (Supabase localStorage token). Company Context
 * is per-tab: the active company selection lives in sessionStorage, keyed by
 * the authenticated user id, so a switch in Tab A never overwrites Tab B.
 *
 * The legacy global localStorage key `selectedCompanyId` is read ONCE as a
 * migration hint, validated against the user's authorized companies, and
 * then cleared from localStorage to stop cross-tab bleed.
 * ------------------------------------------------------------------------- */

const SELECTED_COMPANY_LEGACY_KEY = "selectedCompanyId";
const SELECTED_COMPANY_TAB_PREFIX = "stafly:selectedCompanyId:";
const LEGACY_MIGRATION_DONE_PREFIX = "stafly:selectedCompanyId:migrated:";

function selectedCompanyKey(userId: string): string {
  return SELECTED_COMPANY_TAB_PREFIX + userId;
}

/** Read the tab-scoped selected company id for this user. */
export function readSelectedCompanyForTab(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const tabValue = safeSessionStorage.getItem(selectedCompanyKey(userId));
  if (tabValue) return tabValue;
  // P0 — Persistent workspace: a brand-new tab (or a cold app start after the
  // browser/phone was closed) inherits the last company this user actually
  // worked in on THIS device. Tab-scoped value still wins while it exists.
  return readWorkspaceMemory(userId).companyId;
}

/** Write the tab-scoped selected company id for this user. */
export function writeSelectedCompanyForTab(userId: string | null | undefined, companyId: string): void {
  if (!userId) return;
  safeSessionStorage.setItem(selectedCompanyKey(userId), companyId);
  rememberCompany(userId, companyId);
}

/** Clear the tab-scoped selected company id for this user. */
export function clearSelectedCompanyForTab(userId: string | null | undefined): void {
  if (!userId) return;
  safeSessionStorage.removeItem(selectedCompanyKey(userId));
  rememberCompany(userId, null);
}


/**
 * One-shot migration from the legacy global localStorage key. Returns the
 * legacy value only if it is present in `validIds`; otherwise returns null.
 * After the first call for a user, the legacy key is removed from
 * localStorage so future tabs cannot inherit stale cross-tenant state.
 */
export function migrateLegacySelectedCompany(
  userId: string | null | undefined,
  validIds: string[],
): string | null {
  if (!userId) return null;
  const flagKey = LEGACY_MIGRATION_DONE_PREFIX + userId;
  if (safeSessionStorage.getItem(flagKey)) return null;
  const legacy = safeLocalStorage.getItem(SELECTED_COMPANY_LEGACY_KEY);
  safeSessionStorage.setItem(flagKey, "1");
  // Always drop the legacy global key — it is no longer authoritative and
  // keeping it would let a second tab overwrite this tab's selection.
  safeLocalStorage.removeItem(SELECTED_COMPANY_LEGACY_KEY);
  if (legacy && validIds.includes(legacy)) return legacy;
  return null;
}

export {
  SELECTED_COMPANY_LEGACY_KEY,
  SELECTED_COMPANY_TAB_PREFIX,
};

