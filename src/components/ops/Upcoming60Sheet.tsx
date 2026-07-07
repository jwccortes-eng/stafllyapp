/**
 * Upcoming60Sheet — Drawer/Sheet listing shifts starting in the next 60
 * minutes. Presentational; consumes already-loaded `TodayOpsShift[]` from
 * `useTodayOperations`. No new queries. No writes.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, CheckCircle2, Clock, MapPin, UserPlus, Users, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodayOpsShift } from "@/hooks/useTodayOperations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shifts: TodayOpsShift[];
}

type ItemState = "complete" | "needs_staff" | "incomplete" | "upcoming";

function deriveState(s: TodayOpsShift): ItemState {
  const missingSite = !s.location_id && !s.job_site_name;
  const missingMeeting = !s.meeting_point_location_id && !s.meeting_point;
  const missingClient = !s.client_id && !s.client_name;
  if (missingSite || missingMeeting || missingClient) return "incomplete";
  if (s.ops.assigned_active < (s.slots ?? 1)) return "needs_staff";
  if (s.ops.assigned_active >= (s.slots ?? 1)) return "complete";
  return "upcoming";
}

const STATE_UI: Record<ItemState, { label: string; cls: string; icon: React.ReactNode }> = {
  complete:    { label: "Completo",       cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: <CheckCircle2 className="h-3 w-3" /> },
  needs_staff: { label: "Necesita staff", cls: "bg-amber-500/10 text-amber-800 dark:text-amber-200",       icon: <UserPlus className="h-3 w-3" /> },
  incomplete:  { label: "Incompleto",     cls: "bg-destructive/10 text-destructive",                       icon: <AlertTriangle className="h-3 w-3" /> },
  upcoming:    { label: "Próximo",        cls: "bg-primary/10 text-primary",                               icon: <Clock className="h-3 w-3" /> },
};

function fmtStart(date: string, time: string): string {
  try {
    return format(parseISO(`${date}T${time}`), "h:mm a");
  } catch {
    return time?.slice(0, 5) ?? "—";
  }
}

export default function Upcoming60Sheet({ open, onOpenChange, shifts }: Props) {
  const navigate = useNavigate();
  const items = useMemo(() => {
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 60_000);
    return shifts
      .filter((s) => {
        const start = new Date(`${s.date}T${s.start_time}`);
        return start >= now && start <= in60;
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [shifts]);

  const go = (path: string) => {
    onOpenChange(false);
    setTimeout(() => navigate(path), 0);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            Próximos 60 minutos
          </SheetTitle>
          <SheetDescription className="text-xs">
            Turnos que inician en la próxima hora. Datos operativos en vivo — no calcula payroll.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2.5">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground">
                No hay turnos iniciando en los próximos 60 minutos.
              </p>
            </div>
          ) : (
            items.map((s) => {
              const state = deriveState(s);
              const ui = STATE_UI[state];
              const slots = s.slots ?? 1;
              return (
                <div
                  key={s.id}
                  className="rounded-xl border bg-card p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {s.title || s.client_name || "Turno"}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        Inicia {fmtStart(s.date, s.start_time)}
                      </p>
                    </div>
                    <Badge className={cn("gap-1 h-5 text-[10px] px-1.5", ui.cls)} variant="outline">
                      {ui.icon}
                      {ui.label}
                    </Badge>
                  </div>

                  {(s.job_site_name || s.meeting_point_location_name || s.meeting_point) && (
                    <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="truncate">
                        {s.job_site_name ?? "Sin sitio"}
                        {(s.meeting_point_location_name || s.meeting_point) && (
                          <> · Meeting: {s.meeting_point_location_name ?? s.meeting_point}</>
                        )}
                      </span>
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Cobertura{" "}
                      <span className="font-semibold text-foreground tabular-nums">
                        {s.ops.assigned_active}/{slots}
                      </span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {state === "needs_staff" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1"
                          onClick={() => go("/app/staffing-center?filter=needs-staffing")}
                        >
                          <UserPlus className="h-3 w-3" />
                          Staffing
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => go("/app/daily-ops?when=today")}
                      >
                        <Radio className="h-3 w-3" />
                        Daily Ops
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => go(`/app/shifts?tab=today&shift=${s.id}`)}
                      >
                        Abrir turno
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
