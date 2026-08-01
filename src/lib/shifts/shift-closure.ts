/**
 * P0 OX — Terminal shift closure.
 *
 * Pure evaluation helpers + the single terminal write that marks a shift as
 * operationally closed. Built entirely on the EXISTING `shift_closeout_reports`
 * table (no new tables, no migration).
 *
 * HARD GUARANTEES:
 *   - Never writes to payroll, pay_periods, period_base_pay, payroll_adjustments.
 *   - Never modifies hours. `time_entries` is read-only here.
 *   - Never uses scheduled hours as real hours.
 *   - Never touches shift_assignments / scheduled_shifts.
 *   - Audit is appended to `activity_log` (append-only).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  getShiftCloseout,
  type ShiftCloseout,
} from "@/lib/shifts/closeout";

export type ClosureItemKind = "blocker" | "warning" | "ok";

export interface ClosureItem {
  id: string;
  kind: ClosureItemKind;
  /** Human sentence, e.g. "Faltan 2 fichajes por cerrar". */
  label: string;
  /** Why it matters / what to do. */
  detail?: string;
  /** Optional in-context resolution deep-link. */
  action?: { label: string; to: string };
}

export interface ClosureInput {
  shiftId: string;
  /** Time entries of THIS shift only (already tenant + shift scoped). */
  timeEntries: Array<{
    id: string;
    clock_in: string | null;
    clock_out: string | null;
    status: string | null;
  }>;
  /** Accepted/assigned workers of this shift. */
  assignedCount: number;
  /** Open incidents reported at closeout (0 when unknown). */
  incidentCount: number;
  /** Existing closeout row, if any. */
  closeout: ShiftCloseout | null;
  /** True once the shift end time has passed. */
  shiftEnded: boolean;
}

export interface ClosureReadiness {
  items: ClosureItem[];
  blockers: ClosureItem[];
  warnings: ClosureItem[];
  /** True when there is no real operational reason to block the close. */
  canClose: boolean;
  /** Already terminal — nothing more to do. */
  isClosed: boolean;
  /** Primary CTA label following the UX contract. */
  ctaLabel: string;
  openClockOuts: number;
  pendingHours: number;
}

export function isShiftClosed(closeout: ShiftCloseout | null): boolean {
  if (!closeout) return false;
  return closeout.status === "reviewed" && closeout.review_status === "approved";
}

/**
 * Pure. No I/O. Decides what is genuinely blocking an operational close.
 *
 * Blocking (real operational reasons only):
 *   - open clock-outs (a worker is still clocked in)
 *   - hours still pending review
 * Everything else is informative.
 */
export function evaluateShiftClosure(input: ClosureInput): ClosureReadiness {
  const items: ClosureItem[] = [];

  const openClockOuts = input.timeEntries.filter(
    (t) => !!t.clock_in && !t.clock_out,
  ).length;
  const pendingHours = input.timeEntries.filter(
    (t) => (t.status ?? "pending").toLowerCase() === "pending" && !!t.clock_out,
  ).length;
  const withEntry = input.timeEntries.filter((t) => !!t.clock_in).length;

  if (openClockOuts > 0) {
    items.push({
      id: "open-clock-outs",
      kind: "blocker",
      label:
        openClockOuts === 1
          ? "1 fichaje sigue abierto"
          : `${openClockOuts} fichajes siguen abiertos`,
      detail:
        "Alguien todavía figura trabajando. Cierra el fichaje real antes de cerrar el turno.",
      action: {
        label: "Abrir Time Clock",
        to: `/app/timeclock?shiftId=${encodeURIComponent(input.shiftId)}`,
      },
    });
  }

  if (pendingHours > 0) {
    items.push({
      id: "pending-hours",
      kind: "blocker",
      label:
        pendingHours === 1
          ? "1 registro de horas por revisar"
          : `${pendingHours} registros de horas por revisar`,
      detail: "Aprueba o devuelve las horas reales antes de cerrar.",
      action: {
        label: "Revisar horas",
        to: `/app/payroll-review-queue?shiftId=${encodeURIComponent(input.shiftId)}`,
      },
    });
  }

  if (input.incidentCount > 0) {
    items.push({
      id: "incidents",
      kind: "warning",
      label:
        input.incidentCount === 1
          ? "1 incidencia reportada"
          : `${input.incidentCount} incidencias reportadas`,
      detail: "Puedes cerrar igual; la incidencia queda registrada en el cierre.",
    });
  }

  if (input.assignedCount > 0 && withEntry < input.assignedCount) {
    items.push({
      id: "missing-entries",
      kind: "warning",
      label: `${input.assignedCount - withEntry} de ${input.assignedCount} workers sin fichaje`,
      detail:
        "Puede ser una ausencia real. Se registra tal cual: no se inventan horas.",
      action: {
        label: "Ver asistencia",
        to: `/app/timeclock?shiftId=${encodeURIComponent(input.shiftId)}`,
      },
    });
  } else if (input.assignedCount > 0) {
    items.push({
      id: "evidence",
      kind: "ok",
      label: "Evidencia completa",
      detail: `${withEntry} de ${input.assignedCount} workers con fichaje real.`,
    });
  }

  if (!input.shiftEnded) {
    items.push({
      id: "not-ended",
      kind: "blocker",
      label: "El turno todavía no termina",
      detail: "El cierre se habilita cuando pasa la hora de fin.",
    });
  }

  const blockers = items.filter((i) => i.kind === "blocker");
  const warnings = items.filter((i) => i.kind === "warning");
  const closed = isShiftClosed(input.closeout);

  return {
    items,
    blockers,
    warnings,
    canClose: blockers.length === 0 && !closed,
    isClosed: closed,
    ctaLabel: closed
      ? "Turno cerrado"
      : blockers.length > 0
        ? "Revisar y cerrar turno"
        : "Cerrar turno",
    openClockOuts,
    pendingHours,
  };
}

export interface CloseShiftPayload {
  companyId: string;
  shiftId: string;
  userId: string;
  notes?: string | null;
  staffCountReported?: number | null;
  incidentCount?: number | null;
}

/**
 * The terminal action. Idempotent-ish: if the shift is already closed it
 * returns the existing row instead of writing again (double-submit guard on
 * the server side of the UI).
 */
export async function closeShift(
  payload: CloseShiftPayload,
): Promise<ShiftCloseout> {
  const existing = await getShiftCloseout(payload.shiftId);
  if (existing && isShiftClosed(existing)) return existing;

  let rowId = existing?.id ?? null;

  if (!rowId) {
    const { data, error } = await supabase
      .from("shift_closeout_reports")
      .insert({
        company_id: payload.companyId,
        shift_id: payload.shiftId,
        submitted_by: payload.userId,
        role: "admin",
        status: "submitted",
        ready_for_admin_review: true,
        staff_count_reported: payload.staffCountReported ?? 0,
        no_show_count: 0,
        late_count: 0,
        incident_count: payload.incidentCount ?? 0,
        notes: payload.notes ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    rowId = (data as { id: string }).id;
  }

  const { data: closed, error: closeError } = await supabase
    .from("shift_closeout_reports")
    .update({
      status: "reviewed",
      review_status: "approved",
      review_notes: payload.notes ?? null,
    } as never)
    .eq("id", rowId)
    .select("*")
    .single();
  if (closeError) throw closeError;

  // Append-only audit. Failure here must not hide a successful close.
  try {
    await supabase.from("activity_log").insert({
      user_id: payload.userId,
      company_id: payload.companyId,
      action: "shift_closed",
      entity_type: "scheduled_shift",
      entity_id: payload.shiftId,
      details: {
        closeout_id: rowId,
        notes: payload.notes ?? null,
        source: "shift_ops_terminal_close",
      },
    } as never);
  } catch (e) {
    console.warn("[shift-closure] audit log failed", e);
  }

  return closed as unknown as ShiftCloseout;
}
