import { useState, useMemo } from "react";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Search, AlertTriangle, X, CalendarOff, Car, ShieldCheck, Users, Filter } from "lucide-react";
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
  /** Availability data */
  availabilityConfigs?: AvailabilityConfig[];
  availabilityOverrides?: AvailabilityOverride[];
  /** 'hard' = block, 'warning' = allow with warning */
  availabilityBlockMode?: "hard" | "warning";
}

interface ConflictInfo {
  shiftTitle: string;
  time: string;
}

function getConflicts(
  employeeId: string,
  shiftDate: string | undefined,
  shiftStart: string | undefined,
  shiftEnd: string | undefined,
  shifts: Shift[],
  assignments: Assignment[],
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
    .map(s => ({
      shiftTitle: s.title,
      time: `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`,
    }));
}

type QuickFilter = "all" | "available" | "drivers" | "no-conflict";

export function EmployeeCombobox({
  employees,
  selected,
  onToggle,
  shifts = [],
  assignments = [],
  shiftDate,
  shiftStart,
  shiftEnd,
  maxHeight = "220px",
  showChips = true,
  availabilityConfigs = [],
  availabilityOverrides = [],
  availabilityBlockMode = "warning",
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
      if (!result.available) {
        map.set(emp.id, result.reason || "No disponible");
      }
    }
    return map;
  }, [employees, shiftDate, availabilityConfigs, availabilityOverrides]);

  const filtered = useMemo(() => {
    let list = employees;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        `${e.first_name} ${e.last_name} ${e.phone_number ?? ""} ${e.employee_role ?? ""}`.toLowerCase().includes(q)
      );
    }

    // Quick filters
    if (quickFilter === "available") {
      list = list.filter(e => !unavailableMap.has(e.id) && !conflictMap.has(e.id));
    } else if (quickFilter === "drivers") {
      list = list.filter(e => e.has_car === "Yes" || e.has_car === "true" || e.has_car === "Sí");
    } else if (quickFilter === "no-conflict") {
      list = list.filter(e => !conflictMap.has(e.id));
    }

    return list;
  }, [employees, search, quickFilter, unavailableMap, conflictMap]);

  // Sort: selected first, then available, then unavailable
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aSelected = selected.includes(a.id) ? 0 : 1;
      const bSelected = selected.includes(b.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;

      const aUnavailable = unavailableMap.has(a.id) ? 1 : 0;
      const bUnavailable = unavailableMap.has(b.id) ? 1 : 0;
      if (aUnavailable !== bUnavailable) return aUnavailable - bUnavailable;

      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });
  }, [filtered, selected, unavailableMap]);

  const selectedEmps = employees.filter(e => selected.includes(e.id));

  const handleToggle = (id: string) => {
    if (availabilityBlockMode === "hard" && unavailableMap.has(id) && !selected.includes(id)) return;
    onToggle(id);
  };

  const unavailableCount = [...unavailableMap.keys()].filter(id => selected.includes(id)).length;
  const conflictCount = [...conflictMap.keys()].filter(id => selected.includes(id)).length;
  const driverCount = employees.filter(e => e.has_car === "Yes" || e.has_car === "true" || e.has_car === "Sí").length;

  const isDriver = (e: Employee) => e.has_car === "Yes" || e.has_car === "true" || e.has_car === "Sí";

  return (
    <div className="space-y-2">
      {/* Selected chips — compact */}
      {showChips && selectedEmps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedEmps.map(emp => {
            const hasConflict = conflictMap.has(emp.id);
            const isUnavailable = unavailableMap.has(emp.id);
            return (
              <Badge
                key={emp.id}
                variant="secondary"
                className={cn(
                  "text-[10px] gap-1 pl-0.5 pr-1.5 py-0.5 cursor-pointer hover:bg-destructive/10 transition-colors h-6",
                  hasConflict && "border-warning/50 bg-warning/10 text-warning",
                  isUnavailable && !hasConflict && "border-destructive/50 bg-destructive/10 text-destructive",
                )}
                onClick={() => onToggle(emp.id)}
              >
                <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="xs" className="h-4 w-4 text-[6px]" />
                <span className="font-medium">{formatPersonName(emp.first_name)}</span>
                {isDriver(emp) && <Car className="h-2.5 w-2.5 text-primary/60" />}
                {isUnavailable && <CalendarOff className="h-2.5 w-2.5" />}
                {hasConflict && !isUnavailable && <AlertTriangle className="h-2.5 w-2.5" />}
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
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Nombre, teléfono, rol..."
          className="h-8 text-xs pl-8 pr-8"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Quick filter chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {([
          { key: "all", label: "Todos", count: employees.length },
          { key: "available", label: "Disponibles", count: employees.length - unavailableMap.size - conflictMap.size },
          { key: "drivers", label: "Conductores", count: driverCount },
          { key: "no-conflict", label: "Sin conflicto", count: employees.length - conflictMap.size },
        ] as { key: QuickFilter; label: string; count: number }[]).map(f => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className={cn(
              "text-[9px] font-semibold px-2 py-1 rounded-full transition-all",
              quickFilter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
            <span className="ml-1 opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Employee list */}
      <div
        className="border rounded-xl overflow-y-auto divide-y divide-border/20"
        style={{ maxHeight }}
      >
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

            return (
              <label
                key={emp.id}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 text-xs transition-colors",
                  isHardBlocked ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                  isSelected ? "bg-primary/[0.04]" : "hover:bg-accent/50",
                  hasConflict && !isSelected && "bg-warning/[0.03]",
                  isUnavailable && !hasConflict && !isSelected && "bg-destructive/[0.03]",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => handleToggle(emp.id)}
                  disabled={isHardBlocked}
                  className="shrink-0"
                />
                <EmployeeAvatar
                  firstName={emp.first_name}
                  lastName={emp.last_name}
                  avatarUrl={emp.avatar_url}
                  gender={emp.gender}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("font-semibold text-xs truncate", isUnavailable && !isSelected && "text-muted-foreground")}>
                      {formatPersonName(emp.first_name)} {formatPersonName(emp.last_name)}
                    </span>
                    {/* Role/capability badges */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {empIsDriver && (
                        <span className="h-4 px-1 rounded bg-primary/10 text-primary text-[8px] font-bold flex items-center gap-0.5">
                          <Car className="h-2.5 w-2.5" />
                        </span>
                      )}
                      {emp.employee_role && (
                        <span className="h-4 px-1.5 rounded bg-muted text-muted-foreground text-[8px] font-medium truncate max-w-[60px]">
                          {formatDisplayText(emp.employee_role, "label")}
                        </span>
                      )}
                      {!emp.user_id && (
                        <span className="h-4 px-1 rounded bg-warning/10 text-warning text-[8px] font-bold">
                          Nuevo
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Secondary info */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {emp.phone_number && (
                      <span className="text-[9px] text-muted-foreground/60 tabular-nums">{emp.phone_number}</span>
                    )}
                    {emp.groups && (
                      <span className="text-[9px] text-muted-foreground/50 truncate max-w-[80px]">{emp.groups.split(",")[0].trim()}</span>
                    )}
                  </div>
                  {/* Warnings */}
                  {isUnavailable && (
                    <p className="text-[9px] text-destructive flex items-center gap-0.5 mt-0.5">
                      <CalendarOff className="h-2.5 w-2.5 shrink-0" />
                      {unavailableReason}
                    </p>
                  )}
                  {hasConflict && !isUnavailable && (
                    <p className="text-[9px] text-warning flex items-center gap-0.5 mt-0.5">
                      <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                      {conflicts![0].shiftTitle} ({conflicts![0].time})
                    </p>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
        <span>
          {filtered.length} empleados
          {quickFilter !== "all" && ` (filtrado)`}
        </span>
        <span className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="font-semibold text-foreground">
              {selected.length} seleccionado{selected.length !== 1 ? "s" : ""}
            </span>
          )}
          {conflictCount > 0 && (
            <span className="text-warning font-medium">
              {conflictCount} conflicto{conflictCount !== 1 ? "s" : ""}
            </span>
          )}
          {unavailableCount > 0 && (
            <span className="text-destructive font-medium">
              {unavailableCount} no disp.
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
