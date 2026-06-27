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
