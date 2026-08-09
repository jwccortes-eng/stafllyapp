/**
 * P0 FINAL — STAFLY COMO ESPEJO DE LA OPERACIÓN
 * =============================================
 *
 * Motor ÚNICO de series de Servicios. Todas las rutas que crean más de una
 * ocurrencia (Crear, Guardar borrador, Publicar, Duplicar, Copiar semana,
 * Editar → Repetir) construyen primero un SNAPSHOT canónico y derivan cada
 * ocurrencia de ese snapshot, nunca del estado mutable del formulario ni de
 * la fila de origen leída a mitad de camino.
 *
 * Este módulo es PURO: sin React, sin red, sin escrituras.
 *
 * No toca payroll, time entries, Connecteam export, ELDM, auth ni RLS.
 */

import {
  buildSeriesIntent,
  freezeRecurrenceSubmit,
  newRecurrenceIntentId,
  type SeriesIntent,
  type SeriesServiceSnapshot,
} from "./recurrence";

/** Forma mínima de una fila real de `scheduled_shifts` para clonar. */
export interface ServiceRowLike {
  id?: string;
  title?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  slots?: number | null;
  client_id?: string | null;
  location_id?: string | null;
  job_site_location_id?: string | null;
  job_site_address?: string | null;
  meeting_point?: string | null;
  meeting_point_location_id?: string | null;
  meeting_time?: string | null;
  notes?: string | null;
  special_instructions?: string | null;
  claimable?: boolean | null;
  pay_type?: string | null;
  day_type?: string | null;
  pay_override?: boolean | null;
  shift_admin_id?: string | null;
  transportation_required?: boolean | null;
  car_capacity?: number | null;
  transportation_notes?: string | null;
  clock_method?: string | null;
  attendance_mode?: string | null;
}

export interface SnapshotFromRowOptions {
  companyId: string;
  /** Equipo confirmado que se desea replicar. Vacío = sin equipo. */
  employeeIds?: string[];
  driverIds?: string[];
  publicationIntent?: "draft" | "publish_base";
  /** Qué partes de la realidad del origen se conservan. */
  include?: { client?: boolean; notes?: boolean; roles?: boolean };
}

/**
 * Verdad confirmada de un Servicio existente. Es el ÚNICO traductor
 * fila → snapshot: duplicar, copiar semana y repetir usan este contrato.
 */
export function snapshotFromServiceRow(
  row: ServiceRowLike,
  opts: SnapshotFromRowOptions,
): SeriesServiceSnapshot {
  const include = { client: true, notes: true, roles: true, ...(opts.include ?? {}) };
  const payType = row.pay_type === "daily" ? "daily" : "hourly";
  const dayType = row.day_type === "half_day" ? "half_day" : "full_day";
  const clockMethod =
    row.clock_method === "mobile" || row.clock_method === "kiosk" ? row.clock_method : "both";
  return {
    companyId: opts.companyId,
    clientId: include.client ? row.client_id ?? null : null,
    locationId: include.client ? row.location_id ?? null : null,
    jobSiteLocationId: include.client ? row.job_site_location_id ?? null : null,
    jobSiteAddress: include.client ? row.job_site_address ?? null : null,
    meetingPoint: include.notes ? row.meeting_point ?? null : null,
    meetingPointLocationId: include.client ? row.meeting_point_location_id ?? null : null,
    title: (row.title ?? "").trim() || "Turno",
    startTime: row.start_time ?? "",
    endTime: row.end_time ?? "",
    requestedHeadcount: typeof row.slots === "number" && row.slots > 0 ? row.slots : 1,
    notes: include.notes ? row.notes ?? null : null,
    specialInstructions: include.notes ? row.special_instructions ?? null : null,
    claimable: row.claimable ?? false,
    payType,
    dayType,
    payOverride: row.pay_override ?? false,
    shiftAdminId: include.roles ? row.shift_admin_id ?? null : null,
    transportRequired: row.transportation_required ?? false,
    carCapacity: typeof row.car_capacity === "number" ? row.car_capacity : 5,
    transportNotes: row.transportation_notes ?? null,
    driverIds: [...(opts.driverIds ?? [])],
    clockMethod,
    attendanceMode: row.attendance_mode ?? "manual",
    meetingTime: row.meeting_time ?? null,
    employeeIds: [...(opts.employeeIds ?? [])],
    publicationIntent: opts.publicationIntent ?? "draft",
  };
}

/**
 * Intención de serie a partir de un snapshot ya congelado y una lista de
 * fechas. Es el mismo contrato que usa el formulario de creación.
 */
export function buildSeriesIntentFromSnapshot(input: {
  snapshot: SeriesServiceSnapshot;
  baseDate: string;
  /** Fechas adicionales (sin la base). Se deduplican y ordenan en el plan. */
  repeatDates?: string[];
  copyAssignments?: boolean;
  intentId?: string;
}): SeriesIntent {
  const intentId = input.intentId ?? newRecurrenceIntentId();
  const repeatDates = [...(input.repeatDates ?? [])];
  const all = [input.baseDate, ...repeatDates].filter(Boolean).sort();
  const submit = freezeRecurrenceSubmit({
    intentId,
    baseDate: input.baseDate,
    repeatDates,
    config: {
      enabled: repeatDates.length > 0,
      mode: "range",
      selectedDays: [],
      rangeStart: all[0] ?? input.baseDate,
      rangeEnd: all[all.length - 1] ?? input.baseDate,
      nextNDays: 0,
      copyAssignments: input.copyAssignments ?? false,
    },
  });
  return buildSeriesIntent({ recurrence: submit, service: input.snapshot });
}

// ─────────────────────────────────────────────────────────────
// Vista previa obligatoria
// ─────────────────────────────────────────────────────────────

export interface SeriesPreviewRow {
  date: string;
  index: number;
  isBase: boolean;
  title: string;
  schedule: string;
  headcount: number;
  clientId: string | null;
  venueId: string | null;
  workersToCopy: number;
  publication: "draft" | "published";
  sourceRef: string;
}

export interface SeriesPreview {
  intentId: string;
  total: number;
  rows: SeriesPreviewRow[];
  /** Datos ausentes en la realidad: se muestran, nunca se inventan. */
  pending: string[];
}

export function buildSeriesPreview(intent: SeriesIntent): SeriesPreview {
  const s = intent.service;
  const isSeries = intent.recurrence.occurrences.length > 1;
  const schedule =
    s.startTime && s.endTime && s.endTime !== s.startTime
      ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}`
      : s.startTime
        ? `${s.startTime.slice(0, 5)} · fin pendiente`
        : "Horario pendiente";

  const rows: SeriesPreviewRow[] = intent.recurrence.occurrences.map((occ) => {
    const copies = !isSeries || occ.isBase || intent.recurrence.copyAssignments;
    return {
      date: occ.date,
      index: occ.index,
      isBase: occ.isBase,
      title: s.title,
      schedule,
      headcount: s.requestedHeadcount,
      clientId: s.clientId,
      venueId: s.jobSiteLocationId ?? s.locationId,
      workersToCopy: copies ? s.employeeIds.length : 0,
      publication: occ.isBase && s.publicationIntent === "publish_base" ? "published" : "draft",
      sourceRef: occ.sourceRef,
    };
  });

  const pending: string[] = [];
  if (!s.clientId) pending.push("Cliente");
  if (!s.jobSiteLocationId && !s.locationId && !s.jobSiteAddress) pending.push("Ubicación");
  if (!s.startTime || !s.endTime || s.endTime === s.startTime) pending.push("Horario de cierre");
  if (s.employeeIds.length === 0) pending.push("Equipo");

  return { intentId: intent.recurrence.intentId, total: rows.length, rows, pending };
}

// ─────────────────────────────────────────────────────────────
// Verificación automática posterior a la persistencia
// ─────────────────────────────────────────────────────────────

export type SeriesVerificationField =
  | "client"
  | "venue"
  | "schedule"
  | "headcount"
  | "assignments"
  | "qk"
  | "series_ref";

export interface PersistedOccurrence {
  date: string;
  shiftId: string | null;
  /** QK visible. */
  ref: string | null;
  clientId: string | null;
  venueId: string | null;
  startTime: string | null;
  endTime: string | null;
  headcount: number | null;
  assignmentCount: number;
  seriesRef: string | null;
}

export interface SeriesDifference {
  field: SeriesVerificationField;
  label: string;
  expected: string;
  actual: string;
}

export interface SeriesVerificationRow {
  date: string;
  shiftId: string | null;
  ref: string | null;
  differences: SeriesDifference[];
}

export interface SeriesVerification {
  ok: boolean;
  checked: number;
  missing: string[];
  rows: SeriesVerificationRow[];
}

const FIELD_LABEL: Record<SeriesVerificationField, string> = {
  client: "Cliente",
  venue: "Ubicación",
  schedule: "Horario",
  headcount: "Plazas",
  assignments: "Equipo",
  qk: "Referencia QK",
  series_ref: "Referencia de serie",
};

function diff(
  field: SeriesVerificationField,
  expected: unknown,
  actual: unknown,
): SeriesDifference | null {
  const e = expected === null || expected === undefined ? "—" : String(expected);
  const a = actual === null || actual === undefined ? "—" : String(actual);
  if (e === a) return null;
  return { field, label: FIELD_LABEL[field], expected: e, actual: a };
}

/**
 * Compara la intención congelada contra lo realmente persistido.
 * No corrige nada: reporta la diferencia para que el operador decida.
 */
export function verifySeriesIntegrity(input: {
  intent: SeriesIntent;
  persisted: PersistedOccurrence[];
  /** Cuando la serie sólo tiene una ocurrencia no se exige serie común. */
  requireSeriesRef?: boolean;
}): SeriesVerification {
  const preview = buildSeriesPreview(input.intent);
  const byDate = new Map(input.persisted.map((p) => [p.date, p]));
  const isSeries = preview.total > 1;
  const requireSeriesRef = input.requireSeriesRef ?? isSeries;
  const missing: string[] = [];
  const rows: SeriesVerificationRow[] = [];

  for (const expected of preview.rows) {
    const actual = byDate.get(expected.date);
    if (!actual || !actual.shiftId) {
      missing.push(expected.date);
      continue;
    }
    const differences: SeriesDifference[] = [];
    const push = (d: SeriesDifference | null) => { if (d) differences.push(d); };
    push(diff("client", expected.clientId, actual.clientId));
    push(diff("venue", expected.venueId, actual.venueId));
    push(
      diff(
        "schedule",
        `${(input.intent.service.startTime || "").slice(0, 5)}–${(input.intent.service.endTime || "").slice(0, 5)}`,
        `${(actual.startTime || "").slice(0, 5)}–${(actual.endTime || "").slice(0, 5)}`,
      ),
    );
    push(diff("headcount", expected.headcount, actual.headcount));
    push(diff("assignments", expected.workersToCopy, actual.assignmentCount));
    if (!actual.ref) {
      differences.push({ field: "qk", label: FIELD_LABEL.qk, expected: "asignada", actual: "—" });
    }
    if (requireSeriesRef && !actual.seriesRef) {
      differences.push({
        field: "series_ref",
        label: FIELD_LABEL.series_ref,
        expected: expected.sourceRef,
        actual: "—",
      });
    }
    rows.push({ date: expected.date, shiftId: actual.shiftId, ref: actual.ref, differences });
  }

  return {
    ok: missing.length === 0 && rows.every((r) => r.differences.length === 0),
    checked: rows.length,
    missing,
    rows,
  };
}

/** Copy operativo del resultado de la verificación. Sin jerga técnica. */
export function describeSeriesVerification(result: SeriesVerification): string {
  if (result.ok) {
    return `${result.checked} Servicio${result.checked === 1 ? "" : "s"} verificado${result.checked === 1 ? "" : "s"}: coinciden con lo previsualizado.`;
  }
  const parts: string[] = [];
  if (result.missing.length > 0) parts.push(`${result.missing.length} fecha(s) sin Servicio`);
  const withDiff = result.rows.filter((r) => r.differences.length > 0);
  if (withDiff.length > 0) {
    const fields = new Set<string>();
    withDiff.forEach((r) => r.differences.forEach((d) => fields.add(d.label)));
    parts.push(`${withDiff.length} con diferencias en ${Array.from(fields).join(", ")}`);
  }
  return parts.join(" · ");
}
