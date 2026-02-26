import { isSameDay, format } from "date-fns";
import { es } from "date-fns/locale";
import { ShiftCard } from "./ShiftCard";
import type { Shift, Assignment, SelectOption } from "./types";

interface DayViewProps {
  currentDay: Date;
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: SelectOption[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
  onDuplicateToDay?: (shiftData: any, targetDate: string) => void;
}

export function DayView({ currentDay, shifts, assignments, locations, clients, onShiftClick, onDropOnShift, onDuplicateToDay }: DayViewProps) {
  const dayShifts = shifts
    .filter(s => isSameDay(new Date(s.date + "T00:00:00"), currentDay))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const getAssignmentCount = (shiftId: string) =>
    assignments.filter(a => a.shift_id === shiftId).length;

  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;

  const clientIds = clients.map(c => c.id);

  // Group by time slots (morning, afternoon, evening)
  const getTimeGroup = (time: string) => {
    const hour = parseInt(time.slice(0, 2));
    if (hour < 12) return "Mañana";
    if (hour < 18) return "Tarde";
    return "Noche";
  };

  const grouped = dayShifts.reduce<Record<string, Shift[]>>((acc, shift) => {
    const group = getTimeGroup(shift.start_time);
    if (!acc[group]) acc[group] = [];
    acc[group].push(shift);
    return acc;
  }, {});

  const timeGroups = ["Mañana", "Tarde", "Noche"].filter(g => grouped[g]?.length);

  return (
    <div className="space-y-4">
      {/* Day header */}
      <div className="text-center pb-2">
        <p className="text-lg font-semibold capitalize">
          {format(currentDay, "EEEE", { locale: es })}
        </p>
        <p className="text-sm text-muted-foreground">
          {format(currentDay, "d 'de' MMMM yyyy", { locale: es })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {dayShifts.length} turno{dayShifts.length !== 1 ? "s" : ""} programado{dayShifts.length !== 1 ? "s" : ""}
        </p>
      </div>

      {timeGroups.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">No hay turnos programados para este día</p>
        </div>
      )}

      {timeGroups.map(group => (
        <div key={group}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {group}
            </span>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {grouped[group]!.map(shift => (
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
                  assignmentCount={getAssignmentCount(shift.id)}
                  locationName={getLocationName(shift.location_id)}
                  clientName={clients.find(c => c.id === shift.client_id)?.name}
                  clientIds={clientIds}
                  onClick={() => onShiftClick(shift)}
                  draggable
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
