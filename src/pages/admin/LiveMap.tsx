/**
 * Stafly Live Ops Map — Phase 1 (UI-only premium shell)
 *
 * Estricto Fase 1: NO toca payroll, time_entries, shift_assignments,
 * scheduled_shifts, RLS, auth, tenants, edge functions ni DB.
 * Solo lectura. Reusa LiveOperationsMap, EmptyState, useIsMobile.
 *
 * Mejora respecto a la versión anterior:
 *  - Header con 9 KPIs operativos (algunos derivados, otros marcados "—" como
 *    placeholders seguros hasta Fase 6).
 *  - Chip filter bar (Hoy / Mañana, y filtros por bucket operativo).
 *  - Panel lateral priorizado por problemas (No-show → Tarde → Fuera de zona →
 *    Sin fichaje → Termina pronto → Fichados normales → Sin GPS).
 *  - Mobile issue-first: tarjetas de problemas primero, mapa colapsado bajo CTA.
 *  - Empty states ES-first.
 *
 * Derivaciones (puras, sin escribir nada):
 *  - Tarde       = asignado al turno, no fichado, start_time + 15min ≤ ahora
 *  - No-show     = asignado al turno, no fichado, start_time + 60min ≤ ahora
 *  - Sin fichaje = asignado al turno hoy y no fichado (incluye los anteriores)
 *  - Termina pronto = fichado y end_time programado ≤ ahora + 30min
 *  - Fuera de zona = distancia al sitio más cercano > 300m (lógica existente)
 */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  MapPin, RefreshCw, Loader2, AlertTriangle, Clock,
  Navigation, Search, Signal, Phone, Wifi, WifiOff, Info,
  Users, UserX, Timer, ShieldAlert, ChevronDown, ChevronUp,
  Map as MapIcon, CheckCircle2,
} from "lucide-react";
import {
  LiveOperationsMap,
  type LiveMapLayer,
  type LiveMapLocation,
  type LiveMapWorker,
} from "@/components/maps/LiveOperationsMap";
import { distanceMeters } from "@/lib/geo-helpers";
import { differenceInMinutes, format, addDays } from "date-fns";
import {
  WorkerDrawer,
  LocationDrawer,
  type WorkerDrawerContext,
  type LocationDrawerContext,
  type WorkerStatus,
} from "@/components/livemap/LiveMapDrawers";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos locales
// ─────────────────────────────────────────────────────────────────────────────
interface ClockAlert {
  id: string;
  employee_id: string;
  employee_name: string;
  type: string;
  severity: string;
  description: string;
  created_at: string;
}

interface ClockedInNoGps {
  employee_id: string;
  employee_name: string;
  shift_title: string;
  client_name: string;
  clock_in: string;
  phone: string | null;
  scheduled_end?: string | null; // HH:MM:SS
}

interface ScheduledAssignment {
  employee_id: string;
  employee_name: string;
  shift_title: string;
  start_time: string; // HH:MM:SS
  end_time: string | null;
  date: string;
  phone: string | null;
  location_name: string | null;
}

type Bucket =
  | "all"
  | "clocked_in"
  | "late"
  | "no_show"
  | "missing"
  | "outside"
  | "ending_soon"
  | "no_gps";

const BUCKET_LABEL: Record<Bucket, string> = {
  all: "Todos",
  clocked_in: "Fichados",
  late: "Tarde",
  no_show: "No-show",
  missing: "Sin fichaje",
  outside: "Fuera de zona",
  ending_soon: "Termina pronto",
  no_gps: "Sin GPS",
};

const LATE_THRESHOLD_MIN = 15;
const NO_SHOW_THRESHOLD_MIN = 60;
const ENDING_SOON_WINDOW_MIN = 30;
const OFFSITE_THRESHOLD_M = 300;

type DateScope = "today" | "tomorrow";

export default function LiveMap() {
  const { role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<LiveMapWorker[]>([]);
  const [clockedNoGps, setClockedNoGps] = useState<ClockedInNoGps[]>([]);
  const [locations, setLocations] = useState<LiveMapLocation[]>([]);
  const [alerts, setAlerts] = useState<ClockAlert[]>([]);
  const [scheduledAssignments, setScheduledAssignments] = useState<ScheduledAssignment[]>([]);
  const [activeEmployeeIds, setActiveEmployeeIds] = useState<Set<string>>(new Set());
  const [activeShiftEndByEmp, setActiveShiftEndByEmp] = useState<Map<string, string | null>>(new Map());

  const [showLayer, setShowLayer] = useState<LiveMapLayer>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [dateScope, setDateScope] = useState<DateScope>("today");
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [v2LocationIds, setV2LocationIds] = useState<Set<string>>(new Set());
  const [locationAddressById, setLocationAddressById] = useState<Map<string, string | null>>(new Map());

  // Fase 2A: drawers solo lectura
  const [workerDrawerCtx, setWorkerDrawerCtx] = useState<WorkerDrawerContext | null>(null);
  const [locationDrawerCtx, setLocationDrawerCtx] = useState<LocationDrawerContext | null>(null);

  const hasAccess = ["developer", "owner", "admin", "manager"].includes(role ?? "");

  // ─── Fetch data (solo lectura) ──────────────────────────────────────────────
  const fetchData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    const targetDate = dateScope === "today" ? today : tomorrow;

    // 1) Active time entries (fichados ahora — independiente de fecha seleccionada)
    const { data: activeEntries } = await supabase
      .from("time_entries")
      .select("employee_id, clock_in, shift_id")
      .eq("company_id", selectedCompanyId)
      .is("clock_out", null);

    const activeList = activeEntries ?? [];
    const activeIdsList = activeList.map((e) => e.employee_id);
    const activeIdsSet = new Set(activeIdsList);
    setActiveEmployeeIds(activeIdsSet);

    // 2) Employees (activos fichados)
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, avatar_url")
      .eq("company_id", selectedCompanyId)
      .in("id", activeIdsList.length > 0 ? activeIdsList : ["__none__"]);
    const employeeMap = new Map((employees ?? []).map((e) => [e.id, e]));

    // 3) Eventos GPS clock_in para los activos
    const { data: clockEvents } = await supabase
      .from("clock_events")
      .select("employee_id, latitude, longitude, accuracy, created_at, shift_id")
      .eq("company_id", selectedCompanyId)
      .eq("type", "clock_in")
      .in("employee_id", activeIdsList.length > 0 ? activeIdsList : ["__none__"])
      .not("latitude", "is", null)
      .order("created_at", { ascending: false });

    const gpsByEmployee = new Map<string, NonNullable<typeof clockEvents>[number]>();
    for (const ce of clockEvents ?? []) {
      if (gpsByEmployee.has(ce.employee_id)) continue;
      const entry = activeList.find((e) => e.employee_id === ce.employee_id);
      if (!entry) continue;
      if (new Date(ce.created_at).getTime() < new Date(entry.clock_in).getTime() - 60_000) continue;
      gpsByEmployee.set(ce.employee_id, ce);
    }

    // 4) Shifts activos (para títulos, clientes, end_time del turno fichado)
    const shiftIds = [...new Set(activeList.map((e) => e.shift_id).filter(Boolean))] as string[];
    const { data: shifts } = await supabase
      .from("scheduled_shifts")
      .select(
        "id, title, end_time, client_id, clients(name), location_id, locations(name, latitude, longitude, geofence_radius, city), job_site_location_id, meeting_point_location_id",
      )
      .in("id", shiftIds.length > 0 ? shiftIds : ["__none__"]);
    const shiftMap = new Map((shifts ?? []).map((s: any) => [s.id, s]));

    // 5) Sitios estructurados de los turnos fichados
    const v2Ids = new Set<string>();
    for (const s of shifts ?? []) {
      const sa = s as any;
      if (sa.job_site_location_id) v2Ids.add(sa.job_site_location_id);
      if (sa.meeting_point_location_id) v2Ids.add(sa.meeting_point_location_id);
    }
    let shiftV2Locations: LiveMapLocation[] = [];
    if (v2Ids.size > 0) {
      const { data: v2 } = await supabase
        .from("locations_v2")
        .select("id, name, formatted_address, latitude, longitude, geofence_radius_meters")
        .in("id", Array.from(v2Ids))
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      shiftV2Locations = ((v2 ?? []) as any[]).map((l) => ({
        id: l.id,
        name: l.name ?? l.formatted_address ?? "Ubicación de turno",
        latitude: l.latitude,
        longitude: l.longitude,
        geofence_radius: l.geofence_radius_meters ?? 200,
        city: null,
      }));
    }

    // 6) Construir workers con/sin GPS
    const workersList: LiveMapWorker[] = [];
    const noGpsList: ClockedInNoGps[] = [];
    const endByEmp = new Map<string, string | null>();

    for (const entry of activeList) {
      const emp = employeeMap.get(entry.employee_id);
      const empName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "Desconocido" : "Desconocido";
      const shift = entry.shift_id ? (shiftMap.get(entry.shift_id) as any) : null;
      const shiftTitle = shift?.title ?? "Sin turno";
      const clientName = shift?.clients?.name ?? "";
      const scheduledEnd = shift?.end_time ?? null;
      endByEmp.set(entry.employee_id, scheduledEnd);
      const ce = gpsByEmployee.get(entry.employee_id);

      if (ce && ce.latitude != null && ce.longitude != null) {
        workersList.push({
          employee_id: entry.employee_id,
          employee_name: empName,
          latitude: ce.latitude,
          longitude: ce.longitude,
          accuracy: ce.accuracy ?? 0,
          clock_in: entry.clock_in,
          shift_title: shiftTitle,
          client_name: clientName,
          phone: emp?.phone_number ?? null,
        });
      } else {
        noGpsList.push({
          employee_id: entry.employee_id,
          employee_name: empName,
          shift_title: shiftTitle,
          client_name: clientName,
          clock_in: entry.clock_in,
          phone: emp?.phone_number ?? null,
          scheduled_end: scheduledEnd,
        });
      }
    }
    setWorkers(workersList);
    setClockedNoGps(noGpsList);
    setActiveShiftEndByEmp(endByEmp);

    // 7) Ubicaciones biblioteca
    const { data: locationsData } = await supabase
      .from("locations")
      .select("id, name, latitude, longitude, geofence_radius, city")
      .eq("company_id", selectedCompanyId)
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    const libraryLocations: LiveMapLocation[] = (locationsData ?? []).map((l: any) => ({
      id: l.id,
      name: l.name,
      latitude: l.latitude,
      longitude: l.longitude,
      geofence_radius: l.geofence_radius ?? 200,
      city: l.city,
    }));
    const merged: LiveMapLocation[] = [...shiftV2Locations];
    for (const l of libraryLocations) if (!merged.find((m) => m.id === l.id)) merged.push(l);
    setLocations(merged);

    // 8) Alertas
    const { data: alertsData } = await supabase
      .from("clock_alerts")
      .select("id, employee_id, type, severity, description, created_at")
      .eq("company_id", selectedCompanyId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    // Hidratamos nombres en bloque (alerts pueden ser de personas no fichadas)
    const alertEmpIds = Array.from(new Set((alertsData ?? []).map((a: any) => a.employee_id).filter(Boolean)));
    const missingAlertEmps = alertEmpIds.filter((id) => !employeeMap.has(id));
    if (missingAlertEmps.length > 0) {
      const { data: extra } = await supabase
        .from("employees")
        .select("id, first_name, last_name, phone_number, avatar_url")
        .in("id", missingAlertEmps);
      for (const e of extra ?? []) employeeMap.set(e.id, e as any);
    }

    setAlerts(
      (alertsData ?? []).map((a: any) => {
        const emp = employeeMap.get(a.employee_id);
        return {
          id: a.id,
          employee_id: a.employee_id,
          employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Desconocido",
          type: a.type,
          severity: a.severity,
          description: a.description ?? "",
          created_at: a.created_at,
        };
      }),
    );

    // 9) Asignaciones del día seleccionado (no escribimos nada)
    const { data: assignmentsData } = await supabase
      .from("shift_assignments")
      .select(
        "employee_id, scheduled_shifts(title, date, start_time, end_time, locations(name))",
      )
      .eq("company_id", selectedCompanyId)
      .not("status", "in", "(rejected,removed)");

    const assignmentsFiltered = (assignmentsData ?? []).filter(
      (a: any) => a.scheduled_shifts?.date === targetDate,
    );

    // Hidratamos nombres faltantes
    const assignEmpIds = Array.from(new Set(assignmentsFiltered.map((a: any) => a.employee_id).filter(Boolean)));
    const missingAssignEmps = assignEmpIds.filter((id) => !employeeMap.has(id));
    if (missingAssignEmps.length > 0) {
      const { data: extra } = await supabase
        .from("employees")
        .select("id, first_name, last_name, phone_number, avatar_url")
        .in("id", missingAssignEmps);
      for (const e of extra ?? []) employeeMap.set(e.id, e as any);
    }

    const schedList: ScheduledAssignment[] = assignmentsFiltered.map((a: any) => {
      const emp = employeeMap.get(a.employee_id);
      return {
        employee_id: a.employee_id,
        employee_name: emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "Desconocido" : "Desconocido",
        shift_title: a.scheduled_shifts?.title ?? "",
        start_time: a.scheduled_shifts?.start_time ?? "",
        end_time: a.scheduled_shifts?.end_time ?? null,
        date: a.scheduled_shifts?.date ?? targetDate,
        phone: emp?.phone_number ?? null,
        location_name: a.scheduled_shifts?.locations?.name ?? null,
      };
    });
    setScheduledAssignments(schedList);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, dateScope]);

  // Realtime (igual que antes)
  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase
      .channel("live-map-clock")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `company_id=eq.${selectedCompanyId}` },
        () => fetchData())
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "clock_events", filter: `company_id=eq.${selectedCompanyId}` },
        () => fetchData())
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "clock_alerts", filter: `company_id=eq.${selectedCompanyId}` },
        () => fetchData())
      .subscribe();
    const interval = setInterval(fetchData, 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, dateScope]);

  // ─── Derivaciones puras (no escribimos nada) ────────────────────────────────
  const workersWithDistance = useMemo(() => {
    return workers.map((w) => {
      let distToSite: number | undefined;
      let locationName: string | undefined;
      let closestDist = Infinity;
      for (const loc of locations) {
        const d = distanceMeters(w.latitude, w.longitude, loc.latitude, loc.longitude);
        if (d < closestDist) { closestDist = d; locationName = loc.name; }
      }
      if (Number.isFinite(closestDist)) distToSite = closestDist;
      const elapsed = differenceInMinutes(new Date(), new Date(w.clock_in));
      return { ...w, distToSite, locationName, elapsed };
    });
  }, [workers, locations]);

  const outsideGeofenceWorkers = useMemo(
    () => workersWithDistance.filter((w) => w.distToSite != null && w.distToSite > OFFSITE_THRESHOLD_M),
    [workersWithDistance],
  );

  // Buckets de problemas a partir de scheduledAssignments (asignados hoy/mañana, no fichados)
  const { lateAssignments, noShowAssignments, missingAssignments } = useMemo(() => {
    const now = new Date();
    const todayStr = new Date().toISOString().split("T")[0];
    const late: ScheduledAssignment[] = [];
    const noShow: ScheduledAssignment[] = [];
    const missing: ScheduledAssignment[] = [];
    for (const a of scheduledAssignments) {
      if (activeEmployeeIds.has(a.employee_id)) continue; // ya fichó
      if (!a.start_time) continue;
      // Solo evaluamos tarde/no-show si la fecha es hoy
      if (a.date !== todayStr) { missing.push(a); continue; }
      const start = new Date(`${a.date}T${a.start_time}`);
      const minutesLate = differenceInMinutes(now, start);
      if (minutesLate >= NO_SHOW_THRESHOLD_MIN) noShow.push(a);
      else if (minutesLate >= LATE_THRESHOLD_MIN) late.push(a);
      missing.push(a);
    }
    return { lateAssignments: late, noShowAssignments: noShow, missingAssignments: missing };
  }, [scheduledAssignments, activeEmployeeIds]);

  const endingSoonWorkers = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    return workersWithDistance.filter((w) => {
      const end = activeShiftEndByEmp.get(w.employee_id);
      if (!end) return false;
      const endDate = new Date(`${todayStr}T${end}`);
      const minutesToEnd = differenceInMinutes(endDate, now);
      return minutesToEnd >= 0 && minutesToEnd <= ENDING_SOON_WINDOW_MIN;
    });
  }, [workersWithDistance, activeShiftEndByEmp]);

  const totalClockedIn = workers.length + clockedNoGps.length;

  // ─── Búsqueda y filtro por bucket ───────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const matchQ = (s: string) => !q || s.toLowerCase().includes(q);

  const filteredWorkers = useMemo(() => {
    let list = workersWithDistance;
    if (bucket === "outside") list = outsideGeofenceWorkers;
    else if (bucket === "ending_soon") list = endingSoonWorkers;
    else if (bucket === "clocked_in") list = workersWithDistance;
    else if (bucket === "no_gps" || bucket === "late" || bucket === "no_show" || bucket === "missing") list = [];
    return list.filter((w) =>
      matchQ(w.employee_name) || matchQ(w.shift_title) || matchQ(w.client_name),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workersWithDistance, outsideGeofenceWorkers, endingSoonWorkers, bucket, q]);

  // ─── Guard ──────────────────────────────────────────────────────────────────
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-3 md:p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Mapa operativo en vivo"
        subtitle="Comando del día: fichajes reales, problemas priorizados y ubicación con consentimiento."
        icon={MapIcon}
      />

      {/* Date scope + Refresh */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-full border bg-card p-0.5 text-[11px]">
          <button
            onClick={() => setDateScope("today")}
            className={cn(
              "px-3 h-7 rounded-full font-semibold transition-colors",
              dateScope === "today" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Hoy
          </button>
          <button
            onClick={() => setDateScope("tomorrow")}
            className={cn(
              "px-3 h-7 rounded-full font-semibold transition-colors",
              dateScope === "tomorrow" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Mañana
          </button>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Actualizar
        </Button>
      </div>

      {/* KPIs (9 tarjetas) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
        <KpiCard icon={<Clock className="h-4 w-4" />} value={totalClockedIn} label="Fichados ahora" accent={totalClockedIn > 0 ? "primary" : undefined} />
        <KpiCard icon={<Signal className="h-4 w-4" />} value={workers.length} label="Con GPS" accent={workers.length > 0 ? "emerald" : undefined} />
        <KpiCard icon={<WifiOff className="h-4 w-4" />} value={clockedNoGps.length} label="Sin GPS" accent={clockedNoGps.length > 0 ? "amber" : undefined} />
        <KpiCard icon={<Timer className="h-4 w-4" />} value={lateAssignments.length} label="Tarde" accent={lateAssignments.length > 0 ? "amber" : undefined} />
        <KpiCard icon={<UserX className="h-4 w-4" />} value={noShowAssignments.length} label="No-show" accent={noShowAssignments.length > 0 ? "red" : undefined} />
        <KpiCard icon={<Users className="h-4 w-4" />} value={missingAssignments.length} label="Sin fichaje" accent={missingAssignments.length > 0 ? "amber" : undefined} />
        <KpiCard icon={<Navigation className="h-4 w-4" />} value={outsideGeofenceWorkers.length} label="Fuera de zona" accent={outsideGeofenceWorkers.length > 0 ? "red" : undefined} />
        <KpiPlaceholder icon={<CheckCircle2 className="h-4 w-4" />} label="Cierre pendiente" />
        <KpiPlaceholder icon={<ShieldAlert className="h-4 w-4" />} label="Revisión payroll" />
      </div>

      {/* Helper banner (compacto, ES) */}
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/30 border border-border/40 rounded-lg px-3 py-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
        <p>
          La ubicación se muestra solo cuando el trabajador comparte GPS al fichar. Payroll usa
          fichajes reales de <span className="font-medium text-foreground">time_entries</span>; el
          mapa es evidencia operativa, no fuente de cálculo.
        </p>
      </div>

      {/* Chip filter bar */}
      <ChipFilterBar
        bucket={bucket}
        setBucket={setBucket}
        counts={{
          all: totalClockedIn,
          clocked_in: workers.length,
          late: lateAssignments.length,
          no_show: noShowAssignments.length,
          missing: missingAssignments.length,
          outside: outsideGeofenceWorkers.length,
          ending_soon: endingSoonWorkers.length,
          no_gps: clockedNoGps.length,
        }}
      />

      {/* Layout principal: mobile issue-first / desktop split */}
      {isMobile ? (
        <MobileIssueFirstView
          loading={loading}
          mapOpen={mobileMapOpen}
          setMapOpen={setMobileMapOpen}
          workers={workersWithDistance}
          locations={locations}
          showLayer={showLayer}
          setShowLayer={setShowLayer}
          noGps={clockedNoGps}
          late={lateAssignments}
          noShow={noShowAssignments}
          outside={outsideGeofenceWorkers}
          missing={missingAssignments}
          endingSoon={endingSoonWorkers}
          alerts={alerts}
          bucket={bucket}
        />
      ) : (
        <DesktopMapView
          loading={loading}
          workers={workers}
          locations={locations}
          showLayer={showLayer}
          setShowLayer={setShowLayer}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredWorkers={filteredWorkers}
          noGps={clockedNoGps}
          late={lateAssignments}
          noShow={noShowAssignments}
          outside={outsideGeofenceWorkers}
          missing={missingAssignments}
          endingSoon={endingSoonWorkers}
          alerts={alerts}
          selectedWorkerId={selectedWorkerId}
          setSelectedWorkerId={setSelectedWorkerId}
          bucket={bucket}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip filter bar
// ─────────────────────────────────────────────────────────────────────────────
function ChipFilterBar({
  bucket, setBucket, counts,
}: {
  bucket: Bucket;
  setBucket: (b: Bucket) => void;
  counts: Record<Exclude<Bucket, "all"> | "all", number>;
}) {
  const order: Bucket[] = ["all", "clocked_in", "late", "no_show", "missing", "outside", "ending_soon", "no_gps"];
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {order.map((b) => {
        const active = bucket === b;
        const count = counts[b] ?? 0;
        const danger = (b === "no_show" || b === "outside") && count > 0;
        const warn = (b === "late" || b === "missing" || b === "ending_soon" || b === "no_gps") && count > 0;
        return (
          <button
            key={b}
            onClick={() => setBucket(b)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[11px] font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : danger
                ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                : warn
                ? "border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {BUCKET_LABEL[b]}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
              active ? "bg-primary-foreground/20" : "bg-muted",
            )}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop view — mapa + panel lateral priorizado
// ─────────────────────────────────────────────────────────────────────────────
interface DesktopProps {
  loading: boolean;
  workers: LiveMapWorker[];
  locations: LiveMapLocation[];
  showLayer: LiveMapLayer;
  setShowLayer: (l: LiveMapLayer) => void;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  filteredWorkers: (LiveMapWorker & { distToSite?: number; locationName?: string; elapsed: number })[];
  noGps: ClockedInNoGps[];
  late: ScheduledAssignment[];
  noShow: ScheduledAssignment[];
  outside: (LiveMapWorker & { distToSite?: number; locationName?: string; elapsed: number })[];
  missing: ScheduledAssignment[];
  endingSoon: (LiveMapWorker & { distToSite?: number; locationName?: string; elapsed: number })[];
  alerts: ClockAlert[];
  selectedWorkerId: string | null;
  setSelectedWorkerId: (id: string | null) => void;
  bucket: Bucket;
}

function DesktopMapView(props: DesktopProps) {
  const {
    loading, workers, locations, showLayer, setShowLayer,
    searchQuery, setSearchQuery, filteredWorkers,
    noGps, late, noShow, outside, missing, endingSoon, alerts,
    selectedWorkerId, setSelectedWorkerId, bucket,
  } = props;

  return (
    <div className="flex gap-4 h-[640px]">
      {/* Panel lateral priorizado (izquierda) */}
      <div className="w-[340px] shrink-0 hidden lg:flex flex-col border rounded-xl bg-card overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar trabajador, turno o cliente…"
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-3">
            {/* 1. No-show */}
            <IssueSection
              title="No-show"
              icon={<UserX className="h-3 w-3" />}
              tone="red"
              count={noShow.length}
              show={bucket === "all" || bucket === "no_show"}
              emptyLabel="Sin no-shows"
            >
              {noShow.map((a) => (
                <AssignmentRow key={`ns-${a.employee_id}-${a.start_time}`} a={a} tone="red" />
              ))}
            </IssueSection>

            {/* 2. Tarde */}
            <IssueSection
              title="Tarde"
              icon={<Timer className="h-3 w-3" />}
              tone="amber"
              count={late.length}
              show={bucket === "all" || bucket === "late"}
              emptyLabel="Nadie llega tarde"
            >
              {late.map((a) => (
                <AssignmentRow key={`la-${a.employee_id}-${a.start_time}`} a={a} tone="amber" />
              ))}
            </IssueSection>

            {/* 3. Fuera de zona */}
            <IssueSection
              title="Fuera de zona"
              icon={<Navigation className="h-3 w-3" />}
              tone="red"
              count={outside.length}
              show={bucket === "all" || bucket === "outside"}
              emptyLabel="Todos dentro de zona"
            >
              {outside.map((w) => (
                <WorkerRow
                  key={`os-${w.employee_id}`}
                  w={w}
                  tone="red"
                  open={selectedWorkerId === w.employee_id}
                  onToggle={() => setSelectedWorkerId(selectedWorkerId === w.employee_id ? null : w.employee_id)}
                />
              ))}
            </IssueSection>

            {/* 4. Sin fichaje (asignados al día y aún no fichados) */}
            <IssueSection
              title="Sin fichaje"
              icon={<Clock className="h-3 w-3" />}
              tone="amber"
              count={missing.length}
              show={bucket === "all" || bucket === "missing"}
              emptyLabel="Todos los asignados ya ficharon"
            >
              {missing.slice(0, 20).map((a) => (
                <AssignmentRow key={`mi-${a.employee_id}-${a.start_time}`} a={a} tone="muted" />
              ))}
              {missing.length > 20 && (
                <p className="text-[10px] text-muted-foreground px-2">+{missing.length - 20} más</p>
              )}
            </IssueSection>

            {/* 5. Termina pronto */}
            <IssueSection
              title="Termina pronto"
              icon={<Timer className="h-3 w-3" />}
              tone="amber"
              count={endingSoon.length}
              show={bucket === "all" || bucket === "ending_soon"}
              emptyLabel="Sin cierres inminentes"
            >
              {endingSoon.map((w) => (
                <WorkerRow
                  key={`es-${w.employee_id}`}
                  w={w}
                  tone="amber"
                  open={selectedWorkerId === w.employee_id}
                  onToggle={() => setSelectedWorkerId(selectedWorkerId === w.employee_id ? null : w.employee_id)}
                />
              ))}
            </IssueSection>

            {/* 6. Fichados normales (los que pasan el filtro de búsqueda y bucket) */}
            <IssueSection
              title={bucket === "all" || bucket === "clocked_in" ? "Fichados" : BUCKET_LABEL[bucket]}
              icon={<span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />}
              tone="emerald"
              count={filteredWorkers.length}
              show={bucket === "all" || bucket === "clocked_in"}
              emptyLabel="No hay trabajadores fichados con GPS"
            >
              {filteredWorkers.map((w) => (
                <WorkerRow
                  key={`cl-${w.employee_id}`}
                  w={w}
                  tone="emerald"
                  open={selectedWorkerId === w.employee_id}
                  onToggle={() => setSelectedWorkerId(selectedWorkerId === w.employee_id ? null : w.employee_id)}
                />
              ))}
            </IssueSection>

            {/* 7. Sin GPS */}
            <IssueSection
              title="Sin GPS"
              icon={<WifiOff className="h-3 w-3" />}
              tone="amber"
              count={noGps.length}
              show={bucket === "all" || bucket === "no_gps"}
              emptyLabel="Todos los fichados comparten GPS"
            >
              {noGps.map((w) => (
                <NoGpsRow key={`ng-${w.employee_id}`} w={w} />
              ))}
            </IssueSection>

            {/* Alertas */}
            {alerts.length > 0 && (bucket === "all") && (
              <IssueSection
                title="Alertas recientes"
                icon={<AlertTriangle className="h-3 w-3" />}
                tone="red"
                count={alerts.length}
                show
                emptyLabel=""
              >
                {alerts.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                    <Badge variant="outline" className="text-[9px] px-1.5">{a.severity}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium truncate">{a.employee_name}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{alertTypeLabel(a.type)}</p>
                    </div>
                  </div>
                ))}
              </IssueSection>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Mapa */}
      <div className="flex-1 rounded-xl border overflow-hidden relative">
        <MapBlock
          loading={loading}
          workers={workers}
          locations={locations}
          showLayer={showLayer}
          setShowLayer={setShowLayer}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile issue-first view
// ─────────────────────────────────────────────────────────────────────────────
interface MobileProps {
  loading: boolean;
  mapOpen: boolean;
  setMapOpen: (v: boolean) => void;
  workers: (LiveMapWorker & { distToSite?: number; locationName?: string; elapsed: number })[];
  locations: LiveMapLocation[];
  showLayer: LiveMapLayer;
  setShowLayer: (l: LiveMapLayer) => void;
  noGps: ClockedInNoGps[];
  late: ScheduledAssignment[];
  noShow: ScheduledAssignment[];
  outside: (LiveMapWorker & { distToSite?: number; locationName?: string; elapsed: number })[];
  missing: ScheduledAssignment[];
  endingSoon: (LiveMapWorker & { distToSite?: number; locationName?: string; elapsed: number })[];
  alerts: ClockAlert[];
  bucket: Bucket;
}

function MobileIssueFirstView(props: MobileProps) {
  const {
    loading, mapOpen, setMapOpen, workers, locations, showLayer, setShowLayer,
    noGps, late, noShow, outside, missing, endingSoon, alerts, bucket,
  } = props;

  const issuesTotal = noShow.length + late.length + outside.length + endingSoon.length;

  return (
    <div className="space-y-3">
      {/* CTA mapa */}
      <button
        onClick={() => setMapOpen(!mapOpen)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-primary" />
          <div className="text-left">
            <p className="text-[12px] font-semibold">{mapOpen ? "Ocultar mapa" : "Abrir mapa"}</p>
            <p className="text-[10px] text-muted-foreground">
              {workers.length} con GPS · {locations.length} ubicaciones
            </p>
          </div>
        </div>
        {mapOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {mapOpen && (
        <div className="h-[280px] rounded-xl border overflow-hidden relative">
          <MapBlock
            loading={loading}
            workers={workers}
            locations={locations}
            showLayer={showLayer}
            setShowLayer={setShowLayer}
            compact
          />
        </div>
      )}

      {/* Hero issue card */}
      {issuesTotal === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Sin problemas operativos"
          description="Todos los fichajes en orden por ahora."
          compact
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MobileIssueChip label="No-show" count={noShow.length} tone="red" />
          <MobileIssueChip label="Tarde" count={late.length} tone="amber" />
          <MobileIssueChip label="Fuera de zona" count={outside.length} tone="red" />
          <MobileIssueChip label="Termina pronto" count={endingSoon.length} tone="amber" />
        </div>
      )}

      {/* Listas priorizadas */}
      <MobileSection title="No-show" tone="red" count={noShow.length} show={bucket === "all" || bucket === "no_show"} emptyLabel="Sin no-shows">
        {noShow.map((a) => <AssignmentRow key={`mns-${a.employee_id}-${a.start_time}`} a={a} tone="red" />)}
      </MobileSection>
      <MobileSection title="Tarde" tone="amber" count={late.length} show={bucket === "all" || bucket === "late"} emptyLabel="Nadie llega tarde">
        {late.map((a) => <AssignmentRow key={`mla-${a.employee_id}-${a.start_time}`} a={a} tone="amber" />)}
      </MobileSection>
      <MobileSection title="Fuera de zona" tone="red" count={outside.length} show={bucket === "all" || bucket === "outside"} emptyLabel="Todos dentro de zona">
        {outside.map((w) => <WorkerRow key={`mos-${w.employee_id}`} w={w} tone="red" open={false} onToggle={() => {}} />)}
      </MobileSection>
      <MobileSection title="Termina pronto" tone="amber" count={endingSoon.length} show={bucket === "all" || bucket === "ending_soon"} emptyLabel="Sin cierres inminentes">
        {endingSoon.map((w) => <WorkerRow key={`mes-${w.employee_id}`} w={w} tone="amber" open={false} onToggle={() => {}} />)}
      </MobileSection>
      <MobileSection title="Sin fichaje" tone="muted" count={missing.length} show={bucket === "all" || bucket === "missing"} emptyLabel="Todos los asignados ya ficharon">
        {missing.slice(0, 20).map((a) => <AssignmentRow key={`mmi-${a.employee_id}-${a.start_time}`} a={a} tone="muted" />)}
        {missing.length > 20 && <p className="text-[10px] text-muted-foreground px-2">+{missing.length - 20} más</p>}
      </MobileSection>
      <MobileSection title="Fichados" tone="emerald" count={workers.length} show={bucket === "all" || bucket === "clocked_in"} emptyLabel="No hay trabajadores fichados con GPS">
        {workers.map((w) => <WorkerRow key={`mcl-${w.employee_id}`} w={w} tone="emerald" open={false} onToggle={() => {}} />)}
      </MobileSection>
      <MobileSection title="Sin GPS" tone="amber" count={noGps.length} show={bucket === "all" || bucket === "no_gps"} emptyLabel="Todos comparten GPS">
        {noGps.map((w) => <NoGpsRow key={`mng-${w.employee_id}`} w={w} />)}
      </MobileSection>

      {alerts.length > 0 && bucket === "all" && (
        <MobileSection title="Alertas recientes" tone="red" count={alerts.length} show emptyLabel="">
          {alerts.slice(0, 5).map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-card border">
              <Badge variant="outline" className="text-[9px] px-1.5">{a.severity}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">{a.employee_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{alertTypeLabel(a.type)}</p>
              </div>
            </div>
          ))}
        </MobileSection>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloque de mapa reusable
// ─────────────────────────────────────────────────────────────────────────────
function MapBlock({
  loading, workers, locations, showLayer, setShowLayer, compact,
}: {
  loading: boolean;
  workers: LiveMapWorker[];
  locations: LiveMapLocation[];
  showLayer: LiveMapLayer;
  setShowLayer: (l: LiveMapLayer) => void;
  compact?: boolean;
}) {
  if (loading && workers.length === 0 && locations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/20">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }
  if (workers.length === 0 && locations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/10">
        <EmptyState
          icon={MapPin}
          title="Sin datos en el mapa"
          description="No hay trabajadores con GPS activo ni ubicaciones de turno con coordenadas."
          compact
        />
      </div>
    );
  }
  return (
    <>
      <LiveOperationsMap workers={workers} locations={locations} showLayer={showLayer} />
      {!compact && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <div className="inline-flex rounded-full border bg-background/90 backdrop-blur p-0.5 text-[11px]">
            {(["all", "workers", "locations"] as LiveMapLayer[]).map((l) => (
              <button
                key={l}
                onClick={() => setShowLayer(l)}
                className={cn(
                  "px-2.5 h-6 rounded-full font-semibold transition-colors",
                  showLayer === l ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {l === "all" ? "Todo" : l === "workers" ? "Trabajadores" : "Ubicaciones"}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filas y secciones
// ─────────────────────────────────────────────────────────────────────────────
type Tone = "emerald" | "amber" | "red" | "muted";

const toneClasses: Record<Tone, { ring: string; chip: string; dot: string; text: string }> = {
  emerald: { ring: "ring-emerald-500/20", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  amber:   { ring: "ring-amber-500/20",   chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400",     dot: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400" },
  red:     { ring: "ring-destructive/20", chip: "bg-destructive/10 text-destructive",                       dot: "bg-destructive", text: "text-destructive" },
  muted:   { ring: "ring-border",         chip: "bg-muted text-muted-foreground",                           dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

function IssueSection({
  title, icon, tone, count, show, emptyLabel, children,
}: {
  title: string;
  icon: React.ReactNode;
  tone: Tone;
  count: number;
  show: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  if (!show) return null;
  const t = toneClasses[tone];
  return (
    <section>
      <p className={cn("px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5", t.text)}>
        {icon}
        <span>{title}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ml-auto", t.chip)}>{count}</span>
      </p>
      {count === 0 ? (
        emptyLabel ? <p className="text-[10px] text-muted-foreground/70 px-2 py-2">{emptyLabel}</p> : null
      ) : (
        <div className="space-y-0.5">{children}</div>
      )}
    </section>
  );
}

function MobileSection({
  title, tone, count, show, emptyLabel, children,
}: {
  title: string;
  tone: Tone;
  count: number;
  show: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  if (!show) return null;
  if (count === 0 && !emptyLabel) return null;
  const t = toneClasses[tone];
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className={cn("px-3 py-2 flex items-center gap-2 border-b", t.chip)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
        <span className="text-[11px] font-bold uppercase tracking-wider">{title}</span>
        <span className="ml-auto text-[10px] font-bold tabular-nums">{count}</span>
      </div>
      <div className="p-2 space-y-1">
        {count === 0 ? (
          <p className="text-[11px] text-muted-foreground/70 px-1 py-1.5">{emptyLabel}</p>
        ) : children}
      </div>
    </section>
  );
}

function MobileIssueChip({ label, count, tone }: { label: string; count: number; tone: Tone }) {
  const t = toneClasses[tone];
  return (
    <div className={cn("rounded-xl border px-3 py-2 flex items-center gap-2", count > 0 ? t.chip : "bg-card text-muted-foreground")}>
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-lg font-bold tabular-nums">{count}</p>
      </div>
    </div>
  );
}

function WorkerRow({
  w, tone, open, onToggle,
}: {
  w: LiveMapWorker & { distToSite?: number; locationName?: string; elapsed: number };
  tone: Tone;
  open: boolean;
  onToggle: () => void;
}) {
  const t = toneClasses[tone];
  const initials = (w.employee_name || "?").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const onSite = w.distToSite != null && w.distToSite <= OFFSITE_THRESHOLD_M;
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full text-left px-2.5 py-2 rounded-lg transition-colors",
        open ? "bg-muted/40" : "hover:bg-muted/20",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold", t.chip)}>
            {initials}
          </div>
          <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card", t.dot)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold truncate">{w.employee_name}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {w.shift_title}{w.client_name ? ` · ${w.client_name}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-mono text-muted-foreground">
            {Math.floor(w.elapsed / 60)}h{String(w.elapsed % 60).padStart(2, "0")}m
          </p>
          {w.distToSite != null && (
            <p className={cn("text-[9px] font-bold", onSite ? toneClasses.emerald.text : toneClasses.red.text)}>
              {onSite ? "En sitio" : `${Math.round(w.distToSite)}m fuera`}
            </p>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t border-border/30 grid grid-cols-1 gap-1">
          {w.locationName && (
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3" /> {w.locationName}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" /> Entrada: {format(new Date(w.clock_in), "hh:mm a")}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Wifi className="h-3 w-3" /> GPS: ±{Math.round(w.accuracy)}m
          </span>
          {w.phone && (
            <a
              href={`tel:${w.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-[10px] text-primary hover:underline"
            >
              <Phone className="h-3 w-3" /> {w.phone}
            </a>
          )}
        </div>
      )}
    </button>
  );
}

function AssignmentRow({ a, tone }: { a: ScheduledAssignment; tone: Tone }) {
  const t = toneClasses[tone];
  const initials = (a.employee_name || "?").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/20">
      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", t.chip)}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold truncate">{a.employee_name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {a.shift_title || "Turno"}{a.location_name ? ` · ${a.location_name}` : ""} · {(a.start_time || "").slice(0, 5)}
        </p>
      </div>
      {a.phone && (
        <a
          href={`tel:${a.phone}`}
          className="text-primary hover:underline shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function NoGpsRow({ w }: { w: ClockedInNoGps }) {
  const t = toneClasses.amber;
  const initials = (w.employee_name || "?").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/20">
      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", t.chip)}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold truncate">{w.employee_name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {w.shift_title}{w.client_name ? ` · ${w.client_name}` : ""} · {format(new Date(w.clock_in), "hh:mm a")}
        </p>
      </div>
      {w.phone && (
        <a href={`tel:${w.phone}`} className="text-primary hover:underline shrink-0">
          <Phone className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI tarjetas
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({
  icon, value, label, accent,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  accent?: "emerald" | "amber" | "red" | "primary";
}) {
  const accentClass =
    accent === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : accent === "amber" ? "text-amber-600 dark:text-amber-400"
    : accent === "red" ? "text-destructive"
    : accent === "primary" ? "text-primary"
    : "";
  return (
    <Card className="border-border/40 rounded-xl">
      <CardContent className="pt-3 pb-2 px-3 flex items-center gap-2.5 min-w-0">
        <div className={cn("h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0", accentClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className={cn("text-xl font-bold tabular-nums leading-none", accentClass)}>{value}</p>
          <p className="text-[10px] text-muted-foreground truncate mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiPlaceholder({ icon, label }: { icon: React.ReactNode; label: string }) {
  // Placeholder seguro: no inventa datos. Espera Fase 6 para conectar
  // shift_closeout_reports y payroll review queue.
  return (
    <Card className="border-dashed border-border/40 rounded-xl">
      <CardContent className="pt-3 pb-2 px-3 flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0 text-muted-foreground/60">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold tabular-nums leading-none text-muted-foreground/60">—</p>
          <p className="text-[10px] text-muted-foreground/70 truncate mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function alertTypeLabel(t: string): string {
  switch (t) {
    case "OUTSIDE_GEOFENCE":   return "Fuera de zona";
    case "DEVICE_DUPLICATION": return "Dispositivo duplicado";
    case "GPS_LOW_ACCURACY":   return "GPS baja precisión";
    case "SUSPICIOUS_MOVEMENT":return "Movimiento sospechoso";
    default: return t;
  }
}
