/**
 * Runtime-safe base URL resolver for multi-domain SaaS.
 *
 * Resolution order:
 * 1. VITE_APP_BASE_URL env var (explicit override)
 * 2. Known production domain mapping
 * 3. window.location.origin (localhost / preview / any other host)
 */

const PRODUCTION_DOMAINS: Record<string, string> = {
  // Map preview/deploy hostnames → canonical production URL
  "staflyapp.lovable.app": "https://staflyapps.com",
  "staflyapps.com": "https://staflyapps.com",
  "www.staflyapps.com": "https://staflyapps.com",
};

function resolveBaseUrl(): string {
  // 1. Explicit env override always wins
  const envUrl = import.meta.env.VITE_APP_BASE_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.replace(/\/+$/, "");
  }

  // 2. Check if current hostname maps to a known production domain
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const mapped = PRODUCTION_DOMAINS[host];
    if (mapped) return mapped;

    // 3. Fallback: use current origin (localhost, preview, etc.)
    return window.location.origin;
  }

  // SSR / test fallback
  return "https://staflyapps.com";
}

export const APP_BASE_URL: string = resolveBaseUrl();

// --- URL builders ---

export function applyUrl(slug: string): string {
  return `${APP_BASE_URL}/apply/${slug}`;
}

export function inviteUrl(token: string): string {
  return `${APP_BASE_URL}/invite?token=${token}`;
}

export function portalAuthUrl(): string {
  return `${APP_BASE_URL}/auth`;
}

export function kioskUrl(deviceId: string): string {
  return `${APP_BASE_URL}/kiosk/${deviceId}`;
}

/**
 * Future: resolve per-company custom domain.
 * For now returns the global base URL.
 */
export function companyBaseUrl(_companyId?: string): string {
  // TODO: lookup company_custom_domains table
  return APP_BASE_URL;
}
