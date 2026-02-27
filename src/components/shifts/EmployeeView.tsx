import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { ShiftCard } from "./ShiftCard";
import type { Shift, Assignment, Employee, SelectOption } from "./types";

interface EmployeeViewProps {
  employees: Employee[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: SelectOption[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
}

export function EmployeeView({ employees, shifts, assignments, locations, clients, onShiftClick, onDropOnShift }: EmployeeViewProps) {
  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;
  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name;
  const clientIds = clients.map(c => c.id);

  const employeeShifts = employees.map(emp => {
    const empAssignments = assignments.filter(a => a.employee_id === emp.id);
    const empShifts = empAssignments
      .map(a => shifts.find(s => s.id === a.shift_id))
      .filter(Boolean) as Shift[];
    return { employee: emp, shifts: empShifts };
  }).filter(e => e.shifts.length > 0);

  const unassignedShifts = shifts.filter(s => !assignments.some(a => a.shift_id === s.id));

  const renderDropZone = (shift: Shift) => (
    <div
      key={shift.id}
      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/30", "rounded-xl"); }}
      onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/30", "rounded-xl"); }}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.classList.remove("ring-2", "ring-primary/30", "rounded-xl");
        const data = e.dataTransfer.getData("application/assignment");
        if (data) onDropOnShift(shift.id, data);
      }}
    >
      <ShiftCard
        shift={shift}
        assignmentCount={assignments.filter(a => a.shift_id === shift.id).length}
        locationName={getLocationName(shift.location_id)}
        clientName={getClientName(shift.client_id)}
        clientIds={clientIds}
        onClick={() => onShiftClick(shift)}
        showDate
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {employeeShifts.length === 0 && unassignedShifts.length === 0 && (
        <p className="text-sm text-muted-foreground/40 text-center py-12">No hay turnos en este período</p>
      )}

      {employeeShifts.map(({ employee, shifts: empShifts }) => (
        <div key={employee.id} className="rounded-2xl border border-border/20 bg-white/60 dark:bg-card/40 p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <EmployeeAvatar firstName={employee.first_name} lastName={employee.last_name} size="sm" />
            <div>
              <p className="text-sm font-semibold">{employee.first_name} {employee.last_name}</p>
              <p className="text-[10px] text-muted-foreground/50">{empShifts.length} turno{empShifts.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {empShifts.sort((a, b) => a.date.localeCompare(b.date)).map(renderDropZone)}
          </div>
        </div>
      ))}

      {unassignedShifts.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-slate-50/50 dark:bg-slate-900/20 p-4">
          <p className="text-xs font-medium text-muted-foreground/50 mb-3">Sin asignar</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {unassignedShifts.sort((a, b) => a.date.localeCompare(b.date)).map(renderDropZone)}
          </div>
        </div>
      )}
    </div>
  );
}
