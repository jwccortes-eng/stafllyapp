import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { ShiftCard } from "./ShiftCard";
import type { Shift, Assignment, Employee, SelectOption } from "./types";

interface EmployeeViewProps {
  employees: Employee[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
}

export function EmployeeView({ employees, shifts, assignments, locations, onShiftClick, onDropOnShift }: EmployeeViewProps) {
  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;

  const employeeShifts = employees.map(emp => {
    const empAssignments = assignments.filter(a => a.employee_id === emp.id);
    const empShifts = empAssignments
      .map(a => shifts.find(s => s.id === a.shift_id))
      .filter(Boolean) as Shift[];
    return { employee: emp, shifts: empShifts, assignmentCount: empAssignments.length };
  }).filter(e => e.shifts.length > 0);

  const unassignedShifts = shifts.filter(s => !assignments.some(a => a.shift_id === s.id));

  return (
    <div className="space-y-3">
      {employeeShifts.length === 0 && unassignedShifts.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">No hay turnos en este período</p>
      )}

      {employeeShifts.map(({ employee, shifts: empShifts }) => (
        <div key={employee.id} className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <EmployeeAvatar firstName={employee.first_name} lastName={employee.last_name} size="sm" />
            <div>
              <p className="text-sm font-medium">{employee.first_name} {employee.last_name}</p>
              <p className="text-[10px] text-muted-foreground">{empShifts.length} turno{empShifts.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {empShifts
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(shift => (
                <div
                  key={shift.id}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40", "rounded-lg"); }}
                  onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/40", "rounded-lg"); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("ring-2", "ring-primary/40", "rounded-lg");
                    const data = e.dataTransfer.getData("application/assignment");
                    if (data) onDropOnShift(shift.id, data);
                  }}
                >
                  <ShiftCard
                    shift={shift}
                    assignmentCount={assignments.filter(a => a.shift_id === shift.id).length}
                    locationName={getLocationName(shift.location_id)}
                    onClick={() => onShiftClick(shift)}
                    showDate
                  />
                </div>
              ))}
          </div>
        </div>
      ))}

      {unassignedShifts.length > 0 && (
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2.5">Sin asignar</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {unassignedShifts
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(shift => (
                <div
                  key={shift.id}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40", "rounded-lg"); }}
                  onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/40", "rounded-lg"); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("ring-2", "ring-primary/40", "rounded-lg");
                    const data = e.dataTransfer.getData("application/assignment");
                    if (data) onDropOnShift(shift.id, data);
                  }}
                >
                  <ShiftCard
                    shift={shift}
                    assignmentCount={0}
                    locationName={getLocationName(shift.location_id)}
                    onClick={() => onShiftClick(shift)}
                    showDate
                  />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
