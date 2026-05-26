/**
 * lib/shifts/time-corrections.ts
 *
 * Client-side wrappers for the attendance-correction RPCs:
 *   - request_time_entry_correction
 *   - review_time_entry_correction
 *   - list_shift_corrections
 *
 * These RPCs are the ONLY supported path for proposing/reviewing
 * corrections. Raw punches are never silently overwritten.
 */
import { supabase } from "@/integrations/supabase/client";

export type CorrectionType =
  | "missing_clock_in"
  | "missing_clock_out"
  | "adjust_clock_in"
  | "adjust_clock_out"
  | "manual_entry"
  | "day_pay_validation";

export type CorrectionDecision = "approved" | "rejected";

export interface ShiftCorrectionRow {
  pending_time_entry_id: string;
  company_id: string;
  shift_id: string;
  employee_id: string;
  correction_type: CorrectionType;
  status: "pending_correction" | "rejected";
  proposed_clock_in: string | null;
  proposed_clock_out: string | null;
  original_clock_in: string | null;
  original_clock_out: string | null;
  target_time_entry_id: string | null;
  reason: string | null;
  note: string | null;
  requested_by: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
}

export interface RequestCorrectionInput {
  company_id: string;
  shift_id: string;
  employee_id: string;
  time_entry_id?: string | null;
  correction_type: CorrectionType;
  corrected_clock_in?: string | null;
  corrected_clock_out?: string | null;
  reason: string;
  note?: string | null;
}

export async function requestTimeEntryCorrection(
  input: RequestCorrectionInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("request_time_entry_correction", {
    p_company_id: input.company_id,
    p_shift_id: input.shift_id,
    p_employee_id: input.employee_id,
    p_time_entry_id: input.time_entry_id ?? null,
    p_correction_type: input.correction_type,
    p_corrected_clock_in: input.corrected_clock_in ?? null,
    p_corrected_clock_out: input.corrected_clock_out ?? null,
    p_reason: input.reason,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function reviewTimeEntryCorrection(
  pending_time_entry_id: string,
  decision: CorrectionDecision,
  review_note?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("review_time_entry_correction", {
    p_pending_time_entry_id: pending_time_entry_id,
    p_decision: decision,
    p_review_note: review_note ?? null,
  });
  if (error) throw error;
}

export async function listShiftCorrections(
  shift_id: string,
): Promise<ShiftCorrectionRow[]> {
  const { data, error } = await supabase.rpc("list_shift_corrections", {
    p_shift_id: shift_id,
  });
  if (error) {
    console.warn("[corrections] list failed", error.message);
    return [];
  }
  return (data ?? []) as ShiftCorrectionRow[];
}

export const CORRECTION_TYPE_LABEL: Record<CorrectionType, string> = {
  missing_clock_in: "Agregar entrada",
  missing_clock_out: "Agregar salida",
  adjust_clock_in: "Ajustar entrada",
  adjust_clock_out: "Ajustar salida",
  manual_entry: "Registrar manualmente",
  day_pay_validation: "Validar pago por día",
};

export function mapCorrectionErrorMessage(message: string): string {
  if (message.includes("correction_reason_required"))
    return "Debes ingresar un motivo (mínimo 3 caracteres).";
  if (message.includes("correction_not_authorized"))
    return "No tienes permiso para corregir fichajes en este turno.";
  if (message.includes("review_not_authorized"))
    return "Solo el revisor de horas puede aprobar/rechazar.";
  if (message.includes("review_self_review_blocked"))
    return "No puedes aprobar una corrección que tú mismo enviaste.";
  if (message.includes("review_already_resolved"))
    return "Esta corrección ya fue revisada.";
  if (message.includes("correction_clock_in_required"))
    return "Falta la hora de entrada propuesta.";
  if (message.includes("correction_clock_out_required"))
    return "Falta la hora de salida propuesta.";
  if (message.includes("correction_manual_entry_requires_both"))
    return "Registro manual requiere entrada y salida.";
  return message;
}
