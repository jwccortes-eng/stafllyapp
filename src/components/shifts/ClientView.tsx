import { Building2 } from "lucide-react";
import { ShiftCard } from "./ShiftCard";
import type { Shift, Assignment, SelectOption } from "./types";

interface ClientViewProps {
  clients: SelectOption[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
}

export function ClientView({ clients, shifts, assignments, locations, onShiftClick, onDropOnShift }: ClientViewProps) {
  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;

  const clientGroups = clients.map(client => {
    const clientShifts = shifts.filter(s => s.client_id === client.id);
    return { client, shifts: clientShifts };
  }).filter(g => g.shifts.length > 0);

  const noClientShifts = shifts.filter(s => !s.client_id);

  return (
    <div className="space-y-3">
      {clientGroups.length === 0 && noClientShifts.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">No hay turnos en este período</p>
      )}

      {clientGroups.map(({ client, shifts: cShifts }) => (
        <div key={client.id} className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{client.name}</p>
              <p className="text-[10px] text-muted-foreground">{cShifts.length} turno{cShifts.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {cShifts
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

      {noClientShifts.length > 0 && (
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2.5">Sin cliente asignado</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {noClientShifts
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
      )}
    </div>
  );
}
