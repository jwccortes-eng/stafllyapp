/**
 * Environment detection for the STAGING/DEMO guardrail badge.
 *
 * Source of truth: build-time env vars only. NEVER queries the database.
 *
 * Precedence:
 * 1. `VITE_APP_ENV` explicit value ("staging" | "demo" | "production").
 * 2. Fallback heuristic on the hostname (Lovable preview subdomains are
 *    treated as staging so screenshots taken from a preview URL are always
 *    flagged, even if the env var was not set).
 */
export type AppEnv = "production" | "staging" | "demo";

function readEnvVar(): string | undefined {
  const raw = (import.meta.env.VITE_APP_ENV as string | undefined)?.trim().toLowerCase();
  if (!raw) return undefined;
  return raw;
}

function hostnameHeuristic(): AppEnv {
  if (typeof window === "undefined") return "production";
  const host = window.location.hostname || "";
  if (
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.endsWith(".lovable.app")
  ) {
    return "staging";
  }
  if (host === "localhost" || host === "127.0.0.1") return "staging";
  return "production";
}

export function getAppEnv(): AppEnv {
  const raw = readEnvVar();
  if (raw === "staging" || raw === "demo" || raw === "production") return raw;
  return hostnameHeuristic();
}

export function isNonProdEnv(): boolean {
  return getAppEnv() !== "production";
}

export function envBadgeLabel(env: AppEnv = getAppEnv()): string {
  if (env === "demo") return "DEMO";
  if (env === "staging") return "STAGING";
  return "";
}
