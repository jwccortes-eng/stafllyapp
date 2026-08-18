/**
 * getServicePublishReadiness — ÚNICA fuente canónica de "¿se puede publicar
 * este servicio?" y del lenguaje de ubicación.
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin acceso a BD, sin escrituras, sin efectos.
 *   No toca payroll, assignments, RLS ni tenants.
 *
 * MODELO REAL (documentado en docs/qa/P0_SERVICE_LOCATION_MEETING_POINT_CONSISTENCY.md):
 *   - Lugar del servicio (Job Site) = `location_id` (legacy FK) ó
 *     `job_site_location_id` (locations_v2) ó `job_site_address` (texto libre).
 *   - Punto de encuentro = `meeting_point` (texto) ó `meeting_point_location_id`.
 *   - El punto de encuentro NUNCA satisface el requisito de lugar del servicio.
 *
 * Todas las superficies (panel lateral, confirmación, botón Publicar, toast y
 * worker preview) deben consumir este helper para no contradecirse.
 */

import { resolveServiceLocationTruth } from "./service-location";
import {
  evaluatePublishReadiness,
  describePublishWarning,
  type PublishWarningCode,
} from "./publish-readiness";

export const SERVICE_LOCATION_COPY = {
  jobSite: "Lugar del servicio",
  jobSiteHelp: "Dónde se realizará el trabajo.",
  meetingPoint: "Punto de encuentro",
  meetingPointHelp: "Dónde se reúne el equipo.",
  jobSiteMissing: "Falta definir el lugar del servicio",
  jobSiteCta: "Completar lugar",
  jobSitePending: "Lugar del servicio por confirmar",
  meetingPending: "Punto de encuentro por confirmar",
  reuseMeetingAsJobSite: "Usar este punto también como lugar del servicio",
} as const;

/** Anclas de navegación al error (scroll + focus). */
export const SERVICE_JOB_SITE_ANCHOR = "service-job-site-section";
export const SERVICE_MEETING_POINT_ANCHOR = "service-meeting-point-section";

export type JobSiteKind = "saved" | "manual" | "none";

export interface ServiceReadinessInput {
  date: string;
  startTime: string;
  endTime: string;
  title?: string;
  clientId: string;
  /** Legacy FK (locations.id) */
  locationId: string;
  /** Job Site FK (locations_v2.id) */
  jobSiteLocationId: string | null;
  /** Dirección libre del lugar del servicio */
  jobSiteAddress?: string;
  meetingPoint: string;
  meetingPointLocationId: string | null;
  transportRequired: boolean;
  driverIds?: string[];
  driverEmployeeId?: string | null;
  shiftAdminId?: string | null;
  assignedCount: number;
  claimable: boolean;
  requirements?: ServiceRequirements;
}

export interface ServiceRequirements {
  requireClient?: boolean;
  requireLocation?: boolean;
  requireShiftAdmin?: boolean;
  maxShiftHours?: number;
  /** Cuando false, el helper omite validaciones de identidad (título). */
  requireTitle?: boolean;
}

export interface ReadinessBlocker {
  key:
    | "date"
    | "start_time"
    | "end_time"
    | "title"
    | "client"
    | "job_site"
    | "shift_admin"
    | "driver"
    | "team"
    | "capacity"
    | "duration";
  /** Etiqueta corta para toasts y listas ("Lugar del servicio"). */
  label: string;
  /** Frase completa e inequívoca para el usuario. */
  message: string;
  cta?: { label: string; anchorId: string };
}

export interface ReadinessWarning {
  key: PublishWarningCode;
  message: string;
}

export interface ServicePublishReadiness {
  /** Bloqueos reales de publicación (el botón Publicar fallará si hay alguno). */
  blockers: ReadinessBlocker[];
  /** Avisos no bloqueantes. */
  warnings: ReadinessWarning[];
  canPublish: boolean;
  hasJobSite: boolean;
  jobSiteKind: JobSiteKind;
  hasMeetingPoint: boolean;
  /** Ambos capturados y con el mismo texto normalizado. */
  jobSiteEqualsMeetingPoint: boolean;
  /** Hay punto de encuentro y no hay lugar del servicio → ofrecer reutilizar. */
  canReuseMeetingAsJobSite: boolean;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function getServicePublishReadiness(
  v: ServiceReadinessInput,
): ServicePublishReadiness {
  const req: Required<ServiceRequirements> = {
    requireClient: v.requirements?.requireClient ?? false,
    requireLocation: v.requirements?.requireLocation ?? true,
    requireShiftAdmin: v.requirements?.requireShiftAdmin ?? false,
    maxShiftHours: v.requirements?.maxShiftHours ?? 24,
    requireTitle: v.requirements?.requireTitle ?? false,
  };

  // P0 Service Location SSOT — el resolver canónico decide destino y encuentro.
  const loc = resolveServiceLocationTruth({
    location_id: v.locationId,
    job_site_location_id: v.jobSiteLocationId,
    job_site_address: v.jobSiteAddress,
    meeting_point: v.meetingPoint,
    meeting_point_location_id: v.meetingPointLocationId,
    transportation_required: v.transportRequired,
  });
  const manualAddress = (v.jobSiteAddress ?? "").trim();
  const hasSavedJobSite = loc.destinationSource === "job_site_v2" || loc.destinationSource === "legacy_venue";
  const hasJobSite = loc.destinationStatus === "RESOLVED";
  const jobSiteKind: JobSiteKind = hasSavedJobSite
    ? "saved"
    : hasJobSite
      ? "manual"
      : "none";

  const meetingText = (v.meetingPoint ?? "").trim();
  const hasMeetingPoint = Boolean(meetingText || v.meetingPointLocationId);

  // PHASE 2 · SSOT — las reglas viven en `evaluatePublishReadiness`, espejo de
  // `public.service_publish_readiness`. Aquí sólo se traducen a copy/CTA.
  const spec = evaluatePublishReadiness({
    terminal: false,
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    claimable: v.claimable,
    requiredCount: v.claimable ? Math.max(1, v.assignedCount || 1) : v.assignedCount,
    assignedCount: v.assignedCount,
    hasJobSite,
    hasSavedJobSite,
    hasMeetingPoint,
    hasClient: Boolean(v.clientId),
    hasShiftAdmin: Boolean(v.shiftAdminId),
    transportRequired: v.transportRequired,
    hasDriver: (v.driverIds?.length ?? 0) > 0 || Boolean(v.driverEmployeeId),
    requirements: req,
  });

  const BLOCKER_UI: Record<string, ReadinessBlocker> = {
    date: { key: "date", label: "Fecha", message: "Falta la fecha del servicio" },
    start_time: { key: "start_time", label: "Hora de inicio", message: "Falta la hora de inicio" },
    end_time: { key: "end_time", label: "Hora de fin", message: "Falta la hora de fin" },
    client: { key: "client", label: "Cliente", message: "Falta el cliente" },
    job_site: {
      key: "job_site",
      label: SERVICE_LOCATION_COPY.jobSite,
      message: SERVICE_LOCATION_COPY.jobSiteMissing,
      cta: { label: SERVICE_LOCATION_COPY.jobSiteCta, anchorId: SERVICE_JOB_SITE_ANCHOR },
    },
    shift_admin: { key: "shift_admin", label: "Shift admin", message: "Falta el shift admin" },
    driver: {
      key: "driver",
      label: "Conductor",
      message: "Transporte activado pero sin conductor asignado",
    },
    assignments: {
      key: "team",
      label: "Equipo",
      message: "Asigna al menos un trabajador o marca el servicio como reclamable",
    },
    capacity: {
      key: "capacity",
      label: "Plazas",
      message: "Define cuántas plazas quedan abiertas a reclamo",
    },
    duration: {
      key: "duration",
      label: `Duración ≤ ${req.maxShiftHours}h`,
      message: `La duración no es válida (máximo permitido ${req.maxShiftHours}h)`,
    },
  };

  const blockers: ReadinessBlocker[] = spec.blockers
    .map((code) => BLOCKER_UI[code])
    .filter(Boolean) as ReadinessBlocker[];

  // Validación de formulario (no de readiness backend): el título todavía no
  // existe como fila, así que sólo se exige cuando el editor lo pide.
  if (req.requireTitle && !(v.title ?? "").trim()) {
    blockers.unshift({ key: "title", label: "Título", message: "Falta el título del servicio" });
  }

  const warnings: ReadinessWarning[] = spec.warnings.map((key) => ({
    key,
    message: describePublishWarning(key),
  })) as ReadinessWarning[];

  const jobSiteEqualsMeetingPoint =
    hasJobSite && hasMeetingPoint && !!manualAddress && norm(manualAddress) === norm(meetingText);


  return {
    blockers,
    warnings,
    canPublish: blockers.length === 0,
    hasJobSite,
    jobSiteKind,
    hasMeetingPoint,
    jobSiteEqualsMeetingPoint,
    canReuseMeetingAsJobSite: !hasJobSite && hasMeetingPoint && meetingText.length > 0,
  };
}

/** Navegación al error: desplaza y enfoca la sección correspondiente. */
export function focusServiceSection(anchorId: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = el.querySelector<HTMLElement>("input, textarea, button");
  window.setTimeout(() => input?.focus({ preventScroll: true }), 320);
}
