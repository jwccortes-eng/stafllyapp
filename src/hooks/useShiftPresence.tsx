/**
 * useShiftPresence — real-time operational presence for a single shift.
 *
 * Returns per-assignment lines (arrival / departure / punctuality) plus
 * aggregates (programados / llegaron / tarde / en sitio / salieron / no_show).
 *
 * Data source: clock_events (type IN arrival, departure, clock_in, clock_out).
 * Tolerates either pure-arrival shifts or clock shifts — clock_in is treated
 * as an "arrival" for presence purposes when the shift uses arrival/hybrid.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import type {
  PresenceStatus,
  Punctuality,
  ShiftAttendanceMode,
} from "@/lib/shift-attendance-mode";

export interface PresenceLine {
  employeeId: string;
  employeeName: string;
  status: PresenceStatus;
  arrivalAt: string | null;
  departureAt: string | null;
  punctuality: Punctuality | null;
  arrivalSource: "qr" | "manual" | "clock" | "kiosk" | null;
  arrivalLat: number | null;
  arrivalLng: number | null;
}

export interface ShiftPresenceSummary {
  shiftId: string;
  attendanceMode: ShiftAttendanceMode;
  scheduledCount: number;
  arrivedCount: number;
  arrivedLateCount: number;
  onSiteCount: number;
  departedCount: number;
  noShowCount: number;
  pendingCount: number;
  lines: PresenceLine[];
}

interface UseShiftPresenceOptions {
  shiftId: string | null;
  companyId: string | null;
  enabled?: boolean;
  /** Poll interval in ms. Default 20s. Set 0 to disable. */
  pollMs?: number;
}

export function useShiftPresence({
  shiftId,
  companyId,
  enabled = true,
  pollMs = 20_000,
}: UseShiftPresenceOptions) {
  const [data, setData] = useState<ShiftPresenceSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!shiftId || !companyId) return null;
    setLoading(true);
    try {
      const [shiftRes, assignmentsRes, eventsRes] = await Promise.all([
        supabase
          .from("scheduled_shifts")
          .select("id, attendance_mode, pay_type")
          .eq("id", shiftId)
          .maybeSingle(),
        supabase
          .from("shift_assignments")
          .select("id, employee_id, status, employees(id, first_name, last_name)")
          .eq("shift_id", shiftId)
          .eq("company_id", companyId)
          .not("status", "in", "(rejected,removed)"),
        supabase
          .from("clock_events")
          .select("employee_id, type, created_at, clock_method, latitude, longitude, punctuality")
          .eq("shift_id", shiftId)
          .eq("company_id", companyId)
          .order("created_at", { ascending: true }),
      ]);

      const shiftRow = (shiftRes.data ?? null) as any;
      const attendanceMode: ShiftAttendanceMode =
        (shiftRow?.attendance_mode as ShiftAttendanceMode) ??
        ((shiftRow?.pay_type ?? "").toLowerCase() === "daily" ? "arrival" : "clock");

      const assignments = (assignmentsRes.data ?? []) as any[];
      const events = (eventsRes.data ?? []) as any[];

      // Build per-employee event index
      type EvtTuple = { arrival?: any; departure?: any };
      const byEmp = new Map<string, EvtTuple>();
      for (const evt of events) {
        const slot = byEmp.get(evt.employee_id) ?? {};
        // For presence purposes, clock_in counts as arrival when no explicit
        // arrival event exists; same for clock_out → departure.
        const isArrivalLike = evt.type === "arrival" || evt.type === "clock_in";
        const isDepartureLike = evt.type === "departure" || evt.type === "clock_out";
        if (isArrivalLike && !slot.arrival) slot.arrival = evt;
        if (isDepartureLike) slot.departure = evt; // last one wins
        byEmp.set(evt.employee_id, slot);
      }

      const lines: PresenceLine[] = assignments.map((a) => {
        const slot = byEmp.get(a.employee_id) ?? {};
        const arrival = slot.arrival;
        const departure = slot.departure;
        const explicitNoShow = a.status === "no_show";

        let status: PresenceStatus = "pending";
        if (explicitNoShow) status = "no_show";
        else if (departure) status = "departed";
        else if (arrival) {
          status = arrival.punctuality === "late" || arrival.punctuality === "very_late"
            ? "arrived_late"
            : "on_site";
        }

        return {
          employeeId: a.employee_id,
          employeeName: a.employees
            ? formatPersonName(`${a.employees.first_name} ${a.employees.last_name}`)
            : "Desconocido",
          status,
          arrivalAt: arrival?.created_at ?? null,
          departureAt: departure?.created_at ?? null,
          punctuality: (arrival?.punctuality as Punctuality | null) ?? null,
          arrivalSource: arrival
            ? (arrival.clock_method as PresenceLine["arrivalSource"]) ?? "manual"
            : null,
          arrivalLat: arrival?.latitude ?? null,
          arrivalLng: arrival?.longitude ?? null,
        };
      });

      const summary: ShiftPresenceSummary = {
        shiftId,
        attendanceMode,
        scheduledCount: lines.length,
        arrivedCount: lines.filter(l => l.status === "on_site" || l.status === "departed" || l.status === "arrived").length,
        arrivedLateCount: lines.filter(l => l.status === "arrived_late").length,
        onSiteCount: lines.filter(l => l.status === "on_site" || l.status === "arrived" || l.status === "arrived_late").length,
        departedCount: lines.filter(l => l.status === "departed").length,
        noShowCount: lines.filter(l => l.status === "no_show").length,
        pendingCount: lines.filter(l => l.status === "pending").length,
        lines,
      };

      setData(summary);
      return summary;
    } catch (err) {
      console.error("useShiftPresence error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [shiftId, companyId]);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  // Polling for live updates
  useEffect(() => {
    if (!enabled || !pollMs) return;
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [enabled, pollMs, load]);

  return { data, loading, refetch: load };
}
