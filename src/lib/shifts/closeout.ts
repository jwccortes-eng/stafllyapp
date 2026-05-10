/**
 * Phase 17C — Daily Close / Captain Verification helpers.
 *
 * Operational evidence layer. NEVER touches:
 *   - payroll, payroll_adjustments
 *   - time_entries
 *   - attendance_status / shift_assignments
 *   - scheduled_shifts
 *
 * Server-side trigger handles:
 *   - submitted_at auto-stamp on status -> 'submitted'
 *   - reviewed_by / reviewed_at auto-stamp when admin sets review fields
 *   - blocking non-admin from setting review fields (closeout_review_admin_only)
 */
import { supabase } from "@/integrations/supabase/client";

export type CloseoutStatus = "draft" | "submitted" | "reviewed" | "rejected";
export type CloseoutReviewStatus =
  | "approved"
  | "needs_followup"
  | "escalated"
  | "rejected";
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
  return (data as ShiftCloseout) ?? null;
}

export interface UpsertCloseoutDraftPayload {
  company_id: string;
  shift_id: string;
  submitted_by: string;
  submitted_employee_id?: string | null;
  role: CloseoutRole;
  /** "draft" to keep editing, "submitted" to send to admin review. */
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

/**
 * Creates or updates the single closeout row per shift.
 * Never sets review fields. Server trigger stamps submitted_at when
 * status becomes "submitted".
 */
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
    return data as ShiftCloseout;
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
  return data as ShiftCloseout;
}

export interface ReviewCloseoutPayload {
  closeout_id: string;
  /** "reviewed" approves/finalizes; "rejected" returns to submitter scope. */
  status: "reviewed" | "rejected";
  review_status: CloseoutReviewStatus;
  review_notes?: string | null;
}

/**
 * Admin-only review action. Server trigger auto-stamps reviewed_by/reviewed_at.
 * RLS + guard trigger reject calls from non-admin users with
 * `closeout_review_admin_only`.
 */
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
  return data as ShiftCloseout;
}

export function closeoutStatusLabel(s: CloseoutStatus): string {
  switch (s) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted — pending review";
    case "reviewed":
      return "Reviewed";
    case "rejected":
      return "Rejected";
  }
}

export function reviewStatusLabel(s: CloseoutReviewStatus | null): string {
  if (!s) return "—";
  switch (s) {
    case "approved":
      return "Approved";
    case "needs_followup":
      return "Needs follow-up";
    case "escalated":
      return "Escalated";
    case "rejected":
      return "Rejected";
  }
}
