/**
 * Canonical base URL resolver.
 *
 * Production domain: https://staflyapps.com
 * Only returns localhost when running locally.
 */

const PRODUCTION_URL = "https://staflyapps.com";

function resolveBaseUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // Only allow localhost / 127.0.0.1 for dev; everything else → production
    if (host === "localhost" || host === "127.0.0.1") {
      return window.location.origin;
    }
  }
  return PRODUCTION_URL;
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

export function activateUrl(token: string): string {
  return `${APP_BASE_URL}/activate/${token}`;
}

export function joinUrl(token: string): string {
  return `${APP_BASE_URL}/join/${token}`;
}

/**
 * Future: resolve per-company custom domain.
 */
export function companyBaseUrl(_companyId?: string): string {
  return APP_BASE_URL;
}
