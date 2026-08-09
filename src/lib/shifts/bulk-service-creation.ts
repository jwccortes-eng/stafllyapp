/**
 * P0 — BULK SERVICE CREATION
 * ==========================
 *
 * Creación masiva de Servicios *nativa* de Stafly. NO es un importador:
 * no hay archivos, no hay extracción, no hay tabla intermedia. El operador
 * escribe filas y cada fila válida se convierte en un Servicio real usando el
 * MISMO motor canónico (`buildCanonicalServiceInsert`) que usan Crear,
 * Duplicar, Copiar semana y las series.
 *
 * Este módulo es PURO: sin React, sin red, sin escrituras.
 *
 * No toca payroll, time entries, asignaciones, Connecteam ni Smart Intake.
 */

import { expandDateList } from "@/lib/intake/date-expansion";
import type { SeriesServiceSnapshot } from "./recurrence";
import type { SeriesPreview, SeriesPreviewRow } from "./series-engine";

export const BULK_REF_PREFIX = "bulk";

/** Marca legible que preserva lo detectado pero aún no vinculado. */
export const BULK_PENDING_MARK = "[Pendiente por vincular]";

export interface BulkServiceRow {
  /** Identidad estable de la fila dentro del lote (idempotencia). */
  id: string;
  /** yyyy-MM-dd */
  date: string;
  title: string;
  clientId: string | null;
  /** Texto escrito por el operador cuando aún no hay cliente vinculado. */
  clientRaw: string;
  locationId: string | null;
  /** Texto libre del lugar cuando no hay venue del catálogo. */
  locationRaw: string;
  /** HH:mm — puede quedar vacío (pendiente). */
  startTime: string;
  endTime: string;
  /** null = PENDIENTE. Nunca se interpreta como 0. */
  headcount: number | null;
  notes: string;
}

export type BulkRowStatus = "ready" | "incomplete" | "blocked";

export interface BulkRowValidation {
  status: BulkRowStatus;
  /** Lo que falta pero no impide crear el borrador. */
  pending: string[];
  /** Lo que impide crear el borrador. */
  blockers: string[];
}

let rowSeq = 0;

export function newBulkRowId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  rowSeq += 1;
  return `row-${Date.now().toString(36)}-${rowSeq}`;
}

export function newBulkBatchId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `bulk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newBulkRow(partial: Partial<BulkServiceRow> = {}): BulkServiceRow {
  return {
    id: partial.id ?? newBulkRowId(),
    date: partial.date ?? "",
    title: partial.title ?? "",
    clientId: partial.clientId ?? null,
    clientRaw: partial.clientRaw ?? "",
    locationId: partial.locationId ?? null,
    locationRaw: partial.locationRaw ?? "",
    startTime: partial.startTime ?? "",
    endTime: partial.endTime ?? "",
    headcount: partial.headcount ?? null,
    notes: partial.notes ?? "",
  };
}

/** Duplicar una fila conserva el contenido y estrena identidad. */
export function duplicateBulkRow(row: BulkServiceRow): BulkServiceRow {
  return { ...row, id: newBulkRowId() };
}

/** Referencia por fila: estable ante doble tap y reintento del mismo lote. */
export function bulkRowSourceRef(batchId: string, rowId: string): string {
  return `${BULK_REF_PREFIX}:${batchId}:${rowId}`;
}

export function parseBulkRowRef(
  ref: string | null | undefined,
): { batchId: string; rowId: string } | null {
  if (!ref) return null;
  const parts = String(ref).split(":");
  if (parts.length !== 3 || parts[0] !== BULK_REF_PREFIX) return null;
  if (!parts[1] || !parts[2]) return null;
  return { batchId: parts[1], rowId: parts[2] };
}

/** Identidad operativa mínima de la fila: cómo se llamará el Servicio. */
export function bulkRowTitle(row: BulkServiceRow): string {
  const explicit = row.title.trim();
  if (explicit) return explicit;
  const subject = row.clientRaw.trim() || row.locationRaw.trim();
  return subject || "Servicio";
}

/**
 * Una fila se puede crear como borrador con muy poco: fecha + identidad.
 * Todo lo demás queda PENDIENTE (nunca 0, nunca inventado).
 */
export function validateBulkRow(row: BulkServiceRow): BulkRowValidation {
  const blockers: string[] = [];
  const pending: string[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) blockers.push("Fecha");
  const hasIdentity =
    !!row.title.trim() || !!row.clientId || !!row.clientRaw.trim() || !!row.locationId || !!row.locationRaw.trim();
  if (!hasIdentity) blockers.push("Cliente, lugar o título");

  if (!row.clientId) pending.push(row.clientRaw.trim() ? "Cliente por vincular" : "Cliente");
  if (!row.locationId) pending.push(row.locationRaw.trim() ? "Lugar por vincular" : "Lugar");
  if (!row.startTime) pending.push("Hora de inicio");
  if (!row.endTime || row.endTime === row.startTime) pending.push("Hora final");
  if (row.headcount === null) pending.push("Personal");

  const status: BulkRowStatus = blockers.length > 0 ? "blocked" : pending.length > 0 ? "incomplete" : "ready";
  return { status, pending, blockers };
}

export function bulkRowStatusLabel(status: BulkRowStatus): string {
  if (status === "ready") return "Completo";
  if (status === "incomplete") return "Borrador con pendientes";
  return "Falta información obligatoria";
}

/**
 * Pegar fechas: una por línea o varias en la misma línea.
 * Reutiliza el expansor de fechas ya existente; no duplica gramática.
 */
export function parsePastedDates(
  text: string,
  referenceDate: string,
): { dates: string[]; unparsed: string[] } {
  const dates: string[] = [];
  const unparsed: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of (text ?? "").split(/[\n\r;]+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const iso = line.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
    if (iso) {
      if (!seen.has(iso)) { seen.add(iso); dates.push(iso); }
      continue;
    }

    const expansion = expandDateList(line, referenceDate);
    if (expansion.dates.length === 0) {
      unparsed.push(line);
      continue;
    }
    for (const d of expansion.dates) {
      if (seen.has(d.iso)) continue;
      seen.add(d.iso);
      dates.push(d.iso);
    }
  }

  dates.sort();
  return { dates, unparsed };
}

/** Bloque legible que preserva lo escrito pero no vinculado. */
export function buildBulkPendingBlock(row: BulkServiceRow): string | null {
  const lines: string[] = [];
  if (!row.clientId && row.clientRaw.trim()) {
    lines.push(`Cliente escrito: ${row.clientRaw.trim()} — pendiente de vincular`);
  }
  if (!row.locationId && row.locationRaw.trim()) {
    lines.push(`Lugar escrito: ${row.locationRaw.trim()} — pendiente de vincular`);
  }
  if (!row.endTime || row.endTime === row.startTime) lines.push("Hora final pendiente de confirmar");
  if (row.headcount === null) lines.push("Personal pendiente de definir");
  if (lines.length === 0) return null;
  return [BULK_PENDING_MARK, ...lines.map((l) => `- ${l}`)].join("\n");
}

/** Traductor único fila → snapshot canónico de Servicio. */
export function bulkRowToSnapshot(row: BulkServiceRow, companyId: string): SeriesServiceSnapshot {
  const pending = buildBulkPendingBlock(row);
  const notes = [row.notes.trim() || null, pending].filter(Boolean).join("\n\n") || null;
  const startTime = row.startTime || "00:00";
  const endTime = row.endTime || startTime;

  return {
    companyId,
    clientId: row.clientId,
    locationId: row.locationId,
    jobSiteLocationId: null,
    jobSiteAddress: row.locationId ? null : row.locationRaw.trim() || null,
    meetingPoint: null,
    meetingPointLocationId: null,
    title: bulkRowTitle(row),
    startTime,
    endTime,
    requestedHeadcount: row.headcount ?? 1,
    notes,
    specialInstructions: null,
    claimable: false,
    payType: "hourly",
    dayType: "full_day",
    payOverride: false,
    shiftAdminId: null,
    transportRequired: false,
    carCapacity: 5,
    transportNotes: null,
    driverIds: [],
    clockMethod: "both",
    attendanceMode: "clock",
    meetingTime: null,
    employeeIds: [],
    publicationIntent: "draft",
  };
}

export interface BulkPlanRow {
  rowId: string;
  date: string;
  sourceRef: string;
  snapshot: SeriesServiceSnapshot;
  /** PENDIENTE ≠ 0: cuando es null, `slots` se persiste como NULL. */
  headcount: number | null;
  validation: BulkRowValidation;
}

export interface BulkPlan {
  batchId: string;
  rows: BulkPlanRow[];
  /** Filas descartadas por falta de información obligatoria. */
  blocked: Array<{ rowId: string; blockers: string[] }>;
}

/** Plan inmutable del lote. Nada se escribe aquí. */
export function buildBulkPlan(input: {
  rows: BulkServiceRow[];
  batchId: string;
  companyId: string;
}): BulkPlan {
  const rows: BulkPlanRow[] = [];
  const blocked: BulkPlan["blocked"] = [];

  for (const row of input.rows) {
    const validation = validateBulkRow(row);
    if (validation.status === "blocked") {
      blocked.push({ rowId: row.id, blockers: validation.blockers });
      continue;
    }
    rows.push({
      rowId: row.id,
      date: row.date,
      sourceRef: bulkRowSourceRef(input.batchId, row.id),
      snapshot: bulkRowToSnapshot(row, input.companyId),
      headcount: row.headcount,
      validation,
    });
  }

  rows.sort((a, b) => (a.date === b.date ? a.rowId.localeCompare(b.rowId) : a.date.localeCompare(b.date)));
  return { batchId: input.batchId, rows, blocked };
}

/** Vista previa obligatoria, compatible con el diálogo único de series. */
export function buildBulkPreview(plan: BulkPlan): SeriesPreview {
  const rows: SeriesPreviewRow[] = plan.rows.map((r, index) => {
    const s = r.snapshot;
    const hasStart = s.startTime && s.startTime !== "00:00";
    const schedule =
      hasStart && s.endTime && s.endTime !== s.startTime
        ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}`
        : hasStart
          ? `${s.startTime.slice(0, 5)} · fin pendiente`
          : "Horario pendiente";
    return {
      date: r.date,
      index,
      isBase: index === 0,
      title: s.title,
      schedule,
      headcount: r.headcount ?? 0,
      clientId: s.clientId,
      venueId: s.locationId,
      workersToCopy: 0,
      publication: "draft",
      sourceRef: r.sourceRef,
    };
  });

  const pending = new Set<string>();
  for (const r of plan.rows) for (const p of r.validation.pending) pending.add(p);

  return { intentId: plan.batchId, total: rows.length, rows, pending: [...pending] };
}

export type BulkRowOutcomeStatus = "created" | "reused" | "failed";

export interface BulkRowOutcome {
  rowId: string;
  date: string;
  status: BulkRowOutcomeStatus;
  shiftId: string | null;
  ref: string | null;
  error: string | null;
}

export interface BulkSummary {
  total: number;
  created: number;
  reused: number;
  failed: number;
}

export function summarizeBulkOutcomes(outcomes: BulkRowOutcome[]): BulkSummary {
  return outcomes.reduce<BulkSummary>(
    (acc, o) => {
      acc.total += 1;
      if (o.status === "created") acc.created += 1;
      if (o.status === "reused") acc.reused += 1;
      if (o.status === "failed") acc.failed += 1;
      return acc;
    },
    { total: 0, created: 0, reused: 0, failed: 0 },
  );
}

export function bulkResultMessage(summary: BulkSummary): string {
  const persisted = summary.created + summary.reused;
  if (summary.failed === 0) {
    return `${persisted} borrador${persisted === 1 ? "" : "es"} ${persisted === 1 ? "creado" : "creados"}`;
  }
  return `${persisted} de ${summary.total} borradores creados — ${summary.failed} no se pudieron crear`;
}
