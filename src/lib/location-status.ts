/**
 * Pure helpers to derive a worker's operational location status
 * relative to a target site (e.g. job_site of a shift).
 *
 * Status precedence:
 *   1. unknown      → no presence data at all
 *   2. stale        → last_seen_at older than STALE_THRESHOLD
 *   3. on_site      → distance ≤ geofence radius (when defined) OR ≤ ON_SITE_FALLBACK
 *   4. en_route     → distance ≤ EN_ROUTE_THRESHOLD
 *   5. outside_geofence → geofence defined and distance > radius (but workers should be onsite)
 *   6. off_route    → very far from target
 */
import { distanceMeters } from "@/lib/geo-helpers";
import type { LocationStatus } from "@/components/locations/LocationStatusChip";

/** Presence is considered stale after this many ms with no update. */
export const STALE_THRESHOLD_MS = 4 * 60 * 1000; // 4 min
/** When no geofence is defined, treat ≤ this many meters as on-site. */
export const ON_SITE_FALLBACK_M = 80;
/** Below this many km from target = "en route" (still approaching). */
export const EN_ROUTE_THRESHOLD_M = 5_000;

export interface PresenceLite {
  current_lat: number;
  current_lng: number;
  last_seen_at: string | null;
}

export interface TargetSite {
  latitude: number;
  longitude: number;
  geofence_radius_meters: number | null;
}

export interface LocationStatusResult {
  status: LocationStatus;
  distance_m: number | null;
  is_stale: boolean;
}

export function computeLocationStatus(
  presence: PresenceLite | null | undefined,
  target: TargetSite | null | undefined,
  now: number = Date.now(),
): LocationStatusResult {
  if (!presence) {
    return { status: "unknown", distance_m: null, is_stale: false };
  }

  const lastSeen = presence.last_seen_at ? new Date(presence.last_seen_at).getTime() : 0;
  const is_stale = now - lastSeen > STALE_THRESHOLD_MS;

  if (!target || target.latitude == null || target.longitude == null) {
    return { status: is_stale ? "stale" : "unknown", distance_m: null, is_stale };
  }

  const distance_m = distanceMeters(
    presence.current_lat,
    presence.current_lng,
    target.latitude,
    target.longitude,
  );

  if (is_stale) {
    return { status: "stale", distance_m, is_stale: true };
  }

  const radius = target.geofence_radius_meters ?? ON_SITE_FALLBACK_M;

  if (distance_m <= radius) {
    return { status: "on_site", distance_m, is_stale: false };
  }
  if (target.geofence_radius_meters != null && distance_m <= target.geofence_radius_meters * 1.5) {
    return { status: "outside_geofence", distance_m, is_stale: false };
  }
  if (distance_m <= EN_ROUTE_THRESHOLD_M) {
    return { status: "en_route", distance_m, is_stale: false };
  }
  return { status: "off_route", distance_m, is_stale: false };
}
