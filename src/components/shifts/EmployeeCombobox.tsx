import { useState, useMemo, useDeferredValue, useRef, useEffect } from "react";
import { UserPlus } from "lucide-react";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { EntityCard } from "@/components/entities/EntityCard";
import { buildWorkerEntityView, type WorkerEntityInput } from "@/lib/entities/entity-presenters";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Search, AlertTriangle, X, CalendarOff, Car, Zap, UserCheck, ShieldAlert, PauseCircle, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { isEmployeeAvailable, type AvailabilityConfig, type AvailabilityOverride } from "@/hooks/useEmployeeAvailability";
import { computeDuplicateHints } from "@/lib/employee-duplicate-hints";
import { searchEmployees, type MatchResult } from "@/lib/employee-search";
import type { Employee, Shift, Assignment } from "./types";

interface EmployeeComboboxProps {
  employees: Employee[];
  selected: string[];
  onToggle: (id: string) => void;
  shifts?: Shift[];
  assignments?: Assignment[];
  shiftDate?: string;
  shiftStart?: string;
  shiftEnd?: string;
  maxHeight?: string;
  showChips?: boolean;
  availabilityConfigs?: AvailabilityConfig[];
  availabilityOverrides?: AvailabilityOverride[];
  availabilityBlockMode?: "hard" | "warning";
  showBulkActions?: boolean;
  remainingSlots?: number;
  requiresDriver?: boolean;
  /** Shift's group/area for same-group prioritization */
  shiftGroup?: string | null;
  /** Show "+ Add new employee" option and callback when selected */
  onAddNewEmployee?: () => void;
  /** Show "+ Emergency worker" option (admin-only entry to
   *  EmergencyWorkerDialog). Callback opens the dialog in the parent. */
  onAddEmergencyWorker?: () => void;
  /** Optional context for the diagnostic banner shown when employees=[] or filter empties out.
   *  Always-on (admin-friendly empty state). The full debug panel is gated by `debugMode`. */
  debugContext?: {
    selectedCompanyId?: string | null;
    companyName?: string | null;
    shiftCompanyId?: string | null;
    employeesLoaded?: number;
    unassignedCount?: number;
    assignedIds?: string[];
  };
  /** When true (caller is in `?debug=1` mode AND authorized role), render the
   *  collapsible "Debug assignment" panel with metrics + optional worker probe. */
  debugMode?: boolean;
  /** Optional worker probe (UUID or employer_identification). Scoped diagnostics. */
  debugWorker?: string | null;
  /** Pre-computed search probes when `debugMode` is on. */
  debugSearches?: Record<string, Array<{ id: string; label: string; matchedBy: MatchResult["matchedBy"]; score: number }>>;
  /** Pre-computed worker-probe results (only meaningful when `debugWorker` is set). */
  debugWorkerFlags?: {
    inEmployees?: boolean;
    inAssigned?: boolean;
    inUnassigned?: boolean;
    conflict?: string | null;
    unavailable?: string | null;
    matchedLabel?: string | null;
  };
}

interface ConflictInfo { shiftTitle: string; time: string; }

function getConflicts(
  employeeId: string, shiftDate: string | undefined, shiftStart: string | undefined,
  shiftEnd: string | undefined, shifts: Shift[], assignments: Assignment[],
): ConflictInfo[] {
  if (!shiftDate || !shiftStart || !shiftEnd) return [];
  const empShiftIds = new Set(assignments.filter(a => a.employee_id === employeeId).map(a => a.shift_id));
  return shifts
    .filter(s => empShiftIds.has(s.id) && s.date === shiftDate && shiftStart < s.end_time.slice(0, 5) && shiftEnd > s.start_time.slice(0, 5))
    .map(s => ({ shiftTitle: s.title, time: `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` }));
}

type QuickFilter = "all" | "available" | "drivers" | "incomplete" | "no-conflict";
type GroupKey = "ready" | "warning" | "blocked" | "inactive";

import { isEmployeeDriver } from "./types";
const isDriver = (e: Employee) => isEmployeeDriver(e);

/**
 * Placeholder / system / external / agency / payroll-unsafe detection.
 *
 * Phase 2A: now also honors the Phase 1 identity columns (worker_type /
 * identity_status). Legacy signals (payroll_safe / person_type_guess) are
 * kept for forward compatibility even though they don't exist in the DB
 * today — the OR-fallback is conservative and safe.
 */
import {
  classifyWorkerAssignability,
  isAssignableWorker,
  NON_ASSIGNABLE_GROUP_LABELS,
} from "@/lib/shifts/assignable-workers";

/** Contrato canónico único: ver src/lib/shifts/assignable-workers.ts */
const isNonAssignable = (e: Employee) => !isAssignableWorker(e);

/** Profile readiness derived from `employees.profile_status` (best-effort, UI hint only). */
function isProfileIncomplete(e: Employee): boolean {
  const ps = e.profile_status;
  if (!ps) return false;
  return ps !== "ready" && ps !== "active";
}

export function EmployeeCombobox({
  employees, selected, onToggle, shifts = [], assignments = [], shiftDate, shiftStart, shiftEnd,
  maxHeight = "220px", showChips = true, availabilityConfigs = [], availabilityOverrides = [],
  availabilityBlockMode = "warning", showBulkActions = false, remainingSlots, requiresDriver = false,
  shiftGroup, onAddNewEmployee, onAddEmergencyWorker, debugContext,
  debugMode = false, debugWorker = null, debugSearches, debugWorkerFlags,
}: EmployeeComboboxProps) {
  const [search, setSearch] = useState("");
  // React 18 native debouncing: keeps input snappy while heavy filtering uses the deferred value.
  const deferredSearch = useDeferredValue(search);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  // Contrato canónico: solo trabajadores asignables por defecto.
  // Acción explícita para revelar pendientes / históricos / placeholders / inactivos.
  const [showNonAssignable, setShowNonAssignable] = useState(false);

  const conflictMap = useMemo(() => {
    const map = new Map<string, ConflictInfo[]>();
    for (const emp of employees) {
      const c = getConflicts(emp.id, shiftDate, shiftStart, shiftEnd, shifts, assignments);
      if (c.length > 0) map.set(emp.id, c);
    }
    return map;
  }, [employees, shiftDate, shiftStart, shiftEnd, shifts, assignments]);

  const unavailableMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!shiftDate || availabilityConfigs.length === 0) return map;
    for (const emp of employees) {
      const r = isEmployeeAvailable(emp.id, shiftDate, availabilityConfigs, availabilityOverrides);
      if (!r.available) map.set(emp.id, r.reason || "No disponible");
    }
    return map;
  }, [employees, shiftDate, availabilityConfigs, availabilityOverrides]);

  const getGroup = (emp: Employee): GroupKey => {
    if (isNonAssignable(emp)) return "inactive";
    if (unavailableMap.has(emp.id)) return "blocked";
    if (conflictMap.has(emp.id)) return "warning";
    return "ready";
  };

  // Possible-duplicate hints (phone / email / normalized name) — UI surfacing only.
  const dupHints = useMemo(() => computeDuplicateHints(employees), [employees]);

  // Compute assignment frequency from all assignments (same date range proxy)
  const assignmentFreq = useMemo(() => {
    const freq = new Map<string, number>();
    for (const a of assignments) {
      freq.set(a.employee_id, (freq.get(a.employee_id) || 0) + 1);
    }
    return freq;
  }, [assignments]);

  // Flexible, safe relevance search. Keeps token-AND substring matching as the
  // primary path, plus exact ID/phone shortcuts and a soft phonetic alias
  // fallback for common name variants (jhionny/jhonny/johnny → Johny).
  // See src/lib/employee-search.ts.
  // Single pass over searchEmployees: derive both the score map and the matchedBy map
  // from one computation. Uses deferredSearch to avoid blocking input on large rosters.
  const searchMaps = useMemo(() => {
    const scoreMap = new Map<string, number>();
    const matchedBy = new Map<string, MatchResult["matchedBy"]>();
    if (!deferredSearch.trim()) return { scoreMap, matchedBy };
    const scored = searchEmployees(employees, deferredSearch);
    for (const e of scored) {
      scoreMap.set(e.id, e.__match.score);
      matchedBy.set(e.id, e.__match.matchedBy);
    }
    return { scoreMap, matchedBy };
  }, [employees, deferredSearch]);
  const matchScoreById = searchMaps.scoreMap;
  const matchedByMap = searchMaps.matchedBy;

  const filtered = useMemo(() => {
    let list = employees;
    if (deferredSearch.trim()) {
      list = list.filter((e) => matchScoreById.has(e.id));
    }
    if (quickFilter === "available") list = list.filter(e => getGroup(e) === "ready");
    else if (quickFilter === "drivers") list = list.filter(e => isDriver(e) && isAssignableWorker(e));
    else if (quickFilter === "incomplete") list = list.filter(e => isAssignableWorker(e) && isProfileIncomplete(e));
    else if (quickFilter === "no-conflict") list = list.filter(e => !conflictMap.has(e.id));
    // S1: por defecto ocultar inactivos/históricos, salvo que ya estén asignados
    // (visualización de histórico) o el toggle esté activo.
    if (!showNonAssignable) {
      list = list.filter(e => isAssignableWorker(e) || selected.includes(e.id));
    }
    return list;
  }, [employees, deferredSearch, matchScoreById, quickFilter, unavailableMap, conflictMap, showNonAssignable, selected]);

  // Smart sort: when searching, relevance score dominates so the most precise
  // match (exact ID/phone, then last name, then first name, then phonetic) leads.
  // When NOT searching, group-based ranking (ready/warning/blocked/inactive) leads.
  // Use deferredSearch so sort/filter stay consistent with the deferred score map.
  const isSearching = deferredSearch.trim().length > 0;
  const sorted = useMemo(() => {
    const normalizedShiftGroup = shiftGroup?.toLowerCase().trim();

    const score = (emp: Employee): number => {
      if (selected.includes(emp.id)) return -1000;

      if (isSearching) {
        // Primary key: relevance from searchEmployees (lower = better, 0..120).
        // Secondary nudge: small group penalty so a perfect match still beats
        // a fuzzy phonetic ready worker but we don't surface inactive on top.
        const rel = matchScoreById.get(emp.id) ?? 999;
        const g = getGroup(emp);
        const groupNudge = g === "ready" ? 0 : g === "warning" ? 5 : g === "blocked" ? 10 : 20;
        return rel + groupNudge;
      }

      const g = getGroup(emp);
      let s = g === "ready" ? 0 : g === "warning" ? 500 : g === "blocked" ? 1000 : 2000;
      if (g === "ready") {
        if (requiresDriver && isDriver(emp)) s -= 50;
        if (normalizedShiftGroup && emp.groups?.toLowerCase().includes(normalizedShiftGroup)) s -= 30;
        const freq = assignmentFreq.get(emp.id) || 0;
        s -= Math.min(freq * 5, 25);
        if (emp.user_id) s -= 20;
        if (!isProfileIncomplete(emp)) s -= 15;
        if (emp.employer_identification) s -= 5;
      }
      return s;
    };

    return [...filtered].sort((a, b) => score(a) - score(b) || `${a.first_name}`.localeCompare(`${b.first_name}`));
  }, [filtered, selected, unavailableMap, conflictMap, requiresDriver, shiftGroup, assignmentFreq, isSearching, matchScoreById]);

  const selectedEmps = employees.filter(e => selected.includes(e.id));
  const handleToggle = (id: string) => {
    // Inactive workers cannot be (re)assigned from the selector.
    const target = employees.find(e => e.id === id);
    if (target && isNonAssignable(target) && !selected.includes(id)) return;
    if (availabilityBlockMode === "hard" && unavailableMap.has(id) && !selected.includes(id)) return;
    onToggle(id);
  };

  const readyCount = filtered.filter(e => getGroup(e) === "ready").length;
  const activeCount = useMemo(() => employees.filter(e => isAssignableWorker(e)).length, [employees]);
  const driverCount = useMemo(() => employees.filter(e => isDriver(e) && isAssignableWorker(e)).length, [employees]);
  const incompleteCount = useMemo(
    () => employees.filter(e => isAssignableWorker(e) && isProfileIncomplete(e)).length,
    [employees],
  );
  const nonAssignableHiddenCount = useMemo(
    () => employees.filter(e => isNonAssignable(e) && !selected.includes(e.id)).length,
    [employees, selected],
  );
  const nonAssignableBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of employees) {
      if (!isNonAssignable(e) || selected.includes(e.id)) continue;
      const b = classifyWorkerAssignability(e).bucket as keyof typeof NON_ASSIGNABLE_GROUP_LABELS;
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return [...counts.entries()].map(([b, n]) => `${NON_ASSIGNABLE_GROUP_LABELS[b as keyof typeof NON_ASSIGNABLE_GROUP_LABELS]}: ${n}`);
  }, [employees, selected]);

  // Bulk actions
  const selectAllReady = () => {
    const limit = remainingSlots ?? Infinity;
    let added = 0;
    for (const emp of sorted) {
      if (added >= limit) break;
      if (selected.includes(emp.id) || getGroup(emp) !== "ready") continue;
      onToggle(emp.id);
      added++;
    }
  };

  const selectDrivers = () => {
    // Phase 2 #3.5: respeta plazas restantes — no sobreasignar.
    const limit = remainingSlots ?? Infinity;
    let added = 0;
    for (const emp of sorted) {
      if (added >= limit) break;
      if (selected.includes(emp.id) || !isDriver(emp) || getGroup(emp) === "blocked") continue;
      onToggle(emp.id);
      added++;
    }
  };

  const clearSelection = () => { for (const id of [...selected]) onToggle(id); };

  // Pre-compute group boundaries
  const groupBreaks = useMemo(() => {
    const breaks = new Set<string>();
    let last: GroupKey | null = null;
    for (const emp of sorted) {
      if (selected.includes(emp.id)) continue;
      const g = getGroup(emp);
      if (g !== last) { breaks.add(emp.id); last = g; }
    }
    return breaks;
  }, [sorted, selected, unavailableMap, conflictMap]);

  return (
    <div className="space-y-1.5">
      {/* Selected chips — compact inline */}
      {showChips && selectedEmps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedEmps.map(emp => (
            <Badge
              key={emp.id} variant="secondary"
              className={cn(
                "text-[10px] gap-1 pl-0.5 pr-1.5 py-0.5 cursor-pointer hover:bg-destructive/10 transition-colors h-6",
                conflictMap.has(emp.id) && "border-warning/50 bg-warning/10 text-warning",
                unavailableMap.has(emp.id) && !conflictMap.has(emp.id) && "border-destructive/50 bg-destructive/10 text-destructive",
              )}
              onClick={() => onToggle(emp.id)}
            >
              <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="xs" className="h-4 w-4 text-[6px]" />
              <span className="font-medium">{formatPersonName(emp.first_name)}</span>
              {isDriver(emp) && <Car className="h-2.5 w-2.5 text-primary/60" />}
              <X className="h-2.5 w-2.5 opacity-50" />
            </Badge>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar trabajador..."
          className="h-7 text-xs pl-8 pr-8"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Filters + bulk row */}
      <div className="flex items-center gap-1 flex-wrap">
        {([
          { key: "all" as QuickFilter, label: "Activos", count: activeCount },
          { key: "available" as QuickFilter, label: "Listos", count: readyCount },
          { key: "drivers" as QuickFilter, label: "Conductores", count: driverCount },
          { key: "incomplete" as QuickFilter, label: "Incompletos", count: incompleteCount },
        ]).map(f => (
          <button
            key={f.key} onClick={() => setQuickFilter(f.key)}
            className={cn(
              "text-[9px] font-semibold px-2 py-0.5 rounded-full transition-all",
              quickFilter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label} <span className="opacity-70">{f.count}</span>
          </button>
        ))}

        {showBulkActions && (
          <div className="flex items-center gap-1 ml-auto">
            {(remainingSlots === undefined || remainingSlots > 0) && (
              <button
                onClick={selectAllReady}
                className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-earning/15 text-earning hover:bg-earning/25 transition-all flex items-center gap-0.5"
              >
                <Zap className="h-2.5 w-2.5" /> Fill {remainingSlots != null ? `(${remainingSlots})` : ""}
              </button>
            )}
            {requiresDriver && (
              <button
                onClick={selectDrivers}
                className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center gap-0.5"
              >
                <Car className="h-2.5 w-2.5" /> +Conductor
              </button>
            )}
            {selected.length > 0 && (
              <button
                onClick={clearSelection}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Acción administrativa explícita: revelar población no asignable. */}
      {(nonAssignableHiddenCount > 0 || showNonAssignable) && (
        <div className="flex items-center justify-between gap-2 px-0.5 py-1 rounded-md bg-muted/30 border border-border/30">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ShieldAlert className="h-3 w-3" />
            {showNonAssignable ? (
              <span>
                Mostrando no asignables al final.{" "}
                <span className="text-warning font-semibold">No disponibles para staffing normal.</span>
              </span>
            ) : (
              <span>
                No asignables ocultos: <span className="font-semibold text-foreground">{nonAssignableHiddenCount}</span>
                {nonAssignableBreakdown.length > 0 && (
                  <span className="opacity-70"> · {nonAssignableBreakdown.join(" · ")}</span>
                )}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowNonAssignable(v => !v)}
            className={cn(
              "text-[9px] font-bold px-2 py-0.5 rounded-full transition-all shrink-0",
              showNonAssignable
                ? "bg-warning/15 text-warning hover:bg-warning/25"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {showNonAssignable ? "Ocultar no asignables" : "Mostrar no asignables"}
          </button>
        </div>
      )}

      {debugMode && debugContext && (
        <details className="rounded-lg bg-muted/40 border border-border/40 text-[10px] font-mono text-muted-foreground">
          <summary className="cursor-pointer px-2 py-1 select-none font-sans text-[11px] font-semibold text-foreground/70">
            Debug assignment {debugWorker ? `· worker=${debugWorker}` : ""}
          </summary>
          <div className="p-2 space-y-1">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <div className="flex justify-between gap-2"><span className="opacity-60">selectedCompanyId</span><span className="truncate">{debugContext.selectedCompanyId ?? "null"}</span></div>
              <div className="flex justify-between gap-2"><span className="opacity-60">companyName</span><span className="truncate">{debugContext.companyName ?? "—"}</span></div>
              <div className="flex justify-between gap-2"><span className="opacity-60">shift.company_id</span><span className="truncate">{debugContext.shiftCompanyId ?? "—"}</span></div>
              <div className="flex justify-between gap-2"><span className="opacity-60">quickFilter</span><span>{quickFilter}</span></div>
              <div className="flex justify-between gap-2"><span className="opacity-60">employeesLoaded</span><span>{debugContext.employeesLoaded ?? employees.length}</span></div>
              <div className="flex justify-between gap-2"><span className="opacity-60">filteredCount</span><span>{filtered.length}</span></div>
              <div className="flex justify-between gap-2"><span className="opacity-60">unassignedCount</span><span>{debugContext.unassignedCount ?? employees.length}</span></div>
              <div className="flex justify-between gap-2"><span className="opacity-60">assignedCount</span><span>{debugContext.assignedIds?.length ?? 0}</span></div>
              <div className="flex justify-between gap-2"><span className="opacity-60">selectedCount</span><span>{selected.length}</span></div>
            </div>
            {debugWorker && debugWorkerFlags && (
              <div className="pt-1 mt-1 border-t border-border/40 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div className="flex justify-between gap-2"><span className="opacity-60">match</span><span className="truncate">{debugWorkerFlags.matchedLabel ?? "—"}</span></div>
                <div className="flex justify-between gap-2"><span className="opacity-60">in employees</span><span>{debugWorkerFlags.inEmployees ? "yes" : "no"}</span></div>
                <div className="flex justify-between gap-2"><span className="opacity-60">in assigned</span><span>{debugWorkerFlags.inAssigned ? "yes" : "no"}</span></div>
                <div className="flex justify-between gap-2"><span className="opacity-60">in unassigned</span><span>{debugWorkerFlags.inUnassigned ? "yes" : "no"}</span></div>
                <div className="flex justify-between gap-2"><span className="opacity-60">conflict</span><span className="truncate">{debugWorkerFlags.conflict ?? "no"}</span></div>
                <div className="flex justify-between gap-2"><span className="opacity-60">unavailable</span><span className="truncate">{debugWorkerFlags.unavailable ?? "no"}</span></div>
              </div>
            )}
            {debugSearches && Object.keys(debugSearches).length > 0 && (
              <div className="pt-1 mt-1 border-t border-border/40 space-y-0.5">
                {Object.entries(debugSearches).map(([query, hits]) => (
                  <div key={query} className="flex gap-2">
                    <span className="opacity-60 shrink-0">search {query}</span>
                    <span className="truncate">
                      {hits.length > 0
                        ? hits.map((hit) => `${hit.label} [${hit.matchedBy}:${hit.score}]`).join(" · ")
                        : "0 hits"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Employee list — virtualized */}
      <VirtualEmployeeList
        sorted={sorted}
        selected={selected}
        conflictMap={conflictMap}
        unavailableMap={unavailableMap}
        availabilityBlockMode={availabilityBlockMode}
        requiresDriver={requiresDriver}
        groupBreaks={groupBreaks}
        readyCount={readyCount}
        dupHints={dupHints}
        getGroup={getGroup}
        handleToggle={handleToggle}
        onAddNewEmployee={onAddNewEmployee}
        onAddEmergencyWorker={onAddEmergencyWorker}
        maxHeight={maxHeight}
        search={search}
        employees={employees}
        filtered={filtered}
        debugContext={debugContext}
      />

      {/* Summary */}
      <div className="flex items-center justify-between text-[9px] text-muted-foreground px-0.5">
        <span>
          {filtered.length} {filtered.length === 1 ? "trabajador" : "trabajadores"}
          {!showNonAssignable && nonAssignableHiddenCount > 0 && (
            <span className="opacity-70"> · {nonAssignableHiddenCount} no asignables ocultos</span>
          )}
        </span>
        {selected.length > 0 && (
          <span className="font-semibold text-foreground">
            {selected.length} seleccionados
          </span>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Virtualized list — renders only visible rows + overscan to keep the picker
// snappy with 1k+ workers. No data is dropped: sorted/filtered employees are
// the source of truth; we just window the DOM.
// ────────────────────────────────────────────────────────────────────────────
interface VirtualEmployeeListProps {
  sorted: Employee[];
  selected: string[];
  conflictMap: Map<string, ConflictInfo[]>;
  unavailableMap: Map<string, string>;
  availabilityBlockMode: "hard" | "warning";
  requiresDriver: boolean;
  groupBreaks: Set<string>;
  readyCount: number;
  dupHints: ReturnType<typeof computeDuplicateHints>;
  getGroup: (e: Employee) => GroupKey;
  handleToggle: (id: string) => void;
  onAddNewEmployee?: () => void;
  onAddEmergencyWorker?: () => void;
  maxHeight: string;
  search: string;
  employees: Employee[];
  filtered: Employee[];
  debugContext?: EmployeeComboboxProps["debugContext"];
}

type FlatItem =
  | { type: "header"; key: string; group: GroupKey }
  | { type: "row"; key: string; emp: Employee }
  | { type: "add"; key: string }
  | { type: "emergency"; key: string };

const ROW_HEIGHT = 58;
const HEADER_HEIGHT = 22;
const ADD_HEIGHT = 36;
const OVERSCAN = 6;

function VirtualEmployeeList(props: VirtualEmployeeListProps) {
  const {
    sorted, selected, conflictMap, unavailableMap, availabilityBlockMode,
    requiresDriver, groupBreaks, readyCount, dupHints, getGroup, handleToggle,
    onAddNewEmployee, onAddEmergencyWorker, maxHeight, search, employees, filtered, debugContext,
  } = props;

  // Build flat item list (headers + rows + add button).
  const items = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (const emp of sorted) {
      if (!selected.includes(emp.id) && groupBreaks.has(emp.id)) {
        out.push({ type: "header", key: `h-${emp.id}`, group: getGroup(emp) });
      }
      out.push({ type: "row", key: emp.id, emp });
    }
    if (onAddNewEmployee) out.push({ type: "add", key: "__add__" });
    if (onAddEmergencyWorker) out.push({ type: "emergency", key: "__emergency__" });
    return out;
  }, [sorted, selected, groupBreaks, getGroup, onAddNewEmployee, onAddEmergencyWorker]);

  // Cumulative offsets for accurate windowing with mixed heights.
  const offsets = useMemo(() => {
    const arr = new Array<number>(items.length + 1);
    arr[0] = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const h =
        it.type === "header" ? HEADER_HEIGHT :
        it.type === "add" || it.type === "emergency" ? ADD_HEIGHT :
        ROW_HEIGHT;
      arr[i + 1] = arr[i] + h;
    }
    return arr;
  }, [items]);
  const totalHeight = offsets[offsets.length - 1] ?? 0;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(280);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;
    const syncHeight = () => {
      const next = el.clientHeight;
      setViewportH((prev) => (prev === next ? prev : next));
    };
    syncHeight();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncHeight);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  // Reset scroll when the underlying ordering changes drastically (e.g. new search).
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [search]);

  // Binary search for first visible item.
  const findIndex = (y: number): number => {
    let lo = 0, hi = items.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] <= y) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };

  let startIdx = 0;
  let endIdx = items.length;
  if (items.length > 0) {
    startIdx = Math.max(0, findIndex(scrollTop) - OVERSCAN);
    endIdx = Math.min(items.length, findIndex(scrollTop + viewportH) + 1 + OVERSCAN);
  }

  const visible = items.slice(startIdx, endIdx);
  const offsetTop = offsets[startIdx] ?? 0;

  // Empty state (preserve admin diagnostic).
  const showEmpty = sorted.length === 0 && !onAddNewEmployee;

  return (
    <div
      ref={containerRef}
      className="border rounded-xl overflow-y-auto"
      style={{ maxHeight }}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      {showEmpty ? (
        <div className="p-3 space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            {search ? "No results" : "No employees"}
          </p>
          {(employees.length === 0 || (search && filtered.length === 0)) && (
            <div className="rounded-lg bg-muted/40 border border-border/40 p-2 text-[10px] font-mono text-muted-foreground space-y-0.5">
              <div className="flex justify-between gap-2">
                <span className="opacity-60">company</span>
                <span className="truncate" title={debugContext?.selectedCompanyId ?? ""}>
                  {debugContext?.companyName ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="opacity-60">companyId</span>
                <span className="truncate" title={debugContext?.selectedCompanyId ?? ""}>
                  {debugContext?.selectedCompanyId
                    ? `${debugContext.selectedCompanyId.slice(0, 8)}…`
                    : "global / null"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="opacity-60">employeesLoaded</span>
                <span>{employees.length}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="opacity-60">filteredCount</span>
                <span>{filtered.length}</span>
              </div>
              {employees.length === 0 && (
                <p className="pt-1 text-[10px] text-warning leading-snug font-sans">
                  Roster vacío para esta compañía. Verifica el contexto multi-tenant.
                </p>
              )}
              {employees.length > 0 && search && filtered.length === 0 && (
                <p className="pt-1 text-[10px] text-warning leading-snug font-sans">
                  Hay {employees.length} workers cargados pero ninguno matchea "{search}".
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ transform: `translateY(${offsetTop}px)` }}>
            {visible.map((item) => {
              if (item.type === "add") {
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={onAddNewEmployee}
                    style={{ height: ADD_HEIGHT }}
                    className="flex items-center gap-2 w-full px-2 py-2 text-xs font-semibold text-primary hover:bg-primary/[0.06] transition-colors border-t border-border/20"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    + Add new employee
                  </button>
                );
              }
              if (item.type === "emergency") {
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={onAddEmergencyWorker}
                    style={{ height: ADD_HEIGHT }}
                    className="flex items-center gap-2 w-full px-2 py-2 text-xs font-semibold text-amber-800 bg-amber-50/60 hover:bg-amber-100 transition-colors border-t border-amber-200"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    + Emergency worker (pending identity)
                  </button>
                );
              }
              if (item.type === "header") {
                const labels: Record<GroupKey, { label: string; color: string; icon: React.ReactNode }> = {
                  ready: { label: `Disponibles · ${readyCount}`, color: "text-earning", icon: <UserCheck className="h-2.5 w-2.5" /> },
                  warning: { label: "Con conflicto", color: "text-warning", icon: <AlertTriangle className="h-2.5 w-2.5" /> },
                  blocked: { label: "No disponibles", color: "text-destructive", icon: <CalendarOff className="h-2.5 w-2.5" /> },
                  inactive: { label: "No asignables — pendientes, históricos, placeholders e inactivos", color: "text-muted-foreground", icon: <PauseCircle className="h-2.5 w-2.5" /> },
                };
                const g = labels[item.group];
                return (
                  <div
                    key={item.key}
                    style={{ height: HEADER_HEIGHT }}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 bg-muted/40 text-[8px] font-bold uppercase tracking-wider border-b border-border/20",
                      g.color,
                    )}
                  >
                    {g.icon} {g.label}
                  </div>
                );
              }
              if (item.type !== "row") return null;
              const emp = item.emp;
              const isSelected = selected.includes(emp.id);
              const conflicts = conflictMap.get(emp.id);
              const hasConflict = !!conflicts?.length;
              const unavailableReason = unavailableMap.get(emp.id);
              const isUnavailable = !!unavailableReason;
              const isInactive = emp.is_active === false;
              const isHardBlocked =
                isInactive ||
                (isUnavailable && availabilityBlockMode === "hard" && !isSelected);
              const empIsDriver = isEmployeeDriver(emp);
              const profileIncomplete = isProfileIncomplete(emp);
              const dupReason = dupHints.reasonById.get(emp.id);

              const view = buildWorkerEntityView(
                emp as unknown as WorkerEntityInput,
                {
                  blocked: isHardBlocked,
                  blockedReason: unavailableReason,
                  attention: profileIncomplete || hasConflict,
                  assignedToday: isSelected,
                  isDriver: empIsDriver,
                  duplicate: !!dupReason,
                },
                `${formatPersonName(emp.first_name)} ${formatPersonName(emp.last_name)}`,
              );

              return (
                <label
                  key={item.key}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    "block border-b border-border/10",
                    isHardBlocked ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                  )}
                >
                  <EntityCard
                    bare
                    density="compact"
                    kind="worker"
                    name={view.name}
                    reference={view.reference}
                    avatarUrl={emp.avatar_url}
                    primaryDetail={emp.phone_number ?? emp.email ?? undefined}
                    status={view.status}
                    statusLabel={view.statusLabel}
                    badges={view.badges}
                    maxBadges={2}
                    selected={isSelected}
                    note={
                      isUnavailable && !isInactive
                        ? unavailableReason
                        : hasConflict && !isInactive
                          ? `${conflicts![0].shiftTitle} (${conflicts![0].time})`
                          : undefined
                    }
                    leading={
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggle(emp.id)}
                        disabled={isHardBlocked}
                        className="shrink-0 h-3.5 w-3.5"
                      />
                    }
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
