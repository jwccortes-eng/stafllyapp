/**
 * Shift location status — pure helpers.
 *
 * SCOPE (HARD BOUNDARY):
 *   Frontend-only, presentational helpers to classify what kind of
 *   "where to go" a shift has. No DB access, no writes, no side effects.
 *   Does NOT touch payroll, time_entries, attendance, clock-in/out,
 *   worker portal, closeout, RLS, schema or production data.
 *
 * RULE:
 *   `location_id` alone is NOT the source of truth for "shift has a
 *   location". A manually typed `job_site_address` (or even a meeting
 *   point) is a valid operational location — just less complete.
 *   Use this helper everywhere we currently gate on `!location_id`.
 */

export type ShiftLocationStatus =
  | "saved_job_site"   // structured Job Site / location FK present → ready
  | "manual_address"   // free-text address only → needs_review (not error)
  | "meeting_only"     // only a meeting point exists → needs_review
  | "missing";         // truly nothing operational → blocked

export interface ShiftLocationInput {
  /** Legacy structured location FK (locations.id). */
  location_id?: string | null;
  /** New Job Site FK (locations_v2.id). */
  job_site_location_id?: string | null;
  /** Free-text manual address typed by the operator. */
  job_site_address?: string | null;
  /** Meeting point free text. */
  meeting_point?: string | null;
  /** Meeting point structured FK. */
  meeting_point_location_id?: string | null;
}

export interface ShiftLocationStatusResult {
  status: ShiftLocationStatus;
  hasSavedJobSite: boolean;
  hasManualAddress: boolean;
  hasMeetingPoint: boolean;
  hasAnyOperationalLocation: boolean;
  /** UX copy for badges / warnings. */
  message: string;
  /** UX tone — use to pick badge/alert color. Never "error" for partial info. */
  tone: "ready" | "warn" | "info" | "missing";
}

export function hasSavedJobSite(s: ShiftLocationInput): boolean {
  return Boolean(s.location_id || s.job_site_location_id);
}

export function hasManualAddress(s: ShiftLocationInput): boolean {
  return Boolean(s.job_site_address && s.job_site_address.trim());
}

export function hasMeetingPoint(s: ShiftLocationInput): boolean {
  return Boolean(
    (s.meeting_point && s.meeting_point.trim()) || s.meeting_point_location_id,
  );
}

export function hasAnyOperationalLocation(s: ShiftLocationInput): boolean {
  return hasSavedJobSite(s) || hasManualAddress(s) || hasMeetingPoint(s);
}

export function getShiftLocationStatus(
  s: ShiftLocationInput,
): ShiftLocationStatusResult {
  const saved = hasSavedJobSite(s);
  const manual = hasManualAddress(s);
  const meeting = hasMeetingPoint(s);
  const any = saved || manual || meeting;

  if (saved) {
    return {
      status: "saved_job_site",
      hasSavedJobSite: true,
      hasManualAddress: manual,
      hasMeetingPoint: meeting,
      hasAnyOperationalLocation: true,
      message: "Ubicación completa · Job Site guardado",
      tone: "ready",
    };
  }
  if (manual) {
    return {
      status: "manual_address",
      hasSavedJobSite: false,
      hasManualAddress: true,
      hasMeetingPoint: meeting,
      hasAnyOperationalLocation: true,
      message:
        "Dirección manual agregada · falta guardar como Job Site para mapa/geofence",
      tone: "warn",
    };
  }
  if (meeting) {
    return {
      status: "meeting_only",
      hasSavedJobSite: false,
      hasManualAddress: false,
      hasMeetingPoint: true,
      hasAnyOperationalLocation: true,
      message: "Solo punto de encuentro · falta dirección del trabajo",
      tone: "warn",
    };
  }
  return {
    status: "missing",
    hasSavedJobSite: false,
    hasManualAddress: false,
    hasMeetingPoint: false,
    hasAnyOperationalLocation: false,
    message:
      "Sin ubicación asignada · agrega una dirección o selecciona un Job Site",
    tone: "missing",
  };
}
