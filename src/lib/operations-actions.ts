/**
 * operations-actions.ts
 *
 * Action layer for Ops alerts. Pure read-side suggestions + a registry that
 * maps each AlertKind → list of available actions. The UI consumes
 * `getAlertActions(alert)` to render inline buttons.
 *
 * IMPORTANT:
 *   - We never auto-assign or auto-broadcast. These are intent descriptors.
 *   - `suggestReplacements` is intentionally lightweight; the heavy candidate
 *     scoring lives in `ReplacementSuggestionDialog`. This wrapper just
 *     returns rank-ready candidates for non-dialog surfaces if needed.
 */
import { supabase } from "@/integrations/supabase/client";
import type { OpsAlert, AlertKind } from "@/lib/operations-intelligence";
import { computeWorkforceScoresBatch } from "@/lib/workforce-score";

export type AlertActionId =
  | "suggest_replacements"
  | "broadcast_shift"
  | "view_affected_employees"
  | "alert_supervisors"
  | "view_late_list"
  | "send_late_reminder"
  | "quick_assign"
  | "urgent_broadcast"
  | "reactivate_workforce";

export interface AlertAction {
  id: AlertActionId;
  label: string;
  /** Lucide icon name — UI maps it to a component. */
  icon: "UserPlus" | "Send" | "Users" | "Shield" | "Eye" | "Bell" | "Zap" | "Megaphone" | "RefreshCw";
  /** Visual hint for the button: primary → filled, secondary → ghost. */
  tone: "primary" | "secondary";
  /** Free-form payload the UI can pass to the dialog/handler. */
  payload?: Record<string, unknown>;
}

const ACTIONS_BY_KIND: Record<AlertKind, AlertAction[]> = {
  UNDERSTAFFED: [
    { id: "suggest_replacements", label: "Sugerir reemplazos", icon: "UserPlus", tone: "primary" },
    { id: "broadcast_shift", label: "Enviar broadcast", icon: "Send", tone: "secondary" },
  ],
  LOW_COVERAGE_SOON: [
    { id: "quick_assign", label: "Asignar rápido", icon: "Zap", tone: "primary" },
    { id: "urgent_broadcast", label: "Broadcast urgente", icon: "Megaphone", tone: "secondary" },
  ],
  NO_SHOW_SPIKE: [
    { id: "view_affected_employees", label: "Ver afectados", icon: "Users", tone: "primary" },
    { id: "alert_supervisors", label: "Avisar supervisores", icon: "Shield", tone: "secondary" },
  ],
  LATE_ARRIVALS: [
    { id: "view_late_list", label: "Ver lista", icon: "Eye", tone: "primary" },
    { id: "send_late_reminder", label: "Enviar reminder", icon: "Bell", tone: "secondary" },
  ],
  OPEN_CLOCK: [
    { id: "view_affected_employees", label: "Ver afectados", icon: "Users", tone: "primary" },
  ],
  INACTIVE_WORKFORCE: [
    { id: "reactivate_workforce", label: "Reactivar (mensaje)", icon: "RefreshCw", tone: "primary" },
  ],
};

/**
 * Returns the available actions for a given alert. Always includes the
 * shiftIds + employeeIds in the payload so handlers can route directly.
 */
export function getAlertActions(alert: OpsAlert): AlertAction[] {
  const base = ACTIONS_BY_KIND[alert.kind] ?? [];
  return base.map(a => ({
    ...a,
    payload: {
      ...(a.payload ?? {}),
      shiftIds: alert.shiftIds,
      employeeIds: alert.employeeIds ?? [],
      zone: alert.zone,
      alertId: alert.id,
    },
  }));
}

// ─── Replacement suggestions (lightweight) ──────────────────────────────────
export interface ReplacementCandidate {
  employeeId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phoneNumber: string | null;
  score: number;            // workforce composite (0–100)
  rating: number;           // 0–5
  ratingCount: number;
  available: boolean;       // not assigned to an overlapping shift
  distanceKm?: number;      // populated when shift has lat/lng
}

/**
 * Suggests replacement candidates for a shift, ranked by composite score
 * (availability is filtered first, then sorted by score). Designed to be
 * cheap so it can power inline previews; the full dialog still does its own
 * deeper scoring including no-show penalty and tags.
 */
export async function suggestReplacements(shiftId: string, opts?: {
  limit?: number;
  excludeEmployeeIds?: string[];
}): Promise<ReplacementCandidate[]> {
  const limit = opts?.limit ?? 10;
  const exclude = new Set(opts?.excludeEmployeeIds ?? []);

  // 1. Resolve shift → company + date window
  const { data: shift } = await supabase
    .from("scheduled_shifts")
    .select("id, company_id, date, start_time, end_time, location_id")
    .eq("id", shiftId)
    .maybeSingle();
  if (!shift) return [];

  // 2. Active employees of this company
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, avatar_url, phone_number")
    .eq("company_id", shift.company_id)
    .eq("is_active", true);
  if (!employees?.length) return [];

  const candidateIds = employees.map(e => e.id).filter(id => !exclude.has(id));
  if (!candidateIds.length) return [];

  // 3. Overlap check — candidates already booked in an overlapping shift
  const { data: busy } = await supabase
    .from("shift_assignments")
    .select("employee_id, scheduled_shifts!inner(date, start_time, end_time)")
    .in("employee_id", candidateIds)
    .eq("scheduled_shifts.date", shift.date)
    .not("status", "in", '("rejected","removed")') as any;

  const busySet = new Set<string>();
  (busy ?? []).forEach((b: any) => {
    const s = b.scheduled_shifts;
    if (!s) return;
    if (shift.start_time < s.end_time && shift.end_time > s.start_time) {
      busySet.add(b.employee_id);
    }
  });

  // 4. Workforce scores in one batch
  const scores = await computeWorkforceScoresBatch(shift.company_id, candidateIds);
  const scoreMap = new Map(scores.map(s => [s.employeeId, s]));
  const empMap = new Map(employees.map(e => [e.id, e]));

  const ranked: ReplacementCandidate[] = candidateIds.map(id => {
    const e = empMap.get(id)!;
    const s = scoreMap.get(id);
    return {
      employeeId: id,
      firstName: e.first_name,
      lastName: e.last_name,
      avatarUrl: e.avatar_url ?? null,
      phoneNumber: e.phone_number ?? null,
      score: s?.composite ?? 50,
      rating: s?.rating ?? 0,
      ratingCount: s?.ratingCount ?? 0,
      available: !busySet.has(id),
    };
  });

  // Available first, then by score
  ranked.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return b.score - a.score;
  });

  return ranked.slice(0, limit);
}
