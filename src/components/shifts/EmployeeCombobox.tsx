import { useState, useMemo } from "react";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Search, AlertTriangle, X, CalendarOff, Car, Users, Zap, UserCheck, Filter } from "lucide-react";
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
  /** When true, show bulk actions for speed */
  showBulkActions?: boolean;
  /** Remaining slots to fill */
  remainingSlots?: number;
  /** Whether shift requires a driver */
  requiresDriver?: boolean;
}

interface ConflictInfo {
  shiftTitle: string;
  time: string;
}

function getConflicts(
  employeeId: string, shiftDate: string | undefined, shiftStart: string | undefined,
  shiftEnd: string | undefined, shifts: Shift[], assignments: Assignment[],
): ConflictInfo[] {
  if (!shiftDate || !shiftStart || !shiftEnd) return [];
  const empAssignments = assignments.filter(a => a.employee_id === employeeId);
  const empShiftIds = new Set(empAssignments.map(a => a.shift_id));
  return shifts
    .filter(s => {
      if (!empShiftIds.has(s.id)) return false;
      if (s.date !== shiftDate) return false;
      const sStart = s.start_time.slice(0, 5);
      const sEnd = s.end_time.slice(0, 5);
      return shiftStart < sEnd && shiftEnd > sStart;
    })
    .map(s => ({ shiftTitle: s.title, time: `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` }));
}

type QuickFilter = "all" | "available" | "drivers" | "no-conflict";
type GroupKey = "ready" | "warning" | "blocked";

const isDriver = (e: Employee) => e.has_car === "Yes" || e.has_car === "true" || e.has_car === "Sí";

export function EmployeeCombobox({
  employees, selected, onToggle, shifts = [], assignments = [], shiftDate, shiftStart, shiftEnd,
  maxHeight = "220px", showChips = true, availabilityConfigs = [], availabilityOverrides = [],
  availabilityBlockMode = "warning", showBulkActions = false, remainingSlots, requiresDriver = false,
}: EmployeeComboboxProps) {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const conflictMap = useMemo(() => {
    const map = new Map<string, ConflictInfo[]>();
    for (const emp of employees) {
      const conflicts = getConflicts(emp.id, shiftDate, shiftStart, shiftEnd, shifts, assignments);
      if (conflicts.length > 0) map.set(emp.id, conflicts);
    }
    return map;
  }, [employees, shiftDate, shiftStart, shiftEnd, shifts, assignments]);

  const unavailableMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!shiftDate || availabilityConfigs.length === 0) return map;
    for (const emp of employees) {
      const result = isEmployeeAvailable(emp.id, shiftDate, availabilityConfigs, availabilityOverrides);
      if (!result.available) map.set(emp.id, result.reason || "No disponible");
    }
    return map;
  }, [employees, shiftDate, availabilityConfigs, availabilityOverrides]);

  // Classify each employee into a group
  const getGroup = (emp: Employee): GroupKey => {
    if (unavailableMap.has(emp.id)) return "blocked";
    if (conflictMap.has(emp.id)) return "warning";
    return "ready";
  };

  const filtered = useMemo(() => {
    let list = employees;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        `${e.first_name} ${e.last_name} ${e.phone_number ?? ""} ${e.employee_role ?? ""} ${e.groups ?? ""}`.toLowerCase().includes(q)
      );
    }
    if (quickFilter === "available") list = list.filter(e => !unavailableMap.has(e.id) && !conflictMap.has(e.id));
    else if (quickFilter === "drivers") list = list.filter(e => isDriver(e));
    else if (quickFilter === "no-conflict") list = list.filter(e => !conflictMap.has(e.id));
    return list;
  }, [employees, search, quickFilter, unavailableMap, conflictMap]);

  // Smart sort: selected → ready (drivers first if needed) → warning → blocked
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aS = selected.includes(a.id) ? 0 : 1;
      const bS = selected.includes(b.id) ? 0 : 1;
      if (aS !== bS) return aS - bS;

      const aG = getGroup(a);
      const bG = getGroup(b);
      const gOrder: Record<GroupKey, number> = { ready: 0, warning: 1, blocked: 2 };
      if (gOrder[aG] !== gOrder[bG]) return gOrder[aG] - gOrder[bG];

      // Within ready group, prioritize drivers if shift needs one
      if (requiresDriver && aG === "ready" && bG === "ready") {
        const aD = isDriver(a) ? 0 : 1;
        const bD = isDriver(b) ? 0 : 1;
        if (aD !== bD) return aD - bD;
      }

      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });
  }, [filtered, selected, unavailableMap, conflictMap, requiresDriver]);

  const selectedEmps = employees.filter(e => selected.includes(e.id));
  const handleToggle = (id: string) => {
    if (availabilityBlockMode === "hard" && unavailableMap.has(id) && !selected.includes(id)) return;
    onToggle(id);
  };

  // Counts
  const readyCount = employees.filter(e => getGroup(e) === "ready").length;
  const driverCount = employees.filter(e => isDriver(e)).length;
  const conflictCount = [...conflictMap.keys()].filter(id => selected.includes(id)).length;
  const unavailableCount = [...unavailableMap.keys()].filter(id => selected.includes(id)).length;

  // Bulk actions
  const selectAllReady = () => {
    const limit = remainingSlots ?? Infinity;
    let added = 0;
    for (const emp of sorted) {
      if (added >= limit) break;
      if (selected.includes(emp.id)) continue;
      if (getGroup(emp) !== "ready") continue;
      onToggle(emp.id);
      added++;
    }
  };

  const selectDrivers = () => {
    for (const emp of sorted) {
      if (selected.includes(emp.id)) continue;
      if (!isDriver(emp) || getGroup(emp) === "blocked") continue;
      onToggle(emp.id);
    }
  };

  const clearSelection = () => {
    for (const id of [...selected]) onToggle(id);
  };

  // Group headers for visual separation
  let lastGroup: GroupKey | null = null;

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {showChips && selectedEmps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedEmps.map(emp => {
            const hasConflict = conflictMap.has(emp.id);
            const isUnavail = unavailableMap.has(emp.id);
            return (
              <Badge
                key={emp.id} variant="secondary"
                className={cn(
                  "text-[10px] gap-1 pl-0.5 pr-1.5 py-0.5 cursor-pointer hover:bg-destructive/10 transition-colors h-6",
                  hasConflict && "border-warning/50 bg-warning/10 text-warning",
                  isUnavail && !hasConflict && "border-destructive/50 bg-destructive/10 text-destructive",
                )}
                onClick={() => onToggle(emp.id)}
              >
                <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="xs" className="h-4 w-4 text-[6px]" />
                <span className="font-medium">{formatPersonName(emp.first_name)}</span>
                {isDriver(emp) && <Car className="h-2.5 w-2.5 text-primary/60" />}
                {isUnavail && <CalendarOff className="h-2.5 w-2.5" />}
                {hasConflict && !isUnavail && <AlertTriangle className="h-2.5 w-2.5" />}
                <X className="h-2.5 w-2.5 opacity-50" />
              </Badge>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Nombre, teléfono, rol, área..."
          className="h-8 text-xs pl-8 pr-8"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Quick filters + bulk actions row */}
      <div className="flex items-center gap-1 flex-wrap">
        {([
          { key: "all" as QuickFilter, label: "Todos", count: employees.length },
          { key: "available" as QuickFilter, label: "Disponibles", count: readyCount },
          { key: "drivers" as QuickFilter, label: "Conductores", count: driverCount },
          { key: "no-conflict" as QuickFilter, label: "Sin conflicto", count: employees.length - conflictMap.size },
        ]).map(f => (
          <button
            key={f.key} onClick={() => setQuickFilter(f.key)}
            className={cn(
              "text-[9px] font-semibold px-2 py-1 rounded-full transition-all",
              quickFilter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label} <span className="opacity-70">{f.count}</span>
          </button>
        ))}

        {/* Bulk speed actions */}
        {showBulkActions && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={selectAllReady}
              className="text-[9px] font-semibold px-2 py-1 rounded-full bg-earning/10 text-earning hover:bg-earning/20 transition-all flex items-center gap-0.5"
              title="Seleccionar todos los disponibles"
            >
              <Zap className="h-2.5 w-2.5" /> Llenar
            </button>
            {requiresDriver && (
              <button
                onClick={selectDrivers}
                className="text-[9px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center gap-0.5"
              >
                <Car className="h-2.5 w-2.5" /> +Drivers
              </button>
            )}
            {selected.length > 0 && (
              <button
                onClick={clearSelection}
                className="text-[9px] font-semibold px-2 py-1 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all flex items-center gap-0.5"
              >
                <X className="h-2.5 w-2.5" /> Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Employee list with group headers */}
      <div className="border rounded-xl overflow-y-auto divide-y divide-border/20" style={{ maxHeight }}>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3 text-center">
            {search ? "Sin resultados" : "No hay empleados activos"}
          </p>
        ) : (
          sorted.map(emp => {
            const isSelected = selected.includes(emp.id);
            const conflicts = conflictMap.get(emp.id);
            const hasConflict = !!conflicts && conflicts.length > 0;
            const unavailableReason = unavailableMap.get(emp.id);
            const isUnavailable = !!unavailableReason;
            const isHardBlocked = isUnavailable && availabilityBlockMode === "hard" && !isSelected;
            const empIsDriver = isDriver(emp);
            const group = getGroup(emp);

            // Show group separator
            let groupHeader: React.ReactNode = null;
            if (!isSelected && group !== lastGroup) {
              lastGroup = group;
              const labels: Record<GroupKey, { label: string; color: string; icon: React.ReactNode }> = {
                ready: { label: "Disponibles", color: "text-earning", icon: <UserCheck className="h-2.5 w-2.5" /> },
                warning: { label: "Con advertencia", color: "text-warning", icon: <AlertTriangle className="h-2.5 w-2.5" /> },
                blocked: { label: "No disponibles", color: "text-destructive", icon: <CalendarOff className="h-2.5 w-2.5" /> },
              };
              const g = labels[group];
              groupHeader = (
                <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/40 text-[9px] font-bold uppercase tracking-wider", g.color)}>
                  {g.icon} {g.label}
                </div>
              );
            }

            return (
              <div key={emp.id}>
                {groupHeader}
                <label
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 text-xs transition-colors",
                    isHardBlocked ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                    isSelected ? "bg-primary/[0.06]" : "hover:bg-accent/50",
                    hasConflict && !isSelected && "bg-warning/[0.03]",
                    isUnavailable && !hasConflict && !isSelected && "bg-destructive/[0.03]",
                  )}
                >
                  <Checkbox
                    checked={isSelected} onCheckedChange={() => handleToggle(emp.id)}
                    disabled={isHardBlocked} className="shrink-0"
                  />
                  <EmployeeAvatar
                    firstName={emp.first_name} lastName={emp.last_name}
                    avatarUrl={emp.avatar_url} gender={emp.gender} size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-semibold text-xs truncate", isUnavailable && !isSelected && "text-muted-foreground")}>
                        {formatPersonName(emp.first_name)} {formatPersonName(emp.last_name)}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {empIsDriver && (
                          <span className={cn(
                            "h-4 px-1 rounded text-[8px] font-bold flex items-center gap-0.5",
                            requiresDriver ? "bg-earning/15 text-earning ring-1 ring-earning/30" : "bg-primary/10 text-primary"
                          )}>
                            <Car className="h-2.5 w-2.5" /> {requiresDriver ? "Driver ✓" : ""}
                          </span>
                        )}
                        {emp.employee_role && (
                          <span className="h-4 px-1.5 rounded bg-muted text-muted-foreground text-[8px] font-medium truncate max-w-[60px]">
                            {formatDisplayText(emp.employee_role, "label")}
                          </span>
                        )}
                        {!emp.user_id && (
                          <span className="h-4 px-1 rounded bg-warning/10 text-warning text-[8px] font-bold">Nuevo</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {emp.phone_number && (
                        <span className="text-[9px] text-muted-foreground/60 tabular-nums">{emp.phone_number}</span>
                      )}
                      {emp.groups && (
                        <span className="text-[9px] text-muted-foreground/50 truncate max-w-[80px]">{emp.groups.split(",")[0].trim()}</span>
                      )}
                    </div>
                    {isUnavailable && (
                      <p className="text-[9px] text-destructive flex items-center gap-0.5 mt-0.5">
                        <CalendarOff className="h-2.5 w-2.5 shrink-0" /> {unavailableReason}
                      </p>
                    )}
                    {hasConflict && !isUnavailable && (
                      <p className="text-[9px] text-warning flex items-center gap-0.5 mt-0.5">
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> {conflicts![0].shiftTitle} ({conflicts![0].time})
                      </p>
                    )}
                  </div>
                </label>
              </div>
            );
          })
        )}
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
        <span>{filtered.length} empleados{quickFilter !== "all" && " (filtrado)"}</span>
        <span className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="font-semibold text-foreground">
              {selected.length} seleccionado{selected.length !== 1 ? "s" : ""}
            </span>
          )}
          {conflictCount > 0 && <span className="text-warning font-medium">{conflictCount} conflicto{conflictCount !== 1 ? "s" : ""}</span>}
          {unavailableCount > 0 && <span className="text-destructive font-medium">{unavailableCount} no disp.</span>}
        </span>
      </div>
    </div>
  );
}
