import { Building2 } from "lucide-react";
import { ShiftCard } from "./ShiftCard";
import { getClientColor } from "./types";
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
  const clientIds = clients.map(c => c.id);

  const clientGroups = clients.map(client => {
    const clientShifts = shifts.filter(s => s.client_id === client.id);
    return { client, shifts: clientShifts };
  }).filter(g => g.shifts.length > 0);

  const noClientShifts = shifts.filter(s => !s.client_id);

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
        clientName={clients.find(c => c.id === shift.client_id)?.name}
        clientIds={clientIds}
        onClick={() => onShiftClick(shift)}
        showDate
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {clientGroups.length === 0 && noClientShifts.length === 0 && (
        <p className="text-sm text-muted-foreground/40 text-center py-12">No hay turnos en este período</p>
      )}

      {clientGroups.map(({ client, shifts: cShifts }) => {
        const color = getClientColor(client.id, clientIds);
        return (
          <div key={client.id} className="rounded-2xl border border-border/20 bg-white/60 dark:bg-card/40 p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${color.bg}`}>
                <Building2 className={`h-4 w-4 ${color.text}`} />
              </div>
              <div>
                <p className="text-sm font-semibold">{client.name}</p>
                <p className="text-[10px] text-muted-foreground/50">{cShifts.length} turno{cShifts.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {cShifts.sort((a, b) => a.date.localeCompare(b.date)).map(renderDropZone)}
            </div>
          </div>
        );
      })}

      {noClientShifts.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-slate-50/50 dark:bg-slate-900/20 p-4">
          <p className="text-xs font-medium text-muted-foreground/50 mb-3">Sin cliente asignado</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {noClientShifts.sort((a, b) => a.date.localeCompare(b.date)).map(renderDropZone)}
          </div>
        </div>
      )}
    </div>
  );
}
