/**
 * useTodayOperations — Daily Operations Command Center data hook.
 *
 * Read-only. Joins scheduled_shifts + shift_assignments + time_entries +
 * lookup tables (clients, locations, employees) for a given company + date,
 * and computes per-shift operational state via deriveShiftOpsState.
 *
 * Realtime: subscribes to assignment + time_entry changes for the company
 * and refetches.
 *
 * Hard rule: never converts scheduled hours into worked hours.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  AssignmentLite,
  EntryLite,
  ShiftLite,
  ShiftOpsState,
  deriveShiftOpsState,
} from "@/lib/operations/derive-shift-ops-state";

export interface ShiftTransportInfo {
  required: boolean;
  car_capacity: number;
  primary_driver_id: string | null;
  rides_count: number;
  drivers_assigned: number;          // unique drivers across rides + primary driver
  capacity_total: number;            // car_capacity * rides_count (or car_capacity if no rides but primary)
  missing_driver: boolean;           // required && drivers_assigned === 0
  capacity_short: boolean;           // required && slots > capacity_total
}

export interface TodayOpsShift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  publication_status: string | null;
  slots: number;
  shift_code: string | null;
  client_id: string | null;
  client_name: string | null;
  location_id: string | null;
  job_site_name: string | null;
  meeting_point: string | null;
  meeting_point_location_id: string | null;
  meeting_point_location_name: string | null;
  meeting_time: string | null;
  shift_admin_id: string | null;
  pending_claims: number;
  transport: ShiftTransportInfo;
  ops: ShiftOpsState;
}


export interface TodayOpsEmployee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone_number: string | null;
}

export interface TodayOpsResult {
  loading: boolean;
  error: string | null;
  shifts: TodayOpsShift[];
  employeesById: Map<string, TodayOpsEmployee>;
  totals: {
    shifts: number;
    needs_staff: number;
    in_progress: number;
    needs_closeout: number;
    closed: number;
    open_clocks: number;
    missing_clock_outs: number;
    not_clocked_in: number;
    urgent: number;
    pending_claims: number;
  };
  refresh: () => void;
}

export function useTodayOperations(
  companyId: string | null,
  date: Date,
): TodayOpsResult {
  const dateStr = format(date, "yyyy-MM-dd");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shifts, setShifts] = useState<TodayOpsShift[]>([]);
  const [employees, setEmployees] = useState<TodayOpsEmployee[]>([]);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!companyId) {
      setShifts([]);
      setEmployees([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // 1) Load today's shifts first (small set) so we can scope subsequent
    //    queries by shift_id. This avoids the Supabase 1000-row default cap
    //    on company-wide assignment/time_entries queries (root cause of the
    //    Daily Ops "0/1 assigned" mismatch vs Shift Detail truth).
    const shiftsRes = await supabase
      .from("scheduled_shifts")
      .select(
        "id, title, date, start_time, end_time, status, publication_status, slots, shift_code, client_id, location_id, meeting_point, meeting_time, shift_admin_id",
      )
      .eq("company_id", companyId)
      .eq("date", dateStr)
      .is("deleted_at", null)
      .order("start_time");

    if (shiftsRes.error) {
      setError(shiftsRes.error.message);
      setLoading(false);
      return;
    }
    const todayShiftIds = (shiftsRes.data ?? []).map((s: any) => s.id);

    const [assignRes, entriesRes, clientsRes, locsRes, empsRes, claimsRes] =
      await Promise.all([
        todayShiftIds.length
          ? supabase
              .from("shift_assignments")
              .select("id, shift_id, employee_id, status")
              .in("shift_id", todayShiftIds)
          : Promise.resolve({ data: [], error: null } as any),
        todayShiftIds.length
          ? supabase
              .from("time_entries")
              .select("id, employee_id, shift_id, clock_in, clock_out")
              .in("shift_id", todayShiftIds)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from("clients").select("id, name").eq("company_id", companyId),
        supabase
          .from("locations")
          .select("id, name")
          .eq("company_id", companyId),
        supabase
          .from("employees")
          .select("id, first_name, last_name, avatar_url, phone_number")
          .eq("company_id", companyId)
          .eq("is_active", true),
        todayShiftIds.length
          ? supabase
              .from("shift_requests")
              .select("id, shift_id, status")
              .in("shift_id", todayShiftIds)
              .eq("status", "pending")
          : Promise.resolve({ data: [], error: null } as any),
      ]);

    const firstErr =
      assignRes.error ||
      entriesRes.error ||
      clientsRes.error ||
      locsRes.error ||
      empsRes.error ||
      claimsRes.error;

    if (firstErr) {
      setError(firstErr.message);
      setLoading(false);
      return;
    }

    const clientMap = new Map(
      (clientsRes.data ?? []).map((c: any) => [c.id, c.name]),
    );
    const locMap = new Map(
      (locsRes.data ?? []).map((l: any) => [l.id, l.name]),
    );
    const allAssignments = (assignRes.data ?? []) as AssignmentLite[];
    const allEntries = (entriesRes.data ?? []) as EntryLite[];
    const claimsByShift = new Map<string, number>();
    for (const c of (claimsRes.data ?? []) as Array<{ shift_id: string }>) {
      claimsByShift.set(c.shift_id, (claimsByShift.get(c.shift_id) ?? 0) + 1);
    }
    const now = new Date();

    const rows: TodayOpsShift[] = (shiftsRes.data ?? []).map((s: any) => {
      const shiftLite: ShiftLite = {
        id: s.id,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        slots: s.slots,
        publication_status: s.publication_status,
        status: s.status,
      };
      const ops = deriveShiftOpsState(shiftLite, allAssignments, allEntries, now);
      return {
        id: s.id,
        title: s.title,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        status: s.status,
        publication_status: s.publication_status ?? null,
        slots: s.slots ?? 1,
        shift_code: s.shift_code ?? null,
        client_id: s.client_id ?? null,
        client_name: s.client_id ? (clientMap.get(s.client_id) ?? null) : null,
        location_id: s.location_id ?? null,
        job_site_name: s.location_id ? (locMap.get(s.location_id) ?? null) : null,
        meeting_point: s.meeting_point ?? null,
        meeting_time: s.meeting_time ?? null,
        shift_admin_id: s.shift_admin_id ?? null,
        pending_claims: claimsByShift.get(s.id) ?? 0,
        ops,
      };
    });

    setShifts(rows);
    setEmployees((empsRes.data ?? []) as TodayOpsEmployee[]);
    setLoading(false);
  }, [companyId, dateStr]);

  useEffect(() => {
    load();
  }, [load, tick]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    channelsRef.current = [];

    const refresh = () => setTick((t) => t + 1);
    const ch1 = supabase
      .channel(`daily-ops-assign-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shift_assignments",
          filter: `company_id=eq.${companyId}`,
        },
        refresh,
      )
      .subscribe();
    const ch2 = supabase
      .channel(`daily-ops-entries-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `company_id=eq.${companyId}`,
        },
        refresh,
      )
      .subscribe();
    const ch3 = supabase
      .channel(`daily-ops-shifts-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scheduled_shifts",
          filter: `company_id=eq.${companyId}`,
        },
        refresh,
      )
      .subscribe();
    const ch4 = supabase
      .channel(`daily-ops-claims-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shift_requests",
          filter: `company_id=eq.${companyId}`,
        },
        refresh,
      )
      .subscribe();

    channelsRef.current = [ch1, ch2, ch3, ch4];
    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [companyId]);

  const employeesById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );

  const totals = useMemo(() => {
    return {
      shifts: shifts.length,
      needs_staff: shifts.filter((s) => s.ops.bucket === "needs_staff").length,
      in_progress: shifts.filter((s) => s.ops.bucket === "in_progress").length,
      needs_closeout: shifts.filter((s) => s.ops.bucket === "needs_closeout").length,
      closed: shifts.filter((s) => s.ops.bucket === "closed").length,
      open_clocks: shifts.reduce((n, s) => n + s.ops.open_clocks, 0),
      missing_clock_outs: shifts.reduce((n, s) => n + s.ops.missing_clock_outs, 0),
      not_clocked_in: shifts.reduce((n, s) => n + s.ops.not_started, 0),
      urgent: shifts.filter((s) => s.ops.alert_level === "urgent").length,
      pending_claims: shifts.reduce((n, s) => n + (s.pending_claims ?? 0), 0),
    };
  }, [shifts]);

  return {
    loading,
    error,
    shifts,
    employeesById,
    totals,
    refresh: () => setTick((t) => t + 1),
  };
}
