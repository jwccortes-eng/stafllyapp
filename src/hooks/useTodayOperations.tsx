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
import { driverIdsFromAssignments } from "@/lib/shifts/driver-sync";

/**
 * P0.3.1 — CONTRATO MULTI-DRIVER
 * La fuente de verdad es `shift_assignments.assignment_role = 'driver'`.
 * `scheduled_shifts.driver_employee_id` sólo se usa como compatibilidad legada
 * (se añade al conjunto cuando no existe una fila de asignación equivalente).
 */
export interface ShiftTransportInfo {
  required: boolean;
  car_capacity: number;
  /** Colección completa de conductores del turno (verdad multi-driver). */
  driver_ids: string[];
  /** LEGADO/compatibilidad: primer conductor. Nunca sustituye a `driver_ids`. */
  primary_driver_id: string | null;
  rides_count: number;
  drivers_assigned: number;          // conductores únicos (asignaciones + rides)
  capacity_total: number;            // car_capacity * (rides o conductores)
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
  /** P0.2 — referencia operativa visible por empresa (`QK-001573`). */
  shift_ref: string | null;
  client_id: string | null;
  client_name: string | null;
  location_id: string | null;
  /** Job Site V2 — destino canónico prioritario. */
  job_site_location_id: string | null;
  job_site_address: string | null;
  job_site_location_name: string | null;
  claimable: boolean | null;
  transportation_required: boolean;
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
    locations: number;
    needs_staff: number;
    in_progress: number;
    needs_closeout: number;
    closed: number;
    required: number;
    assigned: number;
    confirmed: number;
    clocked_in_now: number;
    open_clocks: number;
    missing_clock_outs: number;
    not_clocked_in: number;
    urgent: number;
    pending_claims: number;
    transport_missing_driver: number;
    transport_capacity_short: number;
    transport_required_shifts: number;
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
        "id, title, date, start_time, end_time, status, publication_status, slots, shift_code, shift_ref, client_id, location_id, meeting_point, meeting_point_location_id, meeting_time, shift_admin_id, transportation_required, car_capacity, driver_employee_id",
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

    const [assignRes, entriesRes, clientsRes, locsRes, locsV2Res, empsRes, claimsRes, ridesRes] =
      await Promise.all([
        todayShiftIds.length
          ? supabase
              .from("shift_assignments")
              .select("id, shift_id, employee_id, status, assignment_role")
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
          .from("locations_v2")
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
        todayShiftIds.length
          ? supabase
              .from("shift_rides")
              .select("id, shift_id, driver_id, passenger_count")
              .in("shift_id", todayShiftIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

    const firstErr =
      assignRes.error ||
      entriesRes.error ||
      clientsRes.error ||
      locsRes.error ||
      locsV2Res.error ||
      empsRes.error ||
      claimsRes.error ||
      ridesRes.error;

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
    const locV2Map = new Map(
      (locsV2Res.data ?? []).map((l: any) => [l.id, l.name]),
    );
    const allAssignments = (assignRes.data ?? []) as AssignmentLite[];
    const allEntries = (entriesRes.data ?? []) as EntryLite[];
    const claimsByShift = new Map<string, number>();
    for (const c of (claimsRes.data ?? []) as Array<{ shift_id: string }>) {
      claimsByShift.set(c.shift_id, (claimsByShift.get(c.shift_id) ?? 0) + 1);
    }
    const ridesByShift = new Map<string, Array<{ driver_id: string; passenger_count: number }>>();
    for (const r of (ridesRes.data ?? []) as Array<{ shift_id: string; driver_id: string; passenger_count: number }>) {
      const arr = ridesByShift.get(r.shift_id) ?? [];
      arr.push({ driver_id: r.driver_id, passenger_count: r.passenger_count ?? 0 });
      ridesByShift.set(r.shift_id, arr);
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

      const rides = ridesByShift.get(s.id) ?? [];
      // P0.3.1 — conductores reales del turno: filas de asignación con rol
      // 'driver' + el campo legado (sólo si no está ya representado) + los
      // conductores declarados en los rides.
      const assignedDriverIds = driverIdsFromAssignments(
        allAssignments as any[],
        s.id,
        s.driver_employee_id ?? null,
      );
      const driverIds = new Set<string>(assignedDriverIds);
      for (const r of rides) if (r.driver_id) driverIds.add(r.driver_id);
      const required = !!s.transportation_required;
      const capacity = Number(s.car_capacity ?? 4);
      const rideCount = rides.length;
      // Sin rides, cada conductor aporta un vehículo: N conductores = N capacidades.
      const capacity_total = rideCount > 0 ? capacity * rideCount : capacity * driverIds.size;
      const slots = s.slots ?? 1;
      const transport: ShiftTransportInfo = {
        required,
        car_capacity: capacity,
        driver_ids: [...driverIds],
        primary_driver_id: assignedDriverIds[0] ?? s.driver_employee_id ?? null,
        rides_count: rideCount,
        drivers_assigned: driverIds.size,
        capacity_total,
        missing_driver: required && driverIds.size === 0,
        capacity_short: required && slots > capacity_total,
      };


      return {
        id: s.id,
        title: s.title,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        status: s.status,
        publication_status: s.publication_status ?? null,
        slots,
        shift_code: s.shift_code ?? null,
        shift_ref: (s as any).shift_ref ?? null,
        client_id: s.client_id ?? null,
        client_name: s.client_id ? (clientMap.get(s.client_id) ?? null) : null,
        location_id: s.location_id ?? null,
        job_site_location_id: s.job_site_location_id ?? null,
        job_site_address: s.job_site_address ?? null,
        job_site_location_name: jobSiteName,
        claimable: s.claimable ?? null,
        transportation_required: Boolean(s.transportation_required),
        job_site_name: jobSiteName ?? legacyVenueName,


        meeting_point: s.meeting_point ?? null,
        meeting_point_location_id: s.meeting_point_location_id ?? null,
        meeting_point_location_name: s.meeting_point_location_id
          ? (locV2Map.get(s.meeting_point_location_id) ?? null)
          : null,
        meeting_time: s.meeting_time ?? null,
        shift_admin_id: s.shift_admin_id ?? null,
        pending_claims: claimsByShift.get(s.id) ?? 0,
        transport,
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
    const locationKeys = new Set<string>();
    for (const s of shifts) {
      locationKeys.add(
        s.location_id ??
          s.meeting_point_location_id ??
          s.client_id ??
          (s.meeting_point ? `mp:${s.meeting_point.trim().toLowerCase()}` : "sin"),
      );
    }
    return {
      shifts: shifts.length,
      locations: locationKeys.size,
      needs_staff: shifts.filter((s) => s.ops.bucket === "needs_staff").length,
      in_progress: shifts.filter((s) => s.ops.bucket === "in_progress").length,
      needs_closeout: shifts.filter((s) => s.ops.bucket === "needs_closeout").length,
      closed: shifts.filter((s) => s.ops.bucket === "closed").length,
      required: shifts.reduce((n, s) => n + (s.slots ?? 0), 0),
      assigned: shifts.reduce((n, s) => n + s.ops.assigned_active, 0),
      confirmed: shifts.reduce((n, s) => n + s.ops.confirmed, 0),
      clocked_in_now: shifts.reduce((n, s) => n + s.ops.open_clocks, 0),
      open_clocks: shifts.reduce((n, s) => n + s.ops.open_clocks, 0),
      missing_clock_outs: shifts.reduce((n, s) => n + s.ops.missing_clock_outs, 0),
      not_clocked_in: shifts.reduce((n, s) => n + s.ops.not_started, 0),
      urgent: shifts.filter((s) => s.ops.alert_level === "urgent").length,
      pending_claims: shifts.reduce((n, s) => n + (s.pending_claims ?? 0), 0),
      transport_missing_driver: shifts.filter((s) => s.transport.missing_driver).length,
      transport_capacity_short: shifts.filter((s) => s.transport.capacity_short && !s.transport.missing_driver).length,
      transport_required_shifts: shifts.filter((s) => s.transport.required).length,
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
