/**
 * P0 OX — Terminal hours approval.
 *
 * Operates ONLY on the review status of `time_entries`
 * (status / approved_by / approved_at). It NEVER edits clock_in, clock_out,
 * break_minutes or any hour value, and never touches payroll tables, rates,
 * overtime rules or pay periods. Payroll keeps reading real hours from
 * `time_entries` exactly as before.
 */

import { supabase } from "@/integrations/supabase/client";

export type HoursStatus = "pending" | "approved" | "rejected";

export const HOURS_STATE_LABEL: Record<string, string> = {
  pending: "Horas pendientes",
  needs_review: "Revisión requerida",
  approved: "Horas aprobadas",
  ready_for_payroll: "Listo para payroll",
  rejected: "Devuelto para corrección",
};

export interface HoursEntry {
  id: string;
  employee_id: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number | null;
  status: string | null;
}

/** Derives the explicit UI state. No ambiguous states. */
export function hoursStateOf(entry: HoursEntry): keyof typeof HOURS_STATE_LABEL {
  const s = (entry.status ?? "pending").toLowerCase();
  if (s === "rejected") return "rejected";
  if (s === "approved") return "ready_for_payroll";
  if (!entry.clock_out) return "needs_review";
  return "pending";
}

/** Real worked hours from real punches only. Never scheduled hours. */
export function realHoursOf(entry: HoursEntry): number | null {
  if (!entry.clock_in || !entry.clock_out) return null;
  const ms = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const hours = ms / 3_600_000 - (entry.break_minutes ?? 0) / 60;
  return Math.round(Math.max(0, hours) * 100) / 100;
}

interface AuditContext {
  companyId: string;
  userId: string;
  shiftId?: string | null;
}

async function logHoursAudit(
  ctx: AuditContext,
  action: "hours_approved" | "hours_returned",
  entryIds: string[],
  reason?: string | null,
) {
  try {
    await supabase.from("activity_log").insert({
      user_id: ctx.userId,
      company_id: ctx.companyId,
      action,
      entity_type: "time_entries",
      entity_id: ctx.shiftId ?? null,
      details: { entry_ids: entryIds, reason: reason ?? null, count: entryIds.length },
    } as never);
  } catch (e) {
    console.warn("[hours-approval] audit log failed", e);
  }
}

export async function approveHours(
  entryIds: string[],
  ctx: AuditContext,
): Promise<number> {
  if (entryIds.length === 0) return 0;
  const { error, count } = await supabase
    .from("time_entries")
    .update(
      {
        status: "approved",
        approved_by: ctx.userId,
        approved_at: new Date().toISOString(),
      } as never,
      { count: "exact" },
    )
    .in("id", entryIds)
    .eq("company_id", ctx.companyId);
  if (error) throw error;
  await logHoursAudit(ctx, "hours_approved", entryIds);
  return count ?? entryIds.length;
}

export async function returnHoursForCorrection(
  entryIds: string[],
  reason: string,
  ctx: AuditContext,
): Promise<number> {
  if (entryIds.length === 0) return 0;
  if (!reason.trim()) throw new Error("Escribe el motivo de la devolución.");
  const { error, count } = await supabase
    .from("time_entries")
    .update(
      {
        status: "rejected",
        approved_by: null,
        approved_at: null,
      } as never,
      { count: "exact" },
    )
    .in("id", entryIds)
    .eq("company_id", ctx.companyId);
  if (error) throw error;
  await logHoursAudit(ctx, "hours_returned", entryIds, reason);
  return count ?? entryIds.length;
}
