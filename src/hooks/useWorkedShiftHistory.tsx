/**
 * useWorkedShiftHistory — read-only hook that enriches a worker's past
 * shifts with REAL clock data and pay-period status.
 *
 * Strict rules:
 *   - No DB writes. No payroll recalculation.
 *   - NEVER derives worked time from scheduled start/end. Only from time_entries.
 *   - period_base_pay is consulted ONLY to know if a row exists; the amount
 *     is intentionally not exposed by this hook (per Phase H1 scope).
 *   - historical_payroll_entries is NOT read.
 *   - Works only over the *visible* page of shifts to keep queries cheap.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WorkerShiftStatus =
  | "paid"
  | "published"
  | "in_review"
  | "pending_validation"
  | "open_clock"
  | "no_hours"
  | "no_period_yet";

export interface WorkedShiftEntry {
  shiftId: string;
  clockIn: string | null;     // ISO timestamp of FIRST clock_in across entries
  clockOut: string | null;    // ISO timestamp of LAST clock_out (only if no entry is open)
  breakMinutes: number;       // sum of break_minutes across closed entries
  workedMinutes: number;      // sum of closed intervals minus their break_minutes
  hasClosedTimeEntry: boolean;
  hasOpenClock: boolean;
  periodId: string | null;
  periodStatus: string | null;
  periodPublishedAt: string | null;
  periodPaidAt: string | null;
  workerStatus: WorkerShiftStatus;
  hasRide: boolean;
}

export interface UseWorkedShiftHistoryArgs {
  employeeId: string | null | undefined;
  companyId: string | null | undefined;
  /** Shifts currently visible in the History page. Hook only fetches for these. */
  visibleShifts: { shiftId: string; date: string }[];
}

interface State {
  byShiftId: Record<string, WorkedShiftEntry>;
  loading: boolean;
  error: string | null;
}

const EMPTY: State = { byShiftId: {}, loading: false, error: null };

function deriveStatus(args: {
  hasClosedTimeEntry: boolean;
  hasOpenClock: boolean;
  period: { status: string | null; published_at: string | null; paid_at: string | null } | null;
}): WorkerShiftStatus {
  const p = args.period;
  // Period-level statuses take precedence when paid/published.
  if (p?.paid_at || (p?.status && /paid/i.test(p.status))) return "paid";
  if (p?.published_at) return "published";
  if (p?.status && /(review|reviewing|reconciliation)/i.test(p.status)) return "in_review";

  if (args.hasOpenClock && !args.hasClosedTimeEntry) return "open_clock";
  if (!args.hasClosedTimeEntry && !args.hasOpenClock) {
    // No clock data at all
    return p ? "no_hours" : "no_period_yet";
  }
  // Closed entries exist but period is draft/open
  return p ? "pending_validation" : "no_period_yet";
}

export function useWorkedShiftHistory({
  employeeId,
  companyId,
  visibleShifts,
}: UseWorkedShiftHistoryArgs): State {
  const [state, setState] = useState<State>(EMPTY);

  // Stable key — only re-fetch when the visible set actually changes.
  const key = useMemo(() => {
    const ids = visibleShifts.map((s) => s.shiftId).sort().join(",");
    return `${employeeId ?? ""}|${companyId ?? ""}|${ids}`;
  }, [employeeId, companyId, visibleShifts]);

  useEffect(() => {
    let cancelled = false;
    if (!employeeId || !companyId || visibleShifts.length === 0) {
      setState(EMPTY);
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const shiftIds = visibleShifts.map((s) => s.shiftId);
        const dates = visibleShifts.map((s) => s.date).filter(Boolean).sort();
        const minDate = dates[0];
        const maxDate = dates[dates.length - 1];

        // 1) Real time entries linked to these shifts for this worker only.
        const tePromise = supabase
          .from("time_entries")
          .select("shift_id, clock_in, clock_out, break_minutes, status")
          .eq("employee_id", employeeId)
          .in("shift_id", shiftIds)
          .neq("status", "rejected");

        // 2) Pay periods overlapping the visible date range, scoped to company.
        const periodsPromise = supabase
          .from("pay_periods")
          .select("id, start_date, end_date, status, published_at, paid_at")
          .eq("company_id", companyId)
          .lte("start_date", maxDate)
          .gte("end_date", minDate);

        // 3) Optional: ride flag. RLS may deny — swallow error.
        const ridesPromise = supabase
          .from("shift_rides")
          .select("shift_id")
          .eq("employee_id", employeeId)
          .in("shift_id", shiftIds);

        const [teRes, periodsRes, ridesRes] = await Promise.all([
          tePromise,
          periodsPromise,
          ridesPromise,
        ]);

        if (cancelled) return;

        if (teRes.error) throw teRes.error;
        if (periodsRes.error) throw periodsRes.error;
        // rides may legitimately fail under RLS — silent fallback

        const periods = ((periodsRes.data ?? []) as any[]) as Array<{
          id: string;
          start_date: string;
          end_date: string;
          status: string | null;
          published_at: string | null;
          paid_at: string | null;
        }>;

        const findPeriodForDate = (date: string) =>
          periods.find((p) => p.start_date <= date && p.end_date >= date) ?? null;

        // Group time entries by shift_id
        const teByShift = new Map<string, Array<{ clock_in: string | null; clock_out: string | null; break_minutes: number | null }>>();
        for (const te of (teRes.data ?? []) as any[]) {
          const arr = teByShift.get(te.shift_id) ?? [];
          arr.push({ clock_in: te.clock_in, clock_out: te.clock_out, break_minutes: te.break_minutes ?? 0 });
          teByShift.set(te.shift_id, arr);
        }

        const ridesSet = new Set<string>(
          (ridesRes && !ridesRes.error ? (ridesRes.data ?? []) : []).map((r: any) => r.shift_id),
        );

        const byShiftId: Record<string, WorkedShiftEntry> = {};

        for (const { shiftId, date } of visibleShifts) {
          const entries = teByShift.get(shiftId) ?? [];
          let firstClockIn: string | null = null;
          let lastClockOut: string | null = null;
          let breakMinutes = 0;
          let workedMinutes = 0;
          let hasClosedTimeEntry = false;
          let hasOpenClock = false;

          for (const e of entries) {
            if (e.clock_in && (!firstClockIn || e.clock_in < firstClockIn)) firstClockIn = e.clock_in;
            if (e.clock_in && e.clock_out) {
              hasClosedTimeEntry = true;
              if (!lastClockOut || e.clock_out > lastClockOut) lastClockOut = e.clock_out;
              const diffMin = Math.max(
                0,
                Math.round((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000),
              );
              const brk = e.break_minutes ?? 0;
              breakMinutes += brk;
              workedMinutes += Math.max(0, diffMin - brk);
            } else if (e.clock_in && !e.clock_out) {
              hasOpenClock = true;
            }
          }

          const period = findPeriodForDate(date);
          const workerStatus = deriveStatus({ hasClosedTimeEntry, hasOpenClock, period });

          byShiftId[shiftId] = {
            shiftId,
            clockIn: firstClockIn,
            // Only expose lastClockOut when there is no still-open entry to avoid
            // a misleading "completed" appearance.
            clockOut: hasOpenClock ? null : lastClockOut,
            breakMinutes,
            workedMinutes,
            hasClosedTimeEntry,
            hasOpenClock,
            periodId: period?.id ?? null,
            periodStatus: period?.status ?? null,
            periodPublishedAt: period?.published_at ?? null,
            periodPaidAt: period?.paid_at ?? null,
            workerStatus,
            hasRide: ridesSet.has(shiftId),
          };
        }

        setState({ byShiftId, loading: false, error: null });
      } catch (err: any) {
        if (cancelled) return;
        console.error("[useWorkedShiftHistory] failed", err);
        setState({ byShiftId: {}, loading: false, error: err?.message ?? "Could not load history details." });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export const WORKER_STATUS_LABEL_ES: Record<WorkerShiftStatus, string> = {
  paid: "Pagado",
  published: "Publicado",
  in_review: "En revisión",
  pending_validation: "Pendiente de validación",
  open_clock: "Reloj sin cerrar",
  no_hours: "Sin horas registradas",
  no_period_yet: "No disponible todavía",
};
