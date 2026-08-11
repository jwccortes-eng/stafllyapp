/**
 * Pure helpers — compute "pending info" flags + a publish-state descriptor
 * for a shift form. UI-only. No DB access. No side effects.
 *
 * Used by the desktop Shift Workspace summary to:
 *  - render semaphore badges
 *  - render the "as the worker will see it" preview
 *  - explain what will happen on Save draft / Publish
 *
 * Phase 2: schema-free. Nothing here writes to the DB.
 */

import { resolveServiceLocationTruth } from "./service-location";

export type PendingTone = "urgent" | "warn" | "info" | "ready";

export interface PendingFlag {
  key:
    | "date_missing"
    | "time_missing"
    | "client_missing"
    | "jobsite_missing"
    | "jobsite_unsaved"
    | "meeting_missing"
    | "team_missing"
    | "ready_to_publish"
    | "publishable_with_pending";
  label: string;
  tone: PendingTone;
}

export interface PendingInput {
  date: string;
  startTime: string;
  endTime: string;
  clientId: string;
  locationId: string;
  jobSiteLocationId: string | null;
  /** Free-text manual address typed by the operator (one-off Job Site). */
  jobSiteAddress?: string;
  meetingPoint: string;
  meetingPointLocationId: string | null;
  transportRequired: boolean;
  claimable: boolean;
  assignedCount: number;
}

export interface PendingResult {
  flags: PendingFlag[];
  hasUrgent: boolean;
  hasPending: boolean;
  isReady: boolean;
}

/** Traduce el input del editor al contrato canónico de ubicación. */
function locationTruthOfInput(v: PendingInput) {
  return resolveServiceLocationTruth({
    location_id: v.locationId,
    job_site_location_id: v.jobSiteLocationId,
    job_site_address: v.jobSiteAddress,
    meeting_point: v.meetingPoint,
    meeting_point_location_id: v.meetingPointLocationId,
    transportation_required: v.transportRequired,
  });
}

export function computeShiftPendingFlags(v: PendingInput): PendingResult {
  const flags: PendingFlag[] = [];

  const dateMissing = !v.date;
  const timeMissing = !v.startTime || !v.endTime;
  const clientMissing = !v.clientId;
  // P0 Service Location SSOT — un solo resolver para destino, geo y encuentro.
  const loc = locationTruthOfInput(v);
  const jobsiteMissing = loc.destinationStatus === "MISSING_DESTINATION";
  const jobsiteUnsaved =
    loc.destinationStatus === "RESOLVED" && loc.destinationSource === "free_text";
  const meetingMissing = loc.meetingPointMissing;
  const teamMissing = !v.claimable && v.assignedCount === 0;

  if (dateMissing) {
    flags.push({ key: "date_missing", label: "Pendiente: fecha", tone: "urgent" });
  }
  if (timeMissing) {
    flags.push({ key: "time_missing", label: "Pendiente: hora", tone: "urgent" });
  }
  if (clientMissing) {
    flags.push({ key: "client_missing", label: "Pendiente: cliente", tone: "warn" });
  }
  if (jobsiteMissing) {
    flags.push({
      key: "jobsite_missing",
      label: "Pendiente: lugar del servicio",
      tone: "urgent",
    });
  } else if (jobsiteUnsaved) {
    flags.push({
      key: "jobsite_unsaved",
      label: "Dirección agregada; sin lugar guardado · mapa/geofence no disponible",
      tone: "info",
    });
  }
  if (meetingMissing) {
    flags.push({
      key: "meeting_missing",
      label: "Pendiente: punto de encuentro",
      tone: "warn",
    });
  }
  if (teamMissing) {
    flags.push({ key: "team_missing", label: "Pendiente: equipo", tone: "warn" });
  }

  const hasUrgent = flags.some((f) => f.tone === "urgent");
  const hasPending = flags.length > 0;

  if (!hasPending) {
    flags.push({ key: "ready_to_publish", label: "Listo para publicar", tone: "ready" });
  } else if (!hasUrgent && !dateMissing && !timeMissing) {
    flags.push({
      key: "publishable_with_pending",
      label: "Publicable con información pendiente",
      tone: "info",
    });
  }

  return { flags, hasUrgent, hasPending, isReady: !hasPending };
}

// ────────────────────────────────────────────────────────────────────────────
// Publish-state descriptor (UI copy — no DB writes)
// ────────────────────────────────────────────────────────────────────────────

export type PublishState =
  | "draft"
  | "published_ready"
  | "published_incomplete"
  | "claimable_incomplete";

export interface PublishStateDescriptor {
  state: PublishState;
  label: string;
  description: string;
  tone: PendingTone;
}

export interface PublishStateInput {
  /** Real publication_status from DB if editing an existing shift, else null. */
  publicationStatus?: string | null;
  claimable: boolean;
  isReady: boolean;
}

export function describePublishState(input: PublishStateInput): PublishStateDescriptor {
  const isPublished = input.publicationStatus === "published";

  if (!isPublished) {
    return {
      state: "draft",
      label: "Borrador",
      description: "No visible para trabajadores. Solo admins pueden verlo.",
      tone: "info",
    };
  }
  if (input.isReady) {
    return {
      state: "published_ready",
      label: "Publicado y completo",
      description: "Visible y completo para los trabajadores.",
      tone: "ready",
    };
  }
  if (input.claimable) {
    return {
      state: "claimable_incomplete",
      label: "Reclamable con detalles pendientes",
      description:
        "Visible para reclamar. Los trabajadores verán los detalles que falten como “por confirmar”.",
      tone: "warn",
    };
  }
  return {
    state: "published_incomplete",
    label: "Visible con información pendiente",
    description: "Los trabajadores verán los campos pendientes como “en construcción”.",
    tone: "warn",
  };
}
