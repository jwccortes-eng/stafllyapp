import { isSameDay, format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Sunrise, Sun, Moon, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmployeeAvatarGroup } from "@/components/ui/employee-avatar-group";
import { buildPastelMap, SHIFT_STATUS_CONFIG } from "./pastel-utils";
import { getClientColor } from "./types";
import { QuickCreatePopover } from "./QuickCreatePopover";
import type { Shift, Assignment, SelectOption, Employee } from "./types";
import type { AssignedEmployee } from "./ShiftCard";

interface QuickCreateData {
  title: string; date: string; start_time: string; end_time: string;
  client_id: string; location_id: string; slots: number;
}

interface DayViewProps {
  currentDay: Date;
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: SelectOption[];
  employees?: Employee[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
  onDuplicateToDay?: (shiftData: any, targetDate: string) => void;
  onAddShift?: (date: string) => void;
  onQuickCreate?: (data: QuickCreateData) => Promise<void>;
  onOpenFull?: (data: QuickCreateData) => void;
}

const TIME_GROUP_ICONS: Record<string, React.ReactNode> = {
  "Mañana": <Sunrise className="h-3.5 w-3.5 text-amber-400" />,
  "Tarde": <Sun className="h-3.5 w-3.5 text-orange-400" />,
  "Noche": <Moon className="h-3.5 w-3.5 text-indigo-400" />,
};

export function DayView({ currentDay, shifts, assignments, locations, clients, employees = [], onShiftClick, onDropOnShift, onDuplicateToDay, onAddShift, onQuickCreate, onOpenFull }: DayViewProps) {
  const dayShifts = shifts
    .filter(s => isSameDay(new Date(s.date + "T00:00:00"), currentDay))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const getAssignmentCount = (shiftId: string) =>
    assignments.filter(a => a.shift_id === shiftId).length;

  const getAssignedNames = (shiftId: string) =>
    assignments
      .filter(a => a.shift_id === shiftId)
      .map(a => {
        const emp = employees.find(e => e.id === a.employee_id);
        return emp ? emp.first_name : "—";
      });

  const getAssignedEmployees = (shiftId: string): AssignedEmployee[] =>
    assignments
      .filter(a => a.shift_id === shiftId)
      .map(a => {
        const emp = employees.find(e => e.id === a.employee_id);
        if (!emp) return null;
        return { firstName: emp.first_name, lastName: emp.last_name, avatarUrl: (emp as any).avatar_url ?? null, gender: (emp as any).gender ?? null };
      })
      .filter(Boolean) as AssignedEmployee[];

  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;
  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name;
  const clientIds = clients.map(c => c.id);

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
    <div className="space-y-5">
      {/* Day header */}
      <div className="text-center pb-2">
        <p className="text-lg font-semibold capitalize font-heading">
          {format(currentDay, "EEEE", { locale: es })}
        </p>
        <p className="text-sm text-muted-foreground/60">
          {format(currentDay, "d 'de' MMMM yyyy", { locale: es })}
        </p>
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground/50">
          <span>{dayShifts.length} turno{dayShifts.length !== 1 ? "s" : ""}</span>
          <span>{new Set(assignments.filter(a => dayShifts.some(s => s.id === a.shift_id)).map(a => a.employee_id)).size} trabajadores</span>
        </div>
        {onAddShift && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-8 text-xs gap-1.5 rounded-full border-dashed"
            onClick={() => onAddShift(format(currentDay, "yyyy-MM-dd"))}
          >
            <Plus className="h-3 w-3" /> Agregar turno
          </Button>
        )}
      </div>

      {timeGroups.length === 0 && (
        <div className="text-center py-16">
          <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
            <Clock className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-sm text-muted-foreground/40 font-medium">No hay turnos programados</p>
          <p className="text-[11px] text-muted-foreground/30 mt-0.5">Agrega un turno para este día</p>
        </div>
      )}

      {timeGroups.map(group => (
        <div key={group}>
          <div className="flex items-center gap-2 mb-3">
            {TIME_GROUP_ICONS[group]}
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              {group}
            </span>
            <div className="flex-1 h-px bg-border/20" />
            <span className="text-[10px] text-muted-foreground/30 font-medium">{grouped[group]!.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {grouped[group]!.map(shift => {
              const assigned = getAssignmentCount(shift.id);
              const names = getAssignedNames(shift.id);
              const totalSlots = shift.slots ?? 1;
              const isFull = assigned >= totalSlots;
              const locName = getLocationName(shift.location_id);
              const clientName = getClientName(shift.client_id);
              const statusConfig = SHIFT_STATUS_CONFIG[shift.status];

              return (
                <div
                  key={shift.id}
                  className="group bg-card border border-border/20 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => onShiftClick(shift)}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/30"); }}
                  onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/30"); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("ring-2", "ring-primary/30");
                    const data = e.dataTransfer.getData("application/assignment");
                    if (data) onDropOnShift(shift.id, data);
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold truncate">{shift.title}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mt-0.5">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="font-medium">{shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}</span>
                      </div>
                    </div>
                    {statusConfig && (
                      <span className={cn(statusConfig.className, "text-[9px] shrink-0")}>
                        {statusConfig.label}
                      </span>
                    )}
                  </div>

                  {/* Location & Client */}
                  {(locName || clientName) && (
                    <div className="space-y-1 mb-2.5">
                      {clientName && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                          <Users className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{clientName}</span>
                        </div>
                      )}
                      {locName && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{locName}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assigned workers — avatar stack */}
                  {(() => {
                    const empAvatars = getAssignedEmployees(shift.id);
                    return empAvatars.length > 0 ? (
                      <div className="mb-2">
                        <EmployeeAvatarGroup
                          employees={empAvatars}
                          max={4}
                          size="xs"
                          showNames={empAvatars.length <= 3}
                        />
                      </div>
                    ) : names.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {names.slice(0, 3).map((name, i) => (
                          <span key={i} className="pastel-pill pastel-pill-sky text-[9px] px-2 py-0.5 cursor-default">{name}</span>
                        ))}
                        {names.length > 3 && <span className="text-[9px] text-muted-foreground/40 font-medium self-center ml-0.5">+{names.length - 3}</span>}
                      </div>
                    ) : null;
                  })()}

                  {/* Capacity bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isFull ? "bg-[hsl(var(--pastel-green-text))]" :
                          assigned === 0 ? "bg-[hsl(var(--pastel-rose-text))]" :
                          "bg-[hsl(var(--pastel-yellow-text))]"
                        )}
                        style={{ width: `${Math.min(100, Math.round((assigned / totalSlots) * 100))}%` }}
                      />
                    </div>
                    <span className="text-[9px] tabular-nums text-muted-foreground/50 font-medium">
                      {assigned}/{totalSlots}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
