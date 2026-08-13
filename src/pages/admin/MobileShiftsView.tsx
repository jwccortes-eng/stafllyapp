import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays, SlidersHorizontal, ChevronRight,
  Users, AlertTriangle, Plus,
} from "lucide-react";
import { ShiftRouteHeader, type ShiftRouteHeaderTone } from "@/components/stafly-ui";
import { format, parseISO, isToday, isTomorrow, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useShiftsConfig } from "@/hooks/useShiftsConfig";
import { Button } from "@/components/ui/button";
import {
  OperationalWorkspace,
  WorkspaceSearch,
  WorkspaceTabs,
  type WorkspaceMetric,
  type WorkspaceTabItem,
} from "@/components/stafly-ui/OperationalWorkspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { ShiftFilters, EMPTY_FILTERS, type ShiftFilterState } from "@/components/shifts/ShiftFilters";
// S3: lazy-load the 2k-line operations sheet so it doesn't ship in the
// initial Mobile Shifts bundle. Same component, same props, same behavior.
const MobileShiftOperationsSheet = lazy(() =>
  import("@/components/shifts/mobile/MobileShiftOperationsSheet").then(m => ({
    default: m.MobileShiftOperationsSheet,
  }))
);
import { MobileQuickCreateShiftSheet } from "@/components/shifts/mobile/MobileQuickCreateShiftSheet";
import { MobileShiftEditSheet } from "@/components/shifts/mobile/MobileShiftEditSheet";
import { BulkServiceCreationDialog } from "@/components/shifts/bulk/BulkServiceCreationDialog";

import { isDraftShift, isPublishedShift } from "@/lib/shifts/shift-guards";
import { buildShiftPeopleIndex, shiftMatchesPersonQuery, normalizeSearchText } from "@/lib/shifts/shift-people-search";
import { displayShiftRef } from "@/lib/shifts/shift-ref";
import { clientAccentColor } from "@/lib/clients/client-accent";
import type { Shift, Assignment, Employee, SelectOption } from "@/components/shifts/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ADMIN_LEX } from "@/lib/ox/lexicon";
import { useQueryClient } from "@tanstack/react-query";
import { readServiceRow, subscribeToServiceChanges, writeServiceRow } from "@/lib/shifts/service-state";

/**
 * MobileShiftsView — Phase 1
 * Self-contained, frontend-only. Read-only mutations on mobile (canEdit=false
 * forwarded to ShiftDetailDialog). Reuses existing ShiftFilters, ShiftDetailDialog
 * and shift-guards. Multi-tenant scoped by selectedCompanyId.
 */

type TabKey = "today" | "upcoming" | "needs" | "requests";

const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "upcoming", label: "Próximos" },
];

const SECONDARY_TABS: { key: TabKey; label: string }[] = [
  { key: "needs", label: "Necesitan gente" },
  { key: "requests", label: "Solicitudes" },
];

interface PendingRequest {
  id: string;
  shift_id: string;
  employee_id: string;
  created_at: string;
  message: string | null;
  employee_name: string;
  shift_title: string | null;
  shift_date: string | null;
  shift_start: string | null;
  shift_end: string | null;
}

function calcShiftHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function formatTimeShort(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

function dateGroupLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Hoy";
    if (isTomorrow(d)) return "Mañana";
    return format(d, "EEE d MMM", { locale: es });
  } catch {
    return dateStr;
  }
}

export default function MobileShiftsView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, hasModuleAccess, user } = useAuth();
  const { can } = usePermissions();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const { config: shiftsConfig } = useShiftsConfig();

  // Permissions — same rule as desktop Shifts
  const canEdit = can("service.edit");
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);

  // Tab from URL (?tab=today) so back/forward works; fallback to "today"
  const initialTab = (searchParams.get("tab") as TabKey) || "today";
  const [tab, setTab] = useState<TabKey>(
    [...TABS, ...SECONDARY_TABS].some(t => t.key === initialTab) ? initialTab : "today"
  );

  const [shifts, setShifts] = useState<Shift[]>([]);
  useServiceRootRefs(shifts);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [clients, setClients] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ShiftFilterState>(EMPTY_FILTERS);

  const [detailShift, setDetailShift] = useState<Shift | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [detailManageTeam, setDetailManageTeam] = useState(false);
  // Tracks whether we've already attempted to consume a deep-link intent
  // for the current shifts payload (avoids reopening on every refresh).
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);

  // Load shifts: yesterday for "Today" buffer + 60 days forward for Upcoming
  const dateRange = useMemo(() => {
    const start = format(addDays(new Date(), -1), "yyyy-MM-dd");
    const end = format(addDays(new Date(), 60), "yyyy-MM-dd");
    return { start, end };
  }, []);

  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

  /**
   * P0.1 — nunca renderizamos el snapshot congelado que se capturó al tocar la
   * tarjeta. Resolvemos siempre la versión viva: cache canónica > lista > snapshot.
   */
  const resolveLive = (snapshot: Shift | null): Shift | null => {
    if (!snapshot?.id) return snapshot;
    const fromList = shifts.find((s) => s.id === snapshot.id) ?? null;
    const canonical = readServiceRow(queryClient, selectedCompanyId, snapshot.id);
    return { ...snapshot, ...(fromList ?? {}), ...(canonical ?? {}) } as Shift;
  };
  const detailShiftLive = resolveLive(detailShift);
  const editShiftLive = resolveLive(editShift);

  useEffect(() => {
    if (!selectedCompanyId) {
      setShifts([]); setAssignments([]); setClients([]); setLocations([]); setEmployees([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const [shiftsRes, clientsRes, locsRes, empsRes] = await Promise.all([
         supabase.from("scheduled_shifts")
           .select("*")
            .eq("company_id", selectedCompanyId!)
            .is("deleted_at", null)
            .gte("date", dateRange.start)
            .lte("date", dateRange.end)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true }),
          supabase.from("clients").select("id,name").eq("company_id", selectedCompanyId!).is("deleted_at", null).order("name"),
          supabase.from("locations").select("id,name").eq("company_id", selectedCompanyId!).is("deleted_at", null).order("name"),
          supabase.from("employees")
            .select("id,first_name,last_name,avatar_url,phone_number,email,employer_identification,is_active,user_id,profile_status,onboarding_status")
            .eq("company_id", selectedCompanyId!)
            .eq("is_active", true)
            .order("first_name"),
        ]);

        if (!alive) return;
        if (shiftsRes.error) throw shiftsRes.error;

        const shiftRows = (shiftsRes.data ?? []) as Shift[];
        const shiftIds = shiftRows.map(s => s.id);
        let asgnRows: Assignment[] = [];
        if (shiftIds.length > 0) {
          const asgnRes = await supabase.from("shift_assignments")
            .select("id,shift_id,employee_id,status,role_slot_id")
            .eq("company_id", selectedCompanyId!)
            .in("shift_id", shiftIds);
          if (asgnRes.error) throw asgnRes.error;
          asgnRows = (asgnRes.data ?? []) as Assignment[];
        }

        if (!alive) return;
        setShifts(shiftRows);
        setAssignments(asgnRows);
        setClients((clientsRes.data ?? []) as SelectOption[]);
        setLocations((locsRes.data ?? []) as SelectOption[]);
        setEmployees((empsRes.data ?? []) as Employee[]);

        // Load pending shift requests (best-effort; tolerate schema absence)
        try {
          const reqRes = await supabase
            .from("shift_requests")
            .select("id, shift_id, employee_id, status, message, created_at, employees!inner(first_name,last_name), scheduled_shifts!inner(title,date,start_time,end_time)")
            .eq("company_id", selectedCompanyId!)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(50);
          if (alive && !reqRes.error) {
            const rows = (reqRes.data ?? []) as any[];
            setPendingRequests(rows.map(r => ({
              id: r.id,
              shift_id: r.shift_id,
              employee_id: r.employee_id,
              created_at: r.created_at,
              message: r.message,
              employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim() || "Worker",
              shift_title: r.scheduled_shifts?.title ?? null,
              shift_date: r.scheduled_shifts?.date ?? null,
              shift_start: r.scheduled_shifts?.start_time ?? null,
              shift_end: r.scheduled_shifts?.end_time ?? null,
            })));
          }
        } catch { /* ignore — requests is optional */ }
      } catch (e: any) {
        if (!alive) return;
        console.error("[MobileShiftsView] load error", e);
        setError(e?.message ?? "Failed to load shifts");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [selectedCompanyId, dateRange.start, dateRange.end, reloadKey]);

  // P0.1 — la lista es una vista derivada: cuando el servicio canónico cambia
  // en cualquier otra superficie, recargamos en lugar de conservar snapshots.
  useEffect(() => {
    return subscribeToServiceChanges(({ companyId }) => {
      if (companyId === selectedCompanyId) setReloadKey((k) => k + 1);
    });
  }, [selectedCompanyId]);

  // Semilla: las filas de la lista alimentan la cache canónica (con guardia de versión).
  useEffect(() => {
    if (!selectedCompanyId) return;
    shifts.forEach((s) => writeServiceRow(queryClient, selectedCompanyId, s as any));
  }, [shifts, selectedCompanyId, queryClient]);

  // Honor ?create=1 (TopBar quick action, deep links, etc.) on mobile too.
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Persist tab in URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Deep-link: open a specific shift's operations sheet via
  // ?shift=<id> (preferred) or legacy #shift-<id>. Optional ?manageTeam=1
  // immediately opens the Manage Team hub. Consumed once per load to avoid
  // reopening on filter/tab changes; URL is cleaned after consumption.
  useEffect(() => {
    if (loading || deepLinkConsumed) return;

    const queryShiftId = searchParams.get("shift");
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hashShiftId = hash.startsWith("#shift-") ? hash.slice("#shift-".length) : null;
    const targetId = queryShiftId || hashShiftId;
    if (!targetId) return;

    const wantManageTeam = searchParams.get("manageTeam") === "1"
      || searchParams.get("openTeamHub") === "1";

    const target = shifts.find(s => s.id === targetId);
    if (target) {
      setDetailShift(target);
      setDetailManageTeam(wantManageTeam);
      setDetailOpen(true);
    } else {
      toast("No encontramos ese turno en esta vista.", {
        description: "Cambia de pestaña o quita los filtros activos.",
      });
    }

    // Clean intent params + hash so refresh doesn't reopen the sheet.
    const next = new URLSearchParams(searchParams);
    next.delete("shift");
    next.delete("manageTeam");
    next.delete("openTeamHub");
    setSearchParams(next, { replace: true });
    if (hashShiftId && typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setDeepLinkConsumed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, shifts]);

  // ── Apply tab + filters
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const assignmentsByShift = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!m.has(a.shift_id)) m.set(a.shift_id, []);
      m.get(a.shift_id)!.push(a);
    }
    return m;
  }, [assignments]);

  const clientById = useMemo(() => new Map(clients.map(c => [c.id, c.name])), [clients]);
  const locationById = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations]);
  const employeeById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  // Mismo índice de personas que el escritorio: buscar por nombre, teléfono o
  // identificación devuelve los servicios de esa persona.
  // Ver src/lib/shifts/shift-people-search.ts
  const peopleIndex = useMemo(
    () =>
      buildShiftPeopleIndex(
        [...assignmentsByShift.entries()].flatMap(([shiftId, list]) =>
          list.map((a: any) => ({ shift_id: shiftId, employee_id: a.employee_id, status: a.status })),
        ),
        employees as any,
      ),
    [assignmentsByShift, employees],
  );

  // Counts per tab (computed from fully-filtered-by-search dataset minus tab filter)
  const baseFiltered = useMemo(() => {
    const search = normalizeSearchText(filters.search);
    return shifts.filter(s => {
      if (filters.clientId && s.client_id !== filters.clientId) return false;
      if (filters.locationId && s.location_id !== filters.locationId) return false;
      if (filters.publishStatus === "draft" && !isDraftShift(s)) return false;
      if (filters.publishStatus === "published" && !isPublishedShift(s)) return false;
      if (filters.claimableOnly && !s.claimable) return false;
      const asgns = assignmentsByShift.get(s.id) ?? [];
      const confirmed = asgns.filter(a => a.status === "confirmed").length;
      if (filters.assignedStatus === "unassigned" && confirmed > 0) return false;
      if (filters.assignedStatus === "assigned" && confirmed === 0) return false;
      if (search) {
        const clientName = (s.client_id ? clientById.get(s.client_id) : "") ?? "";
        const locName = (s.location_id ? locationById.get(s.location_id) : "") ?? "";
        const hay = normalizeSearchText(
          `${s.title} ${clientName} ${locName} ${s.shift_code ?? ""} ${s.shift_ref ?? ""}`,
        );
        if (!hay.includes(search) && !shiftMatchesPersonQuery(peopleIndex, s.id, filters.search)) return false;
      }
      return true;
    });
  }, [shifts, filters, assignmentsByShift, clientById, locationById, peopleIndex]);

  const tabCounts = useMemo(() => {
    const counts = { today: 0, upcoming: 0, needs: 0, requests: pendingRequests.length };
    for (const s of baseFiltered) {
      const asgns = assignmentsByShift.get(s.id) ?? [];
      const staffed = asgns.filter(a => a.status !== "rejected" && a.status !== "removed").length;
      const slots = s.slots ?? 0;
      const understaffed = slots > 0 && staffed < slots;

      if (s.date === todayStr) counts.today++;
      if (s.date > todayStr) counts.upcoming++;
      if (s.date >= todayStr && understaffed) counts.needs++;
    }
    return counts;
  }, [baseFiltered, assignmentsByShift, todayStr, pendingRequests.length]);

  const visibleShifts = useMemo(() => {
    if (tab === "requests") return [];
    return baseFiltered.filter(s => {
      const asgns = assignmentsByShift.get(s.id) ?? [];
      const staffed = asgns.filter(a => a.status !== "rejected" && a.status !== "removed").length;
      const slots = s.slots ?? 0;
      const understaffed = slots > 0 && staffed < slots;

      switch (tab) {
        case "today": return s.date === todayStr;
        case "upcoming": return s.date > todayStr;
        case "needs": return s.date >= todayStr && understaffed;
        default: return false;
      }
    });
  }, [baseFiltered, tab, assignmentsByShift, todayStr]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of visibleShifts) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({
        date,
        label: dateGroupLabel(date),
        shifts: list.sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }));
  }, [visibleShifts]);

  // Summary strip
  const summary = useMemo(() => {
    const totalShifts = visibleShifts.length;
    let totalHours = 0;
    let totalSlots = 0;
    let totalConfirmed = 0;
    const workerSet = new Set<string>();
    for (const s of visibleShifts) {
      totalHours += calcShiftHours(s.start_time, s.end_time) * (s.slots ?? 1);
      totalSlots += s.slots ?? 0;
      const asgns = assignmentsByShift.get(s.id) ?? [];
      for (const a of asgns) {
        // Coverage = scheduled workers (any non-rejected, non-removed assignment).
        // Matches desktop semantics. Do NOT filter to "confirmed" — that under-counts.
        if (a.status !== "rejected" && a.status !== "removed") {
          totalConfirmed++;
          workerSet.add(a.employee_id);
        }
      }
    }
    const coverage = totalSlots > 0 ? Math.round((totalConfirmed / totalSlots) * 100) : 0;
    return {
      shifts: totalShifts,
      hours: Math.round(totalHours),
      workers: workerSet.size,
      coverage,
    };
  }, [visibleShifts, assignmentsByShift]);

  const activeFiltersCount = useMemo(() => {
    return [
      filters.search, filters.clientId, filters.locationId,
      filters.assignedStatus, filters.publishStatus,
      filters.claimableOnly ? "1" : "",
    ].filter(Boolean).length;
  }, [filters]);

  const handleOpenDetail = (shift: Shift) => {
    setDetailShift(shift);
    setDetailOpen(true);
  };

  const handleOpenRequests = () => navigate("/app/shift-requests");

  const tabItems = useMemo(() => {
    const items: WorkspaceTabItem<TabKey>[] = TABS.map((t) => ({ key: t.key, label: t.label, count: tabCounts[t.key] }));
    for (const t of SECONDARY_TABS) {
      const count = tabCounts[t.key];
      if (count > 0 || tab === t.key) {
        items.push({
          key: t.key,
          label: t.label,
          count,
          ...(t.key === "needs" && count > 0 ? { tone: "warning" as const } : {}),
        });
      }
    }
    return items;
  }, [tabCounts, tab]);

  const workspaceMetrics: WorkspaceMetric[] = (!loading && !error && tab !== "requests" && summary.shifts > 0)
    ? [
        { label: ADMIN_LEX.entityPlural, value: summary.shifts, tone: "primary" as const },
        { label: summary.workers === 1 ? "persona" : "personas", value: summary.workers },
        {
          label: "cobertura",
          value: `${summary.coverage}%`,
          tone: summary.coverage >= 90 ? ("success" as const) : summary.coverage >= 60 ? ("warning" as const) : ("critical" as const),
        },
      ]
    : [];

  return (
    <OperationalWorkspace
      title={ADMIN_LEX.EntityPlural}
      className="min-h-full"
      metrics={workspaceMetrics}
      search={
        <WorkspaceSearch
          value={filters.search ?? ""}
          onChange={(v) => setFilters({ ...filters, search: v })}
          placeholder={`Buscar ${ADMIN_LEX.entity.toLowerCase()}, cliente o referencia…`}
        />
      }
      tabs={<WorkspaceTabs<TabKey> items={tabItems} value={tab} onChange={setTab} ariaLabel={ADMIN_LEX.EntityPlural} />}
      filtersActiveCount={activeFiltersCount}
      filters={
        <div className="space-y-4">
          <ShiftFilters
            filters={filters}
            onChange={setFilters}
            clients={clients}
            locations={locations}
            allowClaims={true}
          />
          <Button variant="ghost" className="w-full h-11" onClick={() => setFilters(EMPTY_FILTERS)}>
            Limpiar filtros
          </Button>
        </div>
      }
      action={
        <>
          {canEdit && (
            <Button
              size="sm"
              className="h-9 px-3 rounded-xl gap-1.5 font-semibold"
              onClick={() => setCreateOpen(true)}
              aria-label={ADMIN_LEX.create}
            >
              <Plus className="h-4 w-4" />
              {ADMIN_LEX.create}
            </Button>
          )}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground" aria-label="Más opciones">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setBulkCreateOpen(true)}>
                  <CalendarDays className="h-4 w-4 mr-2" /> Crear varios servicios
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenRequests}>
                  <Users className="h-4 w-4 mr-2" /> Solicitudes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      }
    >
      {/* List */}
      <div>
        {tab === "requests" ? (
          pendingRequests.length === 0 ? (
            <EmptyState tab="requests" />
          ) : (
            <div className="space-y-2.5">
              <div className="text-xs text-muted-foreground px-1 mb-1">
                {pendingRequests.length} solicitud{pendingRequests.length === 1 ? "" : "es"} pendiente{pendingRequests.length === 1 ? "" : "s"}
              </div>
              {pendingRequests.map(req => (
                <RequestRow
                  key={req.id}
                  req={req}
                  onOpen={() => {
                    const s = shifts.find(x => x.id === req.shift_id);
                    if (s) handleOpenDetail(s);
                  }}
                />
              ))}
              <Button
                variant="outline"
                className="w-full h-11 mt-2"
                onClick={handleOpenRequests}
              >
                Gestionar solicitudes
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )
        ) : loading ? (
          <SkeletonList />
        ) : error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : grouped.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="space-y-5">
            {grouped.map(group => (
              <div key={group.date}>
                <div className="flex items-baseline gap-2 mb-2.5 px-1">
                  <span className="text-sm font-semibold text-foreground">
                    {group.label}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {group.shifts.map(shift => {
                    const asgns = assignmentsByShift.get(shift.id) ?? [];
                    const staffed = asgns.filter(a => a.status !== "rejected" && a.status !== "removed");
                    const assignedEmployees = staffed
                      .map(a => employeeById.get(a.employee_id))
                      .filter(Boolean) as Employee[];
                    const slots = shift.slots ?? 0;
                    const coverage = slots > 0 ? Math.round((staffed.length / slots) * 100) : 0;
                    const isDraft = isDraftShift(shift);
                    const understaffed = slots > 0 && staffed.length < slots;
                    const noClient = !shift.client_id;

                    return (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        clientName={shift.client_id ? clientById.get(shift.client_id) ?? "—" : "No client"}
                        locationName={shift.location_id ? locationById.get(shift.location_id) ?? "" : ""}
                        assignedEmployees={assignedEmployees}
                        slots={slots}
                        coverage={coverage}
                        isDraft={isDraft}
                        understaffed={understaffed}
                        noClient={noClient}
                        onOpen={() => handleOpenDetail(shift)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Operations Snapshot — mobile-first sheet (read-only Phase 1.5).
          S3: wrapped in Suspense for lazy import; fallback only shows while
          the chunk is in flight on first open. */}
      {detailOpen && (
        <Suspense fallback={null}>
          <MobileShiftOperationsSheet
            shift={detailShiftLive}
            open={detailOpen}
            onOpenChange={(o) => {
              setDetailOpen(o);
              if (!o) setDetailManageTeam(false);
            }}
            assignments={assignments}
            employees={employees}
            clientName={detailShiftLive?.client_id ? clientById.get(detailShiftLive.client_id) ?? "—" : "—"}
            locationName={detailShiftLive?.location_id ? locationById.get(detailShiftLive.location_id) ?? "" : ""}
            initialOpenTeamHub={detailManageTeam}
            onEdit={canEdit ? (s) => { setEditShift(s); setEditOpen(true); } : undefined}
          />
        </Suspense>
      )}

      {/* Edit existing shift — UPDATE only, keeps id/tenant/assignments intact */}
      <MobileShiftEditSheet
        shift={editShiftLive}
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditShift(null); }}
        companyId={selectedCompanyId}
        clients={clients}
        locations={locations}
        employees={employees}
        assignments={assignments}

        onSaved={(patch) => {
          // `patch` ya viene reconciliado con la fila real del backend.
          setShifts((prev) => prev.map((s) => (editShift && s.id === editShift.id ? { ...s, ...patch } as Shift : s)));
          setDetailShift((prev) => (editShift && prev?.id === editShift.id ? { ...prev, ...patch } as Shift : prev));
          setReloadKey((k) => k + 1);
        }}
      />


      {/* Creación masiva — mismo motor canónico, tarjetas en móvil */}
      <BulkServiceCreationDialog
        open={bulkCreateOpen}
        onOpenChange={setBulkCreateOpen}
        companyId={selectedCompanyId}
        userId={user?.id ?? null}
        clients={clients}
        locations={locations}
        referenceDate={format(new Date(), "yyyy-MM-dd")}
        onCreated={() => setReloadKey((k) => k + 1)}
      />

      {/* Mobile Quick Create — writes to scheduled_shifts via same RLS as desktop */}
      <MobileQuickCreateShiftSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={selectedCompanyId}
        clients={clients}
        locations={locations}
        employees={employees}
        shifts={shifts}
        assignments={assignments}
        requireClient={Boolean(shiftsConfig?.require_client)}
        requireLocation={Boolean(shiftsConfig?.require_location)}
        defaultStartTime={shiftsConfig?.default_start_time ?? "09:00"}
        defaultEndTime={shiftsConfig?.default_end_time ?? "17:00"}
        defaultSlots={shiftsConfig?.default_slots ?? 1}
        onCreated={(_shiftId, shiftDate) => {
          setReloadKey(k => k + 1);
          setTab(shiftDate === todayStr ? "today" : "upcoming");
        }}
      />
    </OperationalWorkspace>
  );
}

/* ───────────── Subcomponents ───────────── */

interface ShiftCardProps {
  shift: Shift;
  clientName: string;
  locationName: string;
  assignedEmployees: Employee[];
  slots: number;
  coverage: number;
  isDraft: boolean;
  understaffed: boolean;
  noClient: boolean;
  onOpen: () => void;
}

function ShiftCard({
  shift, clientName, locationName, assignedEmployees, slots, coverage,
  isDraft, understaffed, noClient, onOpen,
}: ShiftCardProps) {
  const visibleNames = assignedEmployees.slice(0, 2).map(e => `${e.first_name} ${e.last_name?.[0] ?? ""}.`);
  const more = Math.max(0, assignedEmployees.length - 2);
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  // Status chip mapped to ShiftRouteHeader tone
  let statusLabel: string | null = null;
  let statusTone: ShiftRouteHeaderTone = "neutral";
  if (isDraft) { statusLabel = "Borrador"; statusTone = "warning"; }
  else if (understaffed) {
    const missing = slots - assignedEmployees.length;
    statusLabel = `Faltan ${missing}`;
    statusTone = "danger";
  }
  else { statusLabel = "Publicado"; statusTone = "success"; }

  const coverageLabel = slots > 0
    ? `${assignedEmployees.length}/${slots} asignados${understaffed ? ` · faltan ${slots - assignedEmployees.length}` : ""}`
    : null;

  // Title shown by header is shift.title (or fallback to client). Client name
  // surfaces under jobSiteName slot via clientName prop.
  const headerTitle = shift.title?.trim() || clientName;

  const accent = shift.client_id ? clientAccentColor(shift.client_id) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKey}
      className={cn(
        "group relative w-full overflow-hidden text-left rounded-3xl border border-border/40 bg-card p-4 pl-5 cursor-pointer select-none",
        "active:scale-[0.99] transition-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {/* Identidad de cliente: mismo acento cromático que en desktop */}
      {accent ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[4px]" style={{ backgroundColor: accent }} />
      ) : null}

      {/* Stafly Work Route header (admin / compact) */}
      <ShiftRouteHeader
        variant="admin"
        density="compact"
        title={headerTitle}
        clientName={clientName !== headerTitle ? clientName : null}
        shiftRef={displayShiftRef(shift)}
        date={shift.date}
        startTime={shift.start_time}
        endTime={shift.end_time}
        jobSiteName={locationName || null}
        statusLabel={statusLabel}
        statusTone={statusTone}
        coverageLabel={null}
        trailing={<ChevronRight className="h-4 w-4 text-muted-foreground/60" />}
        className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none"
      />

      {/* Las personas antes que los datos: una sola línea, sin barras ni chips */}
      <div className="flex items-center gap-2 mt-3 min-w-0">
        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[13px] text-muted-foreground truncate">
          {assignedEmployees.length === 0
            ? "Nadie asignado todavía"
            : (
              <>
                {visibleNames.join(", ")}
                {more > 0 && <span className="font-medium"> +{more}</span>}
              </>
            )}
          {noClient && <span className="text-muted-foreground/70"> · sin cliente</span>}
        </span>
        {coverageLabel ? (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              understaffed ? "bg-status-danger/10 text-status-danger" : "bg-status-success/10 text-status-success",
            )}
          >
            {assignedEmployees.length}/{slots}
          </span>
        ) : null}
      </div>
    </div>
  );
}



function SkeletonList() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/40 bg-card p-4 animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-5 w-14 bg-muted rounded" />
          </div>
          <div className="h-5 w-24 bg-muted rounded mb-3" />
          <div className="h-3 w-full bg-muted rounded mb-2" />
          <div className="h-1.5 w-full bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

function RequestRow({ req, onOpen }: { req: PendingRequest; onOpen: () => void }) {
  const dateStr = req.shift_date ? (() => {
    try { return format(parseISO(req.shift_date!), "EEE MMM d", { locale: es }); } catch { return req.shift_date; }
  })() : "—";
  const time = req.shift_start && req.shift_end
    ? `${req.shift_start.slice(0,5)}–${req.shift_end.slice(0,5)}`
    : "";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-border/50 bg-card p-3.5 active:scale-[0.98] transition"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-sm font-semibold truncate">{req.employee_name}</div>
        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
          Pendiente
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {req.shift_title ?? "Turno"} · {dateStr}{time ? ` · ${time}` : ""}
      </div>
      {req.message && (
        <div className="text-xs text-foreground/80 mt-1.5 line-clamp-2">"{req.message}"</div>
      )}
    </button>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const messages: Record<TabKey, { title: string; hint: string }> = {
    today: { title: "Sin turnos hoy", hint: "Toca Crear arriba para abrir uno rápido en menos de un minuto." },
    upcoming: { title: "Nada programado adelante", hint: "Toca Crear arriba para abrir un turno desde el teléfono." },
    needs: { title: `Todos los ${ADMIN_LEX.entityPlural} cubiertos`, hint: `La cobertura se ve sólida en todos los ${ADMIN_LEX.entityPlural}.` },
    requests: { title: "Sin solicitudes pendientes", hint: "Las solicitudes de turno aparecen aquí cuando un worker pide entrar." },
  };
  const m = messages[tab];
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
        <CalendarDays className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">{m.title}</h3>
      <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">{m.hint}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-3">
        <AlertTriangle className="h-6 w-6 text-rose-600" />
      </div>
      <h3 className="text-base font-semibold mb-1">No pudimos cargar los turnos</h3>
      <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed mb-4">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Reintentar</Button>
    </div>
  );
}
