import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays, Plus, SlidersHorizontal, Search, ChevronLeft, ChevronRight,
  Users, Clock, AlertTriangle, FileEdit, MapPin, Building2, X, Loader2, Eye,
} from "lucide-react";
import { format, parseISO, isToday, isTomorrow, addDays, startOfDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ShiftFilters, EMPTY_FILTERS, type ShiftFilterState } from "@/components/shifts/ShiftFilters";
import { MobileShiftOperationsSheet } from "@/components/shifts/mobile/MobileShiftOperationsSheet";
import { isDraftShift, isPublishedShift } from "@/lib/shifts/shift-guards";
import type { Shift, Assignment, Employee, SelectOption } from "@/components/shifts/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * MobileShiftsView — Phase 1
 * Self-contained, frontend-only. Read-only mutations on mobile (canEdit=false
 * forwarded to ShiftDetailDialog). Reuses existing ShiftFilters, ShiftDetailDialog
 * and shift-guards. Multi-tenant scoped by selectedCompanyId.
 */

type TabKey = "today" | "upcoming" | "unstaffed" | "drafts" | "issues";

const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "unstaffed", label: "Unstaffed" },
  { key: "drafts", label: "Drafts" },
  { key: "issues", label: "Issues" },
];

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
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEE MMM d", { locale: enUS });
  } catch {
    return dateStr;
  }
}

export default function MobileShiftsView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, hasModuleAccess } = useAuth();
  const { selectedCompanyId, selectedCompany } = useCompany();

  // Permissions — same rule as desktop Shifts
  const canEdit = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");

  // Tab from URL (?tab=today) so back/forward works; fallback to "today"
  const initialTab = (searchParams.get("tab") as TabKey) || "today";
  const [tab, setTab] = useState<TabKey>(
    TABS.some(t => t.key === initialTab) ? initialTab : "today"
  );

  const [shifts, setShifts] = useState<Shift[]>([]);
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

  // Load shifts for the next 14 days + last 1 day (for "Today" buffer)
  const dateRange = useMemo(() => {
    const start = format(addDays(new Date(), -1), "yyyy-MM-dd");
    const end = format(addDays(new Date(), 14), "yyyy-MM-dd");
    return { start, end };
  }, []);

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
            .select("id,title,date,start_time,end_time,status,publication_status,slots,client_id,location_id,notes,claimable,shift_code")
            .eq("company_id", selectedCompanyId!)
            .is("deleted_at", null)
            .gte("date", dateRange.start)
            .lte("date", dateRange.end)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true }),
          supabase.from("clients").select("id,name").eq("company_id", selectedCompanyId!).order("name"),
          supabase.from("locations").select("id,name").eq("company_id", selectedCompanyId!).order("name"),
          supabase.from("employees")
            .select("id,first_name,last_name,avatar_url,phone_number,employer_identification,is_active")
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
  }, [selectedCompanyId, dateRange.start, dateRange.end]);

  // Persist tab in URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

  // Counts per tab (computed from fully-filtered-by-search dataset minus tab filter)
  const baseFiltered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
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
        const hay = `${s.title} ${clientName} ${locName} ${s.shift_code ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }, [shifts, filters, assignmentsByShift, clientById, locationById]);

  const tabCounts = useMemo(() => {
    const counts = { today: 0, upcoming: 0, unstaffed: 0, drafts: 0, issues: 0 };
    for (const s of baseFiltered) {
      const asgns = assignmentsByShift.get(s.id) ?? [];
      const confirmed = asgns.filter(a => a.status === "confirmed").length;
      const slots = s.slots ?? 0;
      const isDraft = isDraftShift(s);
      const understaffed = slots > 0 && confirmed < slots;
      const noClient = !s.client_id;

      if (s.date === todayStr) counts.today++;
      if (s.date > todayStr) counts.upcoming++;
      if (s.date >= todayStr && understaffed) counts.unstaffed++;
      if (isDraft) counts.drafts++;
      if (s.date >= todayStr && (noClient || (slots > 0 && confirmed === 0))) counts.issues++;
    }
    return counts;
  }, [baseFiltered, assignmentsByShift, todayStr]);

  const visibleShifts = useMemo(() => {
    return baseFiltered.filter(s => {
      const asgns = assignmentsByShift.get(s.id) ?? [];
      const confirmed = asgns.filter(a => a.status === "confirmed").length;
      const slots = s.slots ?? 0;
      const understaffed = slots > 0 && confirmed < slots;
      const isDraft = isDraftShift(s);
      const noClient = !s.client_id;

      switch (tab) {
        case "today": return s.date === todayStr;
        case "upcoming": return s.date > todayStr;
        case "unstaffed": return s.date >= todayStr && understaffed;
        case "drafts": return isDraft;
        case "issues": return s.date >= todayStr && (noClient || (slots > 0 && confirmed === 0));
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
        if (a.status === "confirmed") {
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

  const handleCreate = () => {
    if (!canEdit) return;
    toast("Create shift from desktop for now");
  };

  return (
    <div className="min-h-full pb-[calc(env(safe-area-inset-bottom,0px)+72px)] bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/40">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight leading-tight">Shifts</h1>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {selectedCompany?.name ?? "All companies"} · {format(new Date(), "EEE MMM d", { locale: enUS })}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl relative"
              onClick={() => setFiltersOpen(true)}
              aria-label="Filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeFiltersCount > 0 && (
                <span className="absolute top-1 right-1 h-4 min-w-4 px-1 text-[9px] font-bold leading-none flex items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
            {canEdit && (
              <Button
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={handleCreate}
                aria-label="Create shift"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Tabs (pills) */}
        <div className="flex items-center gap-1.5 overflow-x-auto -mx-4 px-4 scrollbar-none">
          {TABS.map(t => {
            const count = tabCounts[t.key];
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted active:scale-[0.97]"
                )}
              >
                <span>{t.label}</span>
                {count > 0 && (
                  <span className={cn(
                    "h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold",
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-4 gap-2">
          <SummaryCard label="Shifts" value={summary.shifts} />
          <SummaryCard label="Hours" value={summary.hours} />
          <SummaryCard label="Workers" value={summary.workers} />
          <SummaryCard label="Coverage" value={`${summary.coverage}%`} accent={summary.coverage >= 90 ? "good" : summary.coverage >= 60 ? "warn" : "bad"} />
        </div>
      </div>

      {/* List */}
      <div className="px-4 pt-4">
        {loading ? (
          <SkeletonList />
        ) : error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : grouped.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="space-y-5">
            {grouped.map(group => (
              <div key={group.date}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                    {group.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60">
                    · {group.shifts.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {group.shifts.map(shift => {
                    const asgns = assignmentsByShift.get(shift.id) ?? [];
                    const confirmed = asgns.filter(a => a.status === "confirmed");
                    const assignedEmployees = confirmed
                      .map(a => employeeById.get(a.employee_id))
                      .filter(Boolean) as Employee[];
                    const slots = shift.slots ?? 0;
                    const coverage = slots > 0 ? Math.round((confirmed.length / slots) * 100) : 0;
                    const isDraft = isDraftShift(shift);
                    const understaffed = slots > 0 && confirmed.length < slots;
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

      {/* Filters Sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl px-4 pt-4 overflow-y-auto">
          <SheetHeader className="text-left mb-3">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <ShiftFilters
              filters={filters}
              onChange={setFilters}
              clients={clients}
              locations={locations}
              allowClaims={true}
            />
          </div>
          <div className="sticky bottom-0 bg-background pt-3 pb-[max(env(safe-area-inset-bottom,0px),12px)] flex items-center gap-2 mt-4 border-t border-border/40">
            <Button variant="ghost" className="flex-1" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              Apply
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Operations Snapshot — mobile-first sheet (read-only Phase 1.5) */}
      <MobileShiftOperationsSheet
        shift={detailShift}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        assignments={assignments}
        employees={employees}
        clientName={detailShift?.client_id ? clientById.get(detailShift.client_id) ?? "—" : "—"}
        locationName={detailShift?.location_id ? locationById.get(detailShift.location_id) ?? "" : ""}
      />
    </div>
  );
}

/* ───────────── Subcomponents ───────────── */

function SummaryCard({ label, value, accent }: { label: string; value: number | string; accent?: "good" | "warn" | "bad" }) {
  const accentClass =
    accent === "good" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "warn" ? "text-amber-600 dark:text-amber-400" :
    accent === "bad" ? "text-rose-600 dark:text-rose-400" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-border/50 bg-card px-2.5 py-2.5 text-center shadow-sm">
      <div className={cn("text-base font-semibold tabular-nums", accentClass)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

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
  const coverBarColor =
    coverage >= 100 ? "bg-emerald-500" :
    coverage >= 60 ? "bg-amber-500" :
    "bg-rose-500";

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKey}
      className={cn(
        "group relative w-full text-left rounded-2xl border border-border/50 bg-card p-4 cursor-pointer select-none",
        "active:scale-[0.98] hover:border-border transition-all shadow-sm hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {/* Top row: client + status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tracking-tight truncate">
            {clientName}
          </div>
          {locationName && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{locationName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge isDraft={isDraft} understaffed={understaffed} />
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>

      {/* Time */}
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-base font-mono font-semibold tabular-nums">
          {formatTimeShort(shift.start_time)}–{formatTimeShort(shift.end_time)}
        </span>
        {shift.title && shift.title !== clientName && (
          <span className="text-[11px] text-muted-foreground truncate">· {shift.title}</span>
        )}
      </div>

      {/* Workers + coverage */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {assignedEmployees.length === 0
              ? slots > 0 ? `0 / ${slots}` : "Unassigned"
              : (
                <>
                  {visibleNames.join(", ")}
                  {more > 0 && <span className="font-medium"> +{more} more</span>}
                </>
              )}
          </span>
        </div>
        {slots > 0 && (
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
            {assignedEmployees.length}/{slots}
          </span>
        )}
      </div>

      {/* Coverage bar */}
      {slots > 0 && (
        <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden mb-2">
          <div
            className={cn("h-full rounded-full transition-all", coverBarColor)}
            style={{ width: `${Math.min(100, coverage)}%` }}
          />
        </div>
      )}

      {/* Warnings */}
      {(understaffed || isDraft || noClient) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {understaffed && (
            <Warning icon={Users} label="Needs staff" tone="bad" />
          )}
          {isDraft && (
            <Warning icon={FileEdit} label="Draft" tone="warn" />
          )}
          {noClient && (
            <Warning icon={Building2} label="No client" tone="warn" />
          )}
        </div>
      )}

      {/* Footer: explicit affordance + Operations button */}
      <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Eye className="h-3 w-3" />
          View operations
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/15 active:scale-95 transition"
        >
          Operations
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ isDraft, understaffed }: { isDraft: boolean; understaffed: boolean }) {
  if (isDraft) {
    return <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">Draft</Badge>;
  }
  if (understaffed) {
    return <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10">Unstaffed</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">Published</Badge>;
}

function Warning({ icon: Icon, label, tone }: { icon: any; label: string; tone: "bad" | "warn" }) {
  const cls = tone === "bad"
    ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30"
    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border", cls)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
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

function EmptyState({ tab }: { tab: TabKey }) {
  const messages: Record<TabKey, { title: string; hint: string }> = {
    today: { title: "No shifts today", hint: "Take a breath. Tomorrow's roster is just a tap away." },
    upcoming: { title: "Nothing scheduled ahead", hint: "Use the desktop scheduler to plan upcoming shifts." },
    unstaffed: { title: "All shifts are staffed", hint: "Coverage looks good across the board." },
    drafts: { title: "No drafts pending", hint: "Drafts you save will appear here before publishing." },
    issues: { title: "No issues found", hint: "Everything checks out — no missing clients or empty slots." },
  };
  const m = messages[tab];
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
        <CalendarDays className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">{m.title}</h3>
      <p className="text-[12px] text-muted-foreground max-w-[260px] leading-snug">{m.hint}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-3">
        <AlertTriangle className="h-6 w-6 text-rose-600" />
      </div>
      <h3 className="text-sm font-semibold mb-1">Couldn't load shifts</h3>
      <p className="text-[12px] text-muted-foreground max-w-[280px] leading-snug mb-4">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}
