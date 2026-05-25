/**
 * Phase 17C + Phase 2 — Daily Close / Captain Verification helpers
 * with operational final-approval layer (Keury sign-off).
 *
 * Operational evidence layer. NEVER touches:
 *   - payroll, payroll_adjustments, period_base_pay
 *   - time_entries (read-only here)
 *   - pay_periods (read-only here)
 *   - attendance_status / shift_assignments / scheduled_shifts (writes)
 *   - reconciliation_* logic
 *   - worker portal payment messaging
 *
 * Server-side trigger handles:
 *   - submitted_at auto-stamp on status -> 'submitted'
 *   - reviewed_by / reviewed_at auto-stamp when admin sets review fields
 *   - final_approved_by / final_approved_at auto-stamp on final approval
 *   - blocks non-admin from setting review fields (closeout_review_admin_only)
 *   - blocks non final-approver from setting final_* fields
 *     (closeout_final_approver_only)
 *   - blocks final approval unless status='reviewed' AND review_status='approved'
 *     (closeout_final_requires_review_approved)
 *   - writes activity_log entry on final approval changes
 */
import { supabase } from "@/integrations/supabase/client";

export type CloseoutStatus = "draft" | "submitted" | "reviewed" | "rejected";
export type CloseoutReviewStatus =
  | "approved"
  | "needs_followup"
  | "escalated"
  | "rejected";
export type CloseoutFinalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "on_hold";
export type CloseoutRole = "captain" | "shift_admin" | "manager" | "admin";

export interface ShiftCloseout {
  id: string;
  company_id: string;
  shift_id: string;
  submitted_by: string | null;
  submitted_employee_id: string | null;
  role: CloseoutRole | null;
  status: CloseoutStatus;
  staff_count_reported: number | null;
  no_show_count: number | null;
  late_count: number | null;
  incident_count: number | null;
  notes: string | null;
  uniform_ok: boolean | null;
  client_feedback: string | null;
  ready_for_admin_review: boolean | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_status: CloseoutReviewStatus | null;
  review_notes: string | null;
  final_approval_status: CloseoutFinalStatus | null;
  final_approved_by: string | null;
  final_approved_at: string | null;
  final_approval_notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getShiftCloseout(
  shiftId: string,
): Promise<ShiftCloseout | null> {
  if (!shiftId) return null;
  const { data, error } = await supabase
    .from("shift_closeout_reports")
    .select("*")
    .eq("shift_id", shiftId)
    .maybeSingle();
  if (error) {
    console.warn("[closeout] getShiftCloseout failed:", error.message);
    return null;
  }
  return (data as unknown as ShiftCloseout) ?? null;
}

export interface UpsertCloseoutDraftPayload {
  company_id: string;
  shift_id: string;
  submitted_by: string;
  submitted_employee_id?: string | null;
  role: CloseoutRole;
  status: "draft" | "submitted";
  staff_count_reported?: number | null;
  no_show_count?: number | null;
  late_count?: number | null;
  incident_count?: number | null;
  notes?: string | null;
  uniform_ok?: boolean | null;
  client_feedback?: string | null;
  ready_for_admin_review?: boolean | null;
}

export async function upsertShiftCloseoutDraft(
  payload: UpsertCloseoutDraftPayload,
): Promise<ShiftCloseout> {
  const existing = await getShiftCloseout(payload.shift_id);

  const base = {
    staff_count_reported: payload.staff_count_reported ?? 0,
    no_show_count: payload.no_show_count ?? 0,
    late_count: payload.late_count ?? 0,
    incident_count: payload.incident_count ?? 0,
    notes: payload.notes ?? null,
    uniform_ok: payload.uniform_ok ?? null,
    client_feedback: payload.client_feedback ?? null,
    ready_for_admin_review:
      payload.status === "submitted"
        ? true
        : (payload.ready_for_admin_review ?? false),
    status: payload.status,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("shift_closeout_reports")
      .update(base)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as unknown as ShiftCloseout;
  }

  const { data, error } = await supabase
    .from("shift_closeout_reports")
    .insert({
      company_id: payload.company_id,
      shift_id: payload.shift_id,
      submitted_by: payload.submitted_by,
      submitted_employee_id: payload.submitted_employee_id ?? null,
      role: payload.role,
      ...base,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as ShiftCloseout;
}

export interface ReviewCloseoutPayload {
  closeout_id: string;
  status: "reviewed" | "rejected";
  review_status: CloseoutReviewStatus;
  review_notes?: string | null;
}

export async function reviewShiftCloseout(
  payload: ReviewCloseoutPayload,
): Promise<ShiftCloseout> {
  const { data, error } = await supabase
    .from("shift_closeout_reports")
    .update({
      status: payload.status,
      review_status: payload.review_status,
      review_notes: payload.review_notes ?? null,
    })
    .eq("id", payload.closeout_id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as ShiftCloseout;
}

export interface FinalApprovePayload {
  closeout_id: string;
  final_approval_status: CloseoutFinalStatus;
  final_approval_notes?: string | null;
}

/**
 * Operational final approval (Keury / Quebri). Does NOT pay anyone. Does NOT
 * touch pay_periods / period_base_pay / time_entries. Server trigger gates
 * who can call this and refuses unless María already approved.
 */
export async function finalApproveCloseout(
  payload: FinalApprovePayload,
): Promise<ShiftCloseout> {
  const update: Record<string, unknown> = {
    final_approval_status: payload.final_approval_status,
    final_approval_notes: payload.final_approval_notes ?? null,
  };
  const { data, error } = await supabase
    .from("shift_closeout_reports")
    .update(update as never)
    .eq("id", payload.closeout_id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as ShiftCloseout;
}

// ── Spanish-first labels ──────────────────────────────────────────────────

export function closeoutStatusLabel(s: CloseoutStatus): string {
  switch (s) {
    case "draft":
      return "Borrador";
    case "submitted":
      return "En revisión de María";
    case "reviewed":
      return "Aprobado por María";
    case "rejected":
      return "Requiere corrección";
  }
}

export function reviewStatusLabel(s: CloseoutReviewStatus | null): string {
  if (!s) return "—";
  switch (s) {
    case "approved":
      return "Aprobado";
    case "needs_followup":
      return "Requiere seguimiento";
    case "escalated":
      return "Escalado";
    case "rejected":
      return "Rechazado";
  }
}

export function finalStatusLabel(s: CloseoutFinalStatus | null): string {
  if (!s) return "Pendiente aprobación final";
  switch (s) {
    case "pending":
      return "Pendiente aprobación final";
    case "approved":
      return "Listo para pago";
    case "rejected":
      return "Rechazado en aprobación final";
    case "on_hold":
      return "En pausa";
  }
}

// ── Evidence packet (read-only) ───────────────────────────────────────────

export interface EvidencePacket {
  required: number | null;
  assigned: number;
  accepted: number;
  clockIns: number;
  clockOuts: number;
  missingClockOut: number;
  incidents: number;
  pendingReviewHours: number;
  payType: string | null;
  dayPayNeedsPresence: boolean;
}

export async function getShiftEvidencePacket(
  shiftId: string,
): Promise<EvidencePacket | null> {
  if (!shiftId) return null;
  try {
    const [shiftRes, assignRes, teRes] = await Promise.all([
      supabase
        .from("scheduled_shifts")
        .select("slots, pay_type")
        .eq("id", shiftId)
        .maybeSingle(),
      supabase
        .from("shift_assignments")
        .select("id, response_status")
        .eq("shift_id", shiftId),
      supabase
        .from("time_entries")
        .select("clock_in, clock_out, status")
        .eq("shift_id", shiftId),
    ]);

    const shift = (shiftRes.data ?? null) as any;
    const assigns = (assignRes.data ?? []) as Array<{ response_status: string | null }>;
    const tes = (teRes.data ?? []) as Array<{
      clock_in: string | null;
      clock_out: string | null;
      status: string | null;
    }>;

    const assigned = assigns.length;
    const accepted = assigns.filter(
      (a) => (a.response_status ?? "").toLowerCase() === "accepted",
    ).length;
    const clockIns = tes.filter((t) => !!t.clock_in).length;
    const clockOuts = tes.filter((t) => !!t.clock_out).length;
    const missingClockOut = tes.filter(
      (t) => !!t.clock_in && !t.clock_out,
    ).length;
    const pendingReviewHours = tes
      .filter((t) => !!t.clock_in && !t.clock_out)
      .reduce((acc, t) => {
        const start = new Date(t.clock_in!).getTime();
        const hrs = Math.max(0, (Date.now() - start) / 3600000);
        return acc + Math.min(hrs, 24); // cap defensive
      }, 0);

    const payType = (shift?.pay_type ?? null) as string | null;
    return {
      required: shift?.slots ?? null,
      assigned,
      accepted,
      clockIns,
      clockOuts,
      missingClockOut,
      incidents: 0, // filled by caller from closeout
      pendingReviewHours: Math.round(pendingReviewHours * 10) / 10,
      payType,
      dayPayNeedsPresence: payType === "daily" || payType === "day_pay",
    };
  } catch (e) {
    console.warn("[closeout] getShiftEvidencePacket failed", e);
    return null;
  }
}
