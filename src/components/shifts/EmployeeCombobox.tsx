import { useState, useMemo } from "react";
import { formatPersonName } from "@/lib/format-helpers";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Search, AlertTriangle, X, CalendarOff } from "lucide-react";
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

export function EmployeeCombobox({
  employees,
  selected,
  onToggle,
  shifts = [],
  assignments = [],
  shiftDate,
  shiftStart,
  shiftEnd,
  maxHeight = "180px",
  showChips = true,
  availabilityConfigs = [],
  availabilityOverrides = [],
  availabilityBlockMode = "warning",
}: EmployeeComboboxProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
        e.first_name.toLowerCase().includes(q) ||
        e.last_name.toLowerCase().includes(q),
    );
  }, [employees, search]);

  const conflictMap = useMemo(() => {
    const map = new Map<string, ConflictInfo[]>();
    for (const emp of employees) {
      const conflicts = getConflicts(emp.id, shiftDate, shiftStart, shiftEnd, shifts, assignments);
      if (conflicts.length > 0) map.set(emp.id, conflicts);
    }
    return map;
  }, [employees, shiftDate, shiftStart, shiftEnd, shifts, assignments]);

  // Availability check per employee for the shift date
  const unavailableMap = useMemo(() => {
    const map = new Map<string, string>(); // employeeId -> reason
    if (!shiftDate || availabilityConfigs.length === 0) return map;
    for (const emp of employees) {
      const result = isEmployeeAvailable(emp.id, shiftDate, availabilityConfigs, availabilityOverrides);
      if (!result.available) {
        map.set(emp.id, result.reason || "No disponible");
      }
    }
    return map;
  }, [employees, shiftDate, availabilityConfigs, availabilityOverrides]);

  const selectedEmps = employees.filter(e => selected.includes(e.id));

  const handleToggle = (id: string) => {
    // If hard block and unavailable, don't allow selection
    if (availabilityBlockMode === "hard" && unavailableMap.has(id) && !selected.includes(id)) {
      return; // blocked
    }
    onToggle(id);
  };

  const unavailableCount = [...unavailableMap.keys()].filter(id => selected.includes(id)).length;

  return (
    <div className="space-y-2">
      {/* Selected chips */}
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
                  "text-[11px] gap-1 pl-1 pr-1.5 py-0.5 cursor-pointer hover:bg-destructive/10 transition-colors",
                  hasConflict && "border-warning/50 bg-warning/10 text-warning",
                  isUnavailable && !hasConflict && "border-destructive/50 bg-destructive/10 text-destructive",
                )}
                onClick={() => onToggle(emp.id)}
              >
                <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" className="h-4 w-4 text-[7px]" />
                {formatPersonName(emp.first_name)} {formatPersonName(emp.last_name)?.charAt(0)}.
                {isUnavailable && <CalendarOff className="h-3 w-3" />}
                {hasConflict && !isUnavailable && <AlertTriangle className="h-3 w-3" />}
                <X className="h-3 w-3 opacity-60" />
              </Badge>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar empleado..."
          className="h-8 text-xs pl-8"
        />
      </div>

      {/* Employee list */}
      <div
        className="border rounded-lg overflow-y-auto p-1 space-y-0.5"
        style={{ maxHeight }}
      >
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2 text-center">
            {search ? "Sin resultados" : "No hay empleados activos"}
          </p>
        ) : (
          filtered.map(emp => {
            const isSelected = selected.includes(emp.id);
            const conflicts = conflictMap.get(emp.id);
            const hasConflict = !!conflicts && conflicts.length > 0;
            const unavailableReason = unavailableMap.get(emp.id);
            const isUnavailable = !!unavailableReason;
            const isHardBlocked = isUnavailable && availabilityBlockMode === "hard" && !isSelected;

            return (
              <label
                key={emp.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                  isHardBlocked ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                  isSelected ? "bg-primary/5" : "hover:bg-accent",
                  hasConflict && "bg-warning/5",
                  isUnavailable && !hasConflict && !isSelected && "bg-destructive/5",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => handleToggle(emp.id)}
                  disabled={isHardBlocked}
                />
                <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <span className={cn("font-medium", isUnavailable && !isSelected && "text-muted-foreground")}>
                    {formatPersonName(emp.first_name)} {formatPersonName(emp.last_name)}
                  </span>
                  {isUnavailable && (
                    <p className="text-[10px] text-destructive flex items-center gap-1 mt-0.5">
                      <CalendarOff className="h-3 w-3 shrink-0" />
                      {unavailableReason}
                    </p>
                  )}
                  {hasConflict && !isUnavailable && (
                    <p className="text-[10px] text-warning flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Conflicto: {conflicts![0].shiftTitle} ({conflicts![0].time})
                    </p>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>

      {/* Summary */}
      <p className="text-[10px] text-muted-foreground">
        {selected.length > 0 ? (
          <>
            <span className="font-semibold text-foreground">{selected.length}</span> seleccionado{selected.length !== 1 ? "s" : ""}
            {conflictMap.size > 0 && (
              <span className="text-warning ml-1">
                · {[...conflictMap.keys()].filter(id => selected.includes(id)).length} con conflicto
              </span>
            )}
            {unavailableCount > 0 && (
              <span className="text-destructive ml-1">
                · {unavailableCount} no disponible{unavailableCount !== 1 ? "s" : ""}
              </span>
            )}
          </>
        ) : (
          <>
            {employees.length} disponibles
            {unavailableMap.size > 0 && shiftDate && (
              <span className="text-destructive ml-1">
                · {unavailableMap.size} no disponible{unavailableMap.size !== 1 ? "s" : ""}
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
