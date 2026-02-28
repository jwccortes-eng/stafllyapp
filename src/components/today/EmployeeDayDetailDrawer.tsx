import { format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, MapPin, Users, LogIn, LogOut, Coffee, CalendarDays, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Separator } from "@/components/ui/separator";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  status: string;
  scheduled_shifts?: { id: string; title: string; start_time: string; end_time: string } | null;
}

interface ScheduledInfo {
  title: string;
  start_time: string;
  end_time: string;
  location_name?: string;
  client_name?: string;
}

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  activeEntry?: TimeEntry;
  completedEntries: TimeEntry[];
  scheduled?: ScheduledInfo;
  totalMinutes: number;
  isClockedIn: boolean;
}

interface Props {
  employee: EmployeeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now: Date;
}

const formatDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export function EmployeeDayDetailDrawer({ employee, open, onOpenChange, now }: Props) {
  if (!employee) return null;

  const allEntries = [
    ...(employee.activeEntry ? [employee.activeEntry] : []),
    ...employee.completedEntries,
  ].sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());

  const totalBreak = allEntries.reduce((sum, e) => sum + (e.break_minutes ?? 0), 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center gap-3">
            <EmployeeAvatar
              firstName={employee.first_name}
              lastName={employee.last_name}
              avatarUrl={employee.avatar_url}
              className="h-12 w-12 text-base"
            />
            <div className="flex-1 min-w-0">
              <DrawerTitle className="text-base truncate">
                {employee.first_name} {employee.last_name}
              </DrawerTitle>
              <p className="text-xs text-muted-foreground">
                {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
              </p>
            </div>
            {employee.isClockedIn ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 text-[10px] font-medium shrink-0">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                Activo
              </Badge>
            ) : employee.totalMinutes > 0 ? (
              <Badge variant="secondary" className="text-[10px] shrink-0">Completado</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">Sin actividad</Badge>
            )}
          </div>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-lg font-bold font-mono">{formatDuration(employee.totalMinutes)}</p>
              <p className="text-[10px] text-muted-foreground">Horas netas</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-lg font-bold font-mono">{allEntries.length}</p>
              <p className="text-[10px] text-muted-foreground">Fichajes</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-lg font-bold font-mono">{totalBreak > 0 ? `${totalBreak}m` : "--"}</p>
              <p className="text-[10px] text-muted-foreground">Descanso</p>
            </div>
          </div>

          {/* Scheduled shift */}
          {employee.scheduled && (
            <>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                  Turno programado
                </p>
                <div className="rounded-lg border bg-card p-3 space-y-1.5">
                  <p className="text-sm font-semibold">{employee.scheduled.title}</p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {employee.scheduled.start_time.slice(0, 5)} – {employee.scheduled.end_time.slice(0, 5)}
                    </span>
                    {employee.scheduled.location_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {employee.scheduled.location_name}
                      </span>
                    )}
                    {employee.scheduled.client_name && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {employee.scheduled.client_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Time entries timeline */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
              Registro de fichajes
            </p>
            {allEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarDays className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Sin fichajes registrados hoy</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allEntries.map((entry, idx) => {
                  const clockIn = new Date(entry.clock_in);
                  const clockOut = entry.clock_out ? new Date(entry.clock_out) : null;
                  const isActive = !entry.clock_out;
                  const duration = clockOut
                    ? differenceInMinutes(clockOut, clockIn) - (entry.break_minutes ?? 0)
                    : differenceInMinutes(now, clockIn) - (entry.break_minutes ?? 0);

                  return (
                    <div
                      key={entry.id}
                      className={`rounded-lg border p-3 space-y-2 ${isActive ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card"}`}
                    >
                      {/* Shift name if linked */}
                      {entry.scheduled_shifts && (
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {entry.scheduled_shifts.title}
                        </p>
                      )}

                      <div className="flex items-center gap-3">
                        {/* Clock in */}
                        <div className="flex items-center gap-1.5">
                          <LogIn className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-sm font-mono font-semibold">
                            {format(clockIn, "HH:mm")}
                          </span>
                        </div>

                        <ChevronRight className="h-3 w-3 text-muted-foreground/40" />

                        {/* Clock out */}
                        <div className="flex items-center gap-1.5">
                          <LogOut className={`h-3.5 w-3.5 ${isActive ? "text-muted-foreground/40" : "text-red-500"}`} />
                          <span className={`text-sm font-mono font-semibold ${isActive ? "text-muted-foreground/40" : ""}`}>
                            {clockOut ? format(clockOut, "HH:mm") : "--:--"}
                          </span>
                        </div>

                        <div className="flex-1" />

                        {/* Duration */}
                        <span className={`text-sm font-mono font-semibold ${isActive ? "text-emerald-600" : "text-foreground"}`}>
                          {formatDuration(Math.max(0, duration))}
                        </span>
                      </div>

                      {/* Break info */}
                      {(entry.break_minutes ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Coffee className="h-2.5 w-2.5" />
                          {entry.break_minutes} min descanso
                        </div>
                      )}

                      {/* Status badge */}
                      {isActive && (
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 text-[9px] px-1.5 py-0">
                          <span className="inline-block h-1 w-1 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                          En curso
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
