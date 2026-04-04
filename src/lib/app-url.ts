/**
 * Single source of truth for the production base URL.
 * Uses VITE_APP_BASE_URL env var, falls back to window.location.origin for local dev.
 */
export const APP_BASE_URL: string =
  import.meta.env.VITE_APP_BASE_URL ?? window.location.origin;

export function applyUrl(slug: string): string {
  return `${APP_BASE_URL}/apply/${slug}`;
}

export function inviteUrl(token: string): string {
  return `${APP_BASE_URL}/invite?token=${token}`;
}

export function portalAuthUrl(): string {
  return `${APP_BASE_URL}/auth`;
}
