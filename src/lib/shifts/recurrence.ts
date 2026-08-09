/**
 * P0 — RECURRING SERVICE CREATION
 * ================================
 *
 * Modelo canónico de recurrencia de Servicios.
 *
 * Una recurrencia NO es una fila con varias fechas: produce Servicios
 * operativos independientes (UUID propio, QK propio, fecha propia), unidos
 * únicamente por una referencia de serie común.
 *
 * Trazabilidad e idempotencia reutilizan la infraestructura existente de
 * `scheduled_shifts.reconciliation_hash` (la misma que usa Smart Intake para
 * no duplicar drafts). No se crea ninguna tabla ni sistema paralelo.
 *
 * Este módulo es PURO: sin React, sin red, sin escrituras.
 */

export const RECURRENCE_REF_PREFIX = "series";

export interface RecurrenceOccurrencePlan {
  /** yyyy-MM-dd */
  date: string;
  /** 0 = ocurrencia origen. */
  index: number;
  isBase: boolean;
  /** Clave estable de idempotencia dentro de la intención. */
  sourceRef: string;
}

export interface RecurrenceSubmitSnapshot {
  intentId: string;
  baseDate: string;
  enabled: boolean;
  mode: "weekdays" | "range" | "next_n";
  selectedDays: number[];
  rangeStart: string;
  rangeEnd: string;
  nextNDays: number;
  copyAssignments: boolean;
  occurrences: RecurrenceOccurrencePlan[];
}

/**
 * Verdad confirmada del Servicio que se repetirá. Usa nombres de dominio y no
 * depende de estado React, presets, drafts locales ni valores por defecto.
 */
export interface SeriesServiceSnapshot {
  companyId: string;
  clientId: string | null;
  locationId: string | null;
  jobSiteLocationId: string | null;
  jobSiteAddress: string | null;
  meetingPoint: string | null;
  meetingPointLocationId: string | null;
  title: string;
  startTime: string;
  endTime: string;
  requestedHeadcount: number;
  notes: string | null;
  specialInstructions: string | null;
  claimable: boolean;
  payType: "hourly" | "daily";
  dayType: "full_day" | "half_day";
  payOverride: boolean;
  shiftAdminId: string | null;
  transportRequired: boolean;
  carCapacity: number;
  transportNotes: string | null;
  driverIds: string[];
  clockMethod: "mobile" | "kiosk" | "both";
  attendanceMode: ShiftAttendanceMode;
  meetingTime: string | null;
  employeeIds: string[];
  publicationIntent: "draft" | "publish_base";
}

export interface SeriesIntent {
  recurrence: RecurrenceSubmitSnapshot;
  service: Readonly<SeriesServiceSnapshot>;
}

/** Captura defensiva: los arrays quedan desligados del formulario mutable. */
export function buildSeriesIntent(input: {
  recurrence: RecurrenceSubmitSnapshot;
  service: SeriesServiceSnapshot;
}): SeriesIntent {
  return {
    recurrence: {
      ...input.recurrence,
      selectedDays: [...input.recurrence.selectedDays],
      occurrences: input.recurrence.occurrences.map((occurrence) => ({ ...occurrence })),
    },
    service: {
      ...input.service,
      driverIds: [...input.service.driverIds],
      employeeIds: [...input.service.employeeIds],
    },
  };
}

export function generateOccurrences(intent: SeriesIntent): Array<{
  occurrence: RecurrenceOccurrencePlan;
  service: SeriesServiceSnapshot;
  employeeIds: string[];
}> {
  const isSeries = intent.recurrence.occurrences.length > 1;
  return intent.recurrence.occurrences.map((occurrence) => ({
    occurrence: { ...occurrence },
    service: { ...intent.service, driverIds: [...intent.service.driverIds], employeeIds: [...intent.service.employeeIds] },
    employeeIds:
      !isSeries || occurrence.isBase || intent.recurrence.copyAssignments
        ? [...intent.service.employeeIds]
        : [],
  }));
}

/** Único traductor de una verdad confirmada a una fila de Servicio. */
export function buildCanonicalServiceInsert(input: {
  snapshot: SeriesServiceSnapshot;
  date: string;
  sourceRef?: string | null;
  createdBy?: string | null;
  draft: boolean;
}): Record<string, unknown> {
  const { snapshot, date, sourceRef = null, createdBy = null, draft } = input;
  return {
    company_id: snapshot.companyId,
    title: snapshot.title,
    date,
    start_time: snapshot.startTime,
    end_time: snapshot.endTime,
    slots: snapshot.requestedHeadcount,
    client_id: snapshot.clientId,
    location_id: snapshot.locationId,
    notes: snapshot.notes,
    claimable: snapshot.claimable,
    meeting_point: snapshot.meetingPoint,
    special_instructions: snapshot.specialInstructions,
    created_by: createdBy,
    pay_type: snapshot.payType,
    day_type: snapshot.payType === "daily" ? snapshot.dayType : "full_day",
    pay_override: snapshot.payOverride,
    shift_admin_id: snapshot.shiftAdminId,
    transportation_required: snapshot.transportRequired,
    car_capacity: snapshot.carCapacity,
    transportation_notes: snapshot.transportNotes,
    driver_employee_id: snapshot.driverIds[0] ?? null,
    clock_method: snapshot.clockMethod,
    attendance_mode: snapshot.attendanceMode,
    meeting_time: snapshot.meetingTime,
    meeting_point_location_id: snapshot.meetingPointLocationId,
    job_site_location_id: snapshot.jobSiteLocationId,
    job_site_address: snapshot.jobSiteAddress,
    ...(sourceRef ? { reconciliation_hash: sourceRef } : {}),
    status: draft ? "draft" : "published",
    publication_status: draft ? "draft" : "published",
    published_at: draft ? null : new Date().toISOString(),
    published_by: draft ? null : createdBy,
  };
}

/**
 * Foto inmutable tomada al pulsar Guardar/Publicar. Evita que una recuperación
 * local o los diálogos intermedios degraden una serie a una sola fecha.
 */
export function freezeRecurrenceSubmit(input: {
  intentId: string;
  baseDate: string;
  repeatDates: string[];
  config: Omit<RecurrenceSubmitSnapshot, "intentId" | "baseDate" | "occurrences">;
}): RecurrenceSubmitSnapshot {
  return {
    intentId: input.intentId,
    baseDate: input.baseDate,
    ...input.config,
    selectedDays: [...input.config.selectedDays],
    occurrences: planRecurrenceOccurrences(input.baseDate, input.repeatDates, input.intentId),
  };
}

/** Identidad estable de UNA intención de recurrencia (un submit del operador). */
export function newRecurrenceIntentId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Referencia por ocurrencia: única dentro de la empresa y estable ante retry. */
export function recurrenceOccurrenceRef(intentId: string, date: string): string {
  return `${RECURRENCE_REF_PREFIX}:${intentId}:${date}`;
}

/** Desde cualquier Servicio se puede reconstruir el lote del que nació. */
export function parseRecurrenceRef(
  ref: string | null | undefined,
): { intentId: string; date: string } | null {
  if (!ref) return null;
  const parts = String(ref).split(":");
  if (parts.length !== 3 || parts[0] !== RECURRENCE_REF_PREFIX) return null;
  if (!parts[1] || !parts[2]) return null;
  return { intentId: parts[1], date: parts[2] };
}

/**
 * Plan completo de la serie: ocurrencia origen + repeticiones.
 * - deduplica fechas,
 * - ordena cronológicamente,
 * - la base siempre es la fecha origen (aunque no sea la más temprana).
 */
export function planRecurrenceOccurrences(
  baseDate: string,
  repeatDates: string[],
  intentId: string,
): RecurrenceOccurrencePlan[] {
  if (!baseDate) return [];
  const seen = new Set<string>([baseDate]);
  const extras: string[] = [];
  for (const d of repeatDates ?? []) {
    const clean = (d ?? "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    extras.push(clean);
  }
  extras.sort();
  return [baseDate, ...extras].map((date, index) => ({
    date,
    index,
    isBase: index === 0,
    sourceRef: recurrenceOccurrenceRef(intentId, date),
  }));
}

export type OccurrenceStatus = "created" | "reused" | "failed";

export interface OccurrenceOutcome {
  date: string;
  isBase: boolean;
  status: OccurrenceStatus;
  shiftId: string | null;
  /** QK visible, cuando ya se conoce. */
  ref: string | null;
  workersRequested: number;
  workersCopied: number;
  error: string | null;
  sourceRef?: string | null;
}

export interface SeriesSummary {
  total: number;
  created: number;
  reused: number;
  failed: number;
  workersRequested: number;
  workersCopied: number;
  /** Servicios creados pero cuyo equipo no se pudo copiar. */
  workerFailures: number;
}

export function summarizeSeries(outcomes: OccurrenceOutcome[]): SeriesSummary {
  return outcomes.reduce<SeriesSummary>(
    (acc, o) => {
      acc.total += 1;
      if (o.status === "created") acc.created += 1;
      if (o.status === "reused") acc.reused += 1;
      if (o.status === "failed") acc.failed += 1;
      acc.workersRequested += o.workersRequested;
      acc.workersCopied += o.workersCopied;
      if (o.status !== "failed" && o.workersRequested > o.workersCopied) acc.workerFailures += 1;
      return acc;
    },
    { total: 0, created: 0, reused: 0, failed: 0, workersRequested: 0, workersCopied: 0, workerFailures: 0 },
  );
}

/** Copy operativo del resultado. Sin jerga técnica. */
export function seriesResultMessage(summary: SeriesSummary): string {
  const persisted = summary.created + summary.reused;
  if (summary.failed === 0) {
    return `${persisted} Servicio${persisted === 1 ? "" : "s"} de la serie ${persisted === 1 ? "creado" : "creados"}`;
  }
  return `${persisted} de ${summary.total} Servicios creados — ${summary.failed} no se pudieron crear`;
}
