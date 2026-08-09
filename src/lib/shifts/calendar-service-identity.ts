/**
 * P0 — DRAFT VISIBILITY + CONNECTEAM READINESS
 * ============================================
 *
 * FUENTE ÚNICA DE PRESENTACIÓN para calendario (mes/semana) y listas.
 *
 * Separa TRES preguntas que antes se mezclaban en un solo badge:
 *
 *   SERVICE STATE     → draft / published / cancelled / archived
 *   STAFFING STATE    → 0/10, faltan 3, completo, personal pendiente
 *   CONNECTEAM STATE  → listo / faltan N datos (delegado a
 *                       `getServiceOperationalReadiness`, sin validador nuevo)
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin React, sin BD, sin escrituras.
 *   No toca payroll, time_entries, assignments, parser de intake, CSV ni RLS.
 */
import { getShiftDisplayIdentity } from "./shift-identity";
import { buildShiftCardTitle } from "./card-display";
import { type OperationalBlocker } from "./service-operational-readiness";
import { getServiceLifecycleReadiness } from "./service-lifecycle-readiness";

export type ServiceStateCode = "draft" | "published" | "cancelled" | "archived";

/** Marcas que el carril de intake deja en `notes` (lectura, no escritura). */
const APPROX_START_MARK = "Hora de inicio pendiente";
const PENDING_END_MARK = "Hora de fin pendiente";
const PENDING_WORKERS_MARK = "Cantidad de personal pendiente";

export interface CalendarShiftLike {
  id?: string | null;
  title?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  slots?: number | null;
  notes?: string | null;
  client_id?: string | null;
  location_id?: string | null;
  publication_status?: string | null;
  shift_ref?: string | null;
  shift_number?: number | null;
  shift_code?: string | null;
  job_site_address?: string | null;
  job_site_location_id?: string | null;
  meeting_point?: string | null;
  meeting_point_location_id?: string | null;
  transportation_required?: boolean | null;
  claimable?: boolean | null;
}

export interface CalendarServiceContext {
  assignedCount: number;
  clientName?: string | null;
  locationName?: string | null;
  defaultTimezone?: string | null;
}

export interface CalendarServiceIdentity {
  /** Referencia humana canónica ("QK-001578") o null si el turno es histórico. */
  ref: string | null;
  /** Texto que la UI puede mostrar siempre (ref o "Sin referencia"). */
  refLabel: string;
  title: string;
  /** "QK-001578 · Imperial" para celdas estrechas. */
  compactLabel: string;

  service: { code: ServiceStateCode; label: string; isDraft: boolean };

  staffing: {
    assigned: number;
    /** null = cantidad de personal PENDIENTE (no es 0). */
    slots: number | null;
    pending: boolean;
    missing: number;
    complete: boolean;
    label: string;
  };

  time: {
    start: string | null;
    end: string | null;
    approxStart: boolean;
    endMissing: boolean;
    /** "Aprox. 17:00" / "17:00–23:00" / "Horario pendiente". */
    label: string;
  };

  connecteam: {
    ready: boolean;
    missingCount: number;
    /** "Listo" o "Faltan 2 datos". */
    label: string;
    blockers: OperationalBlocker[];
  };
}

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const hhmm = (v: unknown) => {
  const s = txt(v);
  return s ? s.slice(0, 5) : "";
};

const SERVICE_LABEL: Record<ServiceStateCode, string> = {
  draft: "BORRADOR",
  published: "Publicado",
  cancelled: "Cancelado",
  archived: "Archivado",
};

export function normalizeServiceState(raw: unknown): ServiceStateCode {
  const s = txt(raw).toLowerCase();
  if (s === "draft") return "draft";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "archived") return "archived";
  return "published";
}

export function getCalendarServiceIdentity(
  shift: CalendarShiftLike,
  ctx: CalendarServiceContext,
): CalendarServiceIdentity {
  const identity = getShiftDisplayIdentity(shift as any);
  const ref = identity.hasCanonicalRef ? identity.primaryRef : null;

  const title = buildShiftCardTitle({
    title: shift.title,
    shift_code: shift.shift_code,
    clientName: ctx.clientName,
    locationName: txt(ctx.locationName) || txt(shift.job_site_address) || null,
  });

  const code = normalizeServiceState(shift.publication_status);
  const notes = txt(shift.notes);

  // ── Horario ────────────────────────────────────────────────────────────
  const start = hhmm(shift.start_time) || null;
  const end = hhmm(shift.end_time) || null;
  const approxStart = notes.includes(APPROX_START_MARK);
  const endMissing = notes.includes(PENDING_END_MARK) || (!!start && !!end && start === end);

  let timeLabel: string;
  if (!start) timeLabel = "Horario pendiente";
  else if (approxStart && endMissing) timeLabel = `Aprox. ${start}`;
  else if (endMissing) timeLabel = `${start} · hora final pendiente`;
  else if (approxStart) timeLabel = `Aprox. ${start}–${end}`;
  else timeLabel = `${start}–${end}`;

  // ── Staffing (nunca se confunde con el estado del Servicio) ────────────
  const rawSlots = shift.slots;
  const slotsPending = rawSlots == null || notes.includes(PENDING_WORKERS_MARK);
  const slots = rawSlots == null ? null : Number(rawSlots);
  const assigned = Math.max(0, ctx.assignedCount || 0);
  const missing = slots == null ? 0 : Math.max(0, slots - assigned);
  const complete = slots != null && slots > 0 && missing === 0;
  const staffingLabel = slotsPending
    ? assigned > 0
      ? `${assigned} asignados · personal pendiente`
      : "Personal pendiente"
    : complete
      ? `Completo ${assigned}/${slots}`
      : `${assigned}/${slots} · faltan ${missing}`;

  // ── Connecteam y staffing: se delega al ciclo de vida canónico ──────────
  const lifecycle = getServiceLifecycleReadiness({
    date: txt(shift.date),
    startTime: txt(shift.start_time),
    endTime: endMissing ? "" : txt(shift.end_time),
    title: txt(shift.title),
    clientId: txt(shift.client_id),
    locationId: txt(shift.location_id),
    jobSiteLocationId: shift.job_site_location_id ?? null,
    jobSiteAddress: txt(shift.job_site_address),
    meetingPoint: txt(shift.meeting_point),
    meetingPointLocationId: shift.meeting_point_location_id ?? null,
    transportRequired: !!shift.transportation_required,
    assignedCount: assigned,
    claimable: !!shift.claimable,
    publicationStatus: code,
    slots: slots ?? 0,
    timezone: ctx.defaultTimezone ?? null,
    connecteamJobLabel:
      txt(ctx.clientName) || txt(ctx.locationName) || txt(shift.job_site_address) || null,
    addressLabel: txt(ctx.locationName) || txt(shift.job_site_address) || null,
    referenceLabel: ref,
    staffingPending: slotsPending,
    approxStart,
  });

  const exportBlockers = lifecycle.operational.exportBlockers;
  const missingCount = exportBlockers.length;
  const staffGate = lifecycle.gates.staff;

  return {
    ref,
    refLabel: ref ?? "Sin referencia",
    title,
    compactLabel: ref ? `${ref} · ${title}` : title,
    service: { code, label: SERVICE_LABEL[code], isDraft: code === "draft" },
    staffing: {
      assigned,
      slots: slotsPending ? null : slots,
      pending: slotsPending,
      missing,
      complete,
      label: staffingLabel,
      readyToStaff: staffGate.ready,
      staffBlockers: staffGate.blockers,
      staffStatusText: staffGate.ready
        ? complete
          ? "Equipo completo"
          : "Listo para empezar a asignar personal"
        : "Este servicio todavía está en preparación",
    },
    time: { start, end, approxStart, endMissing, label: timeLabel },
    connecteam: {
      ready: missingCount === 0,
      missingCount,
      label:
        missingCount === 0
          ? "Listo"
          : `Faltan ${missingCount} ${missingCount === 1 ? "dato" : "datos"}`,
      blockers: exportBlockers,
    },
  };
}


/** Resumen de un lote seleccionado: nunca bloquea todo por los incompletos. */
export function summarizeConnecteamSelection(items: CalendarServiceIdentity[]) {
  const total = items.length;
  const ready = items.filter((i) => i.connecteam.ready).length;
  return {
    total,
    ready,
    pending: total - ready,
    exportLabel: `Exportar ${ready} listo${ready === 1 ? "" : "s"}`,
    reviewLabel: `Revisar ${total - ready} pendiente${total - ready === 1 ? "" : "s"}`,
  };
}
