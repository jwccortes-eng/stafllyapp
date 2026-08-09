/**
 * CONNECTEAM PROVISIONAL EXPORT COMPLETION
 * ========================================
 *
 * Connecteam exige una hora de fin (`End`) para crear el turno; Stafly registra
 * Servicios cuya hora final TODAVÍA NO EXISTE. Este módulo resuelve esa tensión
 * sin falsificar el dato canónico:
 *
 *   CANONICAL SERVICE DATA  ≠  CONNECTEAM EXPORT OVERRIDE
 *
 * El override es una decisión explícita del operador, vive solo durante la
 * exportación y NUNCA se escribe en `scheduled_shifts`.
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin React, sin BD, sin escrituras.
 *   No toca payroll, time_entries, assignments, staffing, ELDM, Smart Intake,
 *   VWC, auth, RLS ni tenants.
 */
import type { Shift } from "@/components/shifts/types";

/** Marca que el carril de intake deja en `notes` cuando la hora final no existe. */
const PENDING_END_MARK = "Hora de fin pendiente";

export type ProvisionalMode = "duration" | "end_time";

export interface ProvisionalEndDecision {
  mode: ProvisionalMode;
  /** Horas de duración provisional (mode = "duration"). */
  durationHours?: number;
  /** Hora final provisional "HH:MM" (mode = "end_time"). */
  endTime?: string;
  /** Motivo declarado por el operador. */
  reason?: string;
}

export interface ProvisionalEndTrace {
  shiftId: string;
  /** Referencia humana QK-XXXXXX. */
  ref: string;
  date: string;
  canonicalStart: string;
  /** Hora final canónica en Stafly (vacía o igual al inicio = pendiente). */
  canonicalEnd: string;
  exportStart: string;
  provisionalExportEnd: string;
  provisional: true;
  mode: ProvisionalMode;
  durationHours: number | null;
  reason: string;
  confirmedBy: string | null;
  exportedAt: string;
  batchRef: string;
}

const hhmm = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 5) : "";
};

/**
 * ¿Este Servicio necesita una hora final provisional para poder exportarse?
 *
 * Verdadero cuando la hora final no existe, es igual al inicio (Connecteam
 * descarta esas filas) o el intake la marcó como pendiente.
 */
export function needsProvisionalEnd(shift: Pick<Shift, "start_time" | "end_time" | "notes">): boolean {
  const start = hhmm(shift.start_time);
  const end = hhmm(shift.end_time);
  if (!start) return false; // sin inicio no hay nada que completar aquí
  if (!end) return true;
  if (start === end) return true;
  return String(shift.notes ?? "").includes(PENDING_END_MARK);
}

/** Suma horas a "HH:MM" con vuelta de medianoche. Devuelve "HH:MM". */
export function addHours(start: string, hours: number): string {
  const s = hhmm(start);
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || !Number.isFinite(hours)) return "";
  const total = (Number(m[1]) * 60 + Number(m[2]) + Math.round(hours * 60)) % (24 * 60);
  const norm = (total + 24 * 60) % (24 * 60);
  return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
}

/** Hora final provisional resultante de la decisión, o "" si es inválida. */
export function resolveProvisionalEnd(
  shift: Pick<Shift, "start_time">,
  decision: ProvisionalEndDecision,
): string {
  const start = hhmm(shift.start_time);
  if (decision.mode === "end_time") {
    const end = hhmm(decision.endTime);
    return end && end !== start ? end : "";
  }
  const hours = Number(decision.durationHours ?? 0);
  if (!(hours > 0) || hours > 24) return "";
  const end = addHours(start, hours);
  return end && end !== start ? end : "";
}

/**
 * Copia del Servicio SOLO para construir/validar la fila CSV. El objeto real
 * nunca se muta y nada se persiste.
 */
export function withProvisionalEnd<T extends Shift>(shift: T, provisionalEnd: string): T {
  if (!provisionalEnd) return shift;
  return { ...shift, end_time: provisionalEnd } as T;
}

/**
 * Nota que viaja en el CSV para que el turno importado sea auditable en
 * Connecteam: la hora final es provisional y no es un hecho confirmado.
 */
export function provisionalNote(provisionalEnd: string, decision: ProvisionalEndDecision): string {
  const detail =
    decision.mode === "duration" && decision.durationHours
      ? `duración provisional ${decision.durationHours}h`
      : "hora final provisional";
  return `End provisional ${provisionalEnd} (${detail}) — no confirmado en Stafly`;
}

/** Registro de trazabilidad de una fila exportada con dato provisional. */
export function buildProvisionalTrace(args: {
  shift: Shift;
  ref: string;
  provisionalEnd: string;
  decision: ProvisionalEndDecision;
  confirmedBy: string | null;
  batchRef: string;
  exportedAt?: Date;
}): ProvisionalEndTrace {
  const { shift, ref, provisionalEnd, decision, confirmedBy, batchRef } = args;
  const canonicalEnd = hhmm(shift.end_time);
  const canonicalStart = hhmm(shift.start_time);
  return {
    shiftId: shift.id,
    ref,
    date: shift.date ?? "",
    canonicalStart,
    canonicalEnd: canonicalEnd && canonicalEnd !== canonicalStart ? canonicalEnd : "",
    exportStart: canonicalStart,
    provisionalExportEnd: provisionalEnd,
    provisional: true,
    mode: decision.mode,
    durationHours: decision.mode === "duration" ? Number(decision.durationHours ?? 0) : null,
    reason: (decision.reason ?? "").trim() || "Hora final pendiente en Stafly",
    confirmedBy,
    exportedAt: (args.exportedAt ?? new Date()).toISOString(),
    batchRef,
  };
}

/** Copy canónico del flujo provisional (una sola voz en toda la UI). */
export const PROVISIONAL_COPY = {
  needTitle: "Connecteam necesita una hora final.",
  needBody: "En Stafly todavía no conocemos esa información.",
  cta: "Completar temporalmente para Connecteam",
  onlyForExport: "La hora provisional solo se utilizará para generar el CSV.",
  doesNotChangeService:
    "No modifica el Servicio, no modifica payroll y no cambia la realidad: el Servicio seguirá mostrando Hora pendiente.",
  exportWarning:
    "La hora final utilizada es provisional y no modifica el Servicio en Stafly.",
  headcountPending:
    "Cantidad de personal pendiente — Number of users viaja vacío. No se inventa 0 ni 1.",
} as const;

