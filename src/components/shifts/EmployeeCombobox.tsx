import { useState, useMemo, useEffect } from "react";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Search, AlertTriangle, X, CalendarOff, Car, Zap, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { isEmployeeAvailable, type AvailabilityConfig, type AvailabilityOverride } from "@/hooks/useEmployeeAvailability";
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

type QuickFilter = "all" | "available" | "drivers" | "no-conflict";
type GroupKey = "ready" | "warning" | "blocked";

const isDriver = (e: Employee) => e.has_car === "Yes" || e.has_car === "true" || e.has_car === "Sí";

export function EmployeeCombobox({
  employees, selected, onToggle, shifts = [], assignments = [], shiftDate, shiftStart, shiftEnd,
  maxHeight = "220px", showChips = true, availabilityConfigs = [], availabilityOverrides = [],
  availabilityBlockMode = "warning", showBulkActions = false, remainingSlots, requiresDriver = false,
  shiftGroup,
}: EmployeeComboboxProps) {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

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
    if (unavailableMap.has(emp.id)) return "blocked";
    if (conflictMap.has(emp.id)) return "warning";
    return "ready";
  };

  // Compute assignment frequency from all assignments (same date range proxy)
  const assignmentFreq = useMemo(() => {
    const freq = new Map<string, number>();
    for (const a of assignments) {
      freq.set(a.employee_id, (freq.get(a.employee_id) || 0) + 1);
    }
    return freq;
  }, [assignments]);

  const filtered = useMemo(() => {
    let list = employees;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        `${e.first_name} ${e.last_name} ${e.phone_number ?? ""} ${e.employee_role ?? ""} ${e.groups ?? ""}`.toLowerCase().includes(q)
      );
    }
    if (quickFilter === "available") list = list.filter(e => getGroup(e) === "ready");
    else if (quickFilter === "drivers") list = list.filter(e => isDriver(e));
    else if (quickFilter === "no-conflict") list = list.filter(e => !conflictMap.has(e.id));
    return list;
  }, [employees, search, quickFilter, unavailableMap, conflictMap]);

  // Smart sort with scoring: selected → ready (score) → warning → blocked
  const sorted = useMemo(() => {
    const normalizedShiftGroup = shiftGroup?.toLowerCase().trim();

    const score = (emp: Employee): number => {
      if (selected.includes(emp.id)) return -1000;
      const g = getGroup(emp);
      let s = g === "ready" ? 0 : g === "warning" ? 500 : 1000;

      // Within ready: boost same group, drivers when needed, frequent workers
      if (g === "ready") {
        if (requiresDriver && isDriver(emp)) s -= 50;
        if (normalizedShiftGroup && emp.groups?.toLowerCase().includes(normalizedShiftGroup)) s -= 30;
        const freq = assignmentFreq.get(emp.id) || 0;
        s -= Math.min(freq * 5, 25); // frequent workers get up to -25
        if (emp.user_id) s -= 10; // onboarded workers preferred
      }
      return s;
    };

    return [...filtered].sort((a, b) => score(a) - score(b) || `${a.first_name}`.localeCompare(`${b.first_name}`));
  }, [filtered, selected, unavailableMap, conflictMap, requiresDriver, shiftGroup, assignmentFreq]);

  const selectedEmps = employees.filter(e => selected.includes(e.id));
  const handleToggle = (id: string) => {
    if (availabilityBlockMode === "hard" && unavailableMap.has(id) && !selected.includes(id)) return;
    onToggle(id);
  };

  const readyCount = filtered.filter(e => getGroup(e) === "ready").length;
  const driverCount = employees.filter(e => isDriver(e)).length;

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
    for (const emp of sorted) {
      if (selected.includes(emp.id) || !isDriver(emp) || getGroup(emp) === "blocked") continue;
      onToggle(emp.id);
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
          autoFocus
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
          { key: "all" as QuickFilter, label: "Todos", count: employees.length },
          { key: "available" as QuickFilter, label: "Listos", count: readyCount },
          { key: "drivers" as QuickFilter, label: "Drivers", count: driverCount },
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
                <Zap className="h-2.5 w-2.5" /> Llenar {remainingSlots != null ? `(${remainingSlots})` : ""}
              </button>
            )}
            {requiresDriver && (
              <button
                onClick={selectDrivers}
                className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center gap-0.5"
              >
                <Car className="h-2.5 w-2.5" /> +Driver
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

      {/* Employee list */}
      <div className="border rounded-xl overflow-y-auto" style={{ maxHeight }}>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3 text-center">
            {search ? "Sin resultados" : "No hay empleados"}
          </p>
        ) : (
          sorted.map(emp => {
            const isSelected = selected.includes(emp.id);
            const conflicts = conflictMap.get(emp.id);
            const hasConflict = !!conflicts?.length;
            const unavailableReason = unavailableMap.get(emp.id);
            const isUnavailable = !!unavailableReason;
            const isHardBlocked = isUnavailable && availabilityBlockMode === "hard" && !isSelected;
            const empIsDriver = isDriver(emp);
            const group = getGroup(emp);

            let groupHeader: React.ReactNode = null;
            if (!isSelected && groupBreaks.has(emp.id)) {
              const labels: Record<GroupKey, { label: string; color: string; icon: React.ReactNode }> = {
                ready: { label: `Disponibles · ${readyCount}`, color: "text-earning", icon: <UserCheck className="h-2.5 w-2.5" /> },
                warning: { label: "Con advertencia", color: "text-warning", icon: <AlertTriangle className="h-2.5 w-2.5" /> },
                blocked: { label: "No disponibles", color: "text-destructive", icon: <CalendarOff className="h-2.5 w-2.5" /> },
              };
              const g = labels[group];
              groupHeader = (
                <div className={cn("flex items-center gap-1.5 px-2.5 py-1 bg-muted/40 text-[8px] font-bold uppercase tracking-wider border-b border-border/20", g.color)}>
                  {g.icon} {g.label}
                </div>
              );
            }

            return (
              <div key={emp.id}>
                {groupHeader}
                <label
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-xs transition-colors border-b border-border/10 last:border-0",
                    isHardBlocked ? "cursor-not-allowed opacity-35" : "cursor-pointer",
                    isSelected ? "bg-primary/[0.07]" : "hover:bg-accent/50",
                    hasConflict && !isSelected && "bg-warning/[0.04]",
                    isUnavailable && !hasConflict && !isSelected && "bg-destructive/[0.03]",
                  )}
                >
                  <Checkbox
                    checked={isSelected} onCheckedChange={() => handleToggle(emp.id)}
                    disabled={isHardBlocked} className="shrink-0 h-3.5 w-3.5"
                  />
                  <EmployeeAvatar
                    firstName={emp.first_name} lastName={emp.last_name}
                    avatarUrl={emp.avatar_url} gender={emp.gender} size="xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className={cn("font-semibold text-[11px] truncate", isUnavailable && !isSelected && "text-muted-foreground")}>
                        {formatPersonName(emp.first_name)} {formatPersonName(emp.last_name)}
                      </span>
                      {empIsDriver && (
                        <span className={cn(
                          "h-3.5 px-1 rounded text-[7px] font-bold flex items-center gap-0.5 shrink-0",
                          requiresDriver ? "bg-earning/15 text-earning ring-1 ring-earning/30" : "bg-primary/10 text-primary"
                        )}>
                          <Car className="h-2 w-2" />
                        </span>
                      )}
                      {emp.employee_role && (
                        <span className="h-3.5 px-1 rounded bg-muted text-muted-foreground text-[7px] font-medium truncate max-w-[50px] shrink-0">
                          {formatDisplayText(emp.employee_role, "label")}
                        </span>
                      )}
                      {!emp.user_id && (
                        <span className="h-3.5 px-1 rounded bg-warning/10 text-warning text-[7px] font-bold shrink-0">Nuevo</span>
                      )}
                    </div>
                    {/* Inline warning — single line */}
                    {isUnavailable && (
                      <p className="text-[8px] text-destructive flex items-center gap-0.5 mt-0.5 truncate">
                        <CalendarOff className="h-2 w-2 shrink-0" /> {unavailableReason}
                      </p>
                    )}
                    {hasConflict && !isUnavailable && (
                      <p className="text-[8px] text-warning flex items-center gap-0.5 mt-0.5 truncate">
                        <AlertTriangle className="h-2 w-2 shrink-0" /> {conflicts![0].shiftTitle} ({conflicts![0].time})
                      </p>
                    )}
                  </div>
                </label>
              </div>
            );
          })
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-[9px] text-muted-foreground px-0.5">
        <span>{filtered.length} trabajadores</span>
        {selected.length > 0 && (
          <span className="font-semibold text-foreground">
            {selected.length} seleccionado{selected.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
