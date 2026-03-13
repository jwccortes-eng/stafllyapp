import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, Users, CalendarDays, FileText, Navigation, AlertCircle, LogIn, MessageCircle, Star } from "lucide-react";
import { ShiftReviewButton } from "@/components/reviews/ShiftReviewButton";
import { format, parseISO, differenceInMinutes, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShiftTeamPanel } from "@/components/shifts/ShiftTeamPanel";
import { ShiftChatPanel } from "@/components/shifts/ShiftChatPanel";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface ShiftInfo {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  status: string;
  slots: number | null;
  shift_code?: string | null;
  meeting_point?: string | null;
  special_instructions?: string | null;
  location?: { name: string } | null;
  client?: { name: string } | null;
  company_id?: string;
}

interface PortalShiftDetailDrawerProps {
  shift: ShiftInfo | null;
  assignmentStatus?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function calcHours(start: string, end: string): string {
  if (!start || !end) return "—";
  const today = "2000-01-01";
  const s = new Date(`${today}T${start}`);
  let e = new Date(`${today}T${end}`);
  if (e <= s) e = new Date(e.getTime() + 24 * 60 * 60 * 1000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmado", cls: "bg-earning/10 text-earning" },
  pending: { label: "Pendiente", cls: "bg-warning/10 text-warning" },
  rejected: { label: "Rechazado", cls: "bg-deduction/10 text-deduction" },
  accepted: { label: "Aceptado", cls: "bg-earning/10 text-earning" },
};

type DrawerTab = "info" | "team" | "chat";

export function PortalShiftDetailDrawer({ shift, assignmentStatus, open, onOpenChange }: PortalShiftDetailDrawerProps) {
  const navigate = useNavigate();
  const { employeeId } = useAuth();
  const [tab, setTab] = useState<DrawerTab>("info");
  const [empCompanyId, setEmpCompanyId] = useState<string>("");

  // Load company_id from employee
  useEffect(() => {
    if (employeeId) {
      supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle()
        .then(({ data }) => { if (data) setEmpCompanyId(data.company_id); });
    }
  }, [employeeId]);

  if (!shift) return null;

  const hoursLabel = calcHours(shift.start_time?.slice(0, 5), shift.end_time?.slice(0, 5));
  const isTodayShift = isToday(parseISO(shift.date));
  const cfg = statusConfig[assignmentStatus ?? ""] ?? statusConfig.pending;
  const shiftCompanyId = shift.company_id || empCompanyId || "";

  return (
    <Drawer open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTab("info"); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {shift.shift_code && (
                <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">
                  #{shift.shift_code.padStart(4, "0")}
                </span>
              )}
              {isTodayShift && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground">HOY</span>
              )}
            </div>
            <Badge className={`text-[10px] px-2 py-0.5 ${cfg.cls}`}>
              {cfg.label}
            </Badge>
          </div>
          <DrawerTitle className="text-left text-base mt-1">{shift.title}</DrawerTitle>
          <p className="text-xs text-muted-foreground capitalize text-left">
            {format(parseISO(shift.date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </DrawerHeader>

        {/* Tab bar */}
        <div className="px-4 pb-2 flex items-center gap-1">
          {(["info", "team", "chat"] as DrawerTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all",
                tab === t
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              {t === "info" && <><CalendarDays className="h-3 w-3" /> Info</>}
              {t === "team" && <><Users className="h-3 w-3" /> Equipo</>}
              {t === "chat" && <><MessageCircle className="h-3 w-3" /> Chat</>}
            </button>
          ))}
        </div>

        <div className="px-4 pb-6 overflow-y-auto">
          {tab === "info" && (
            <div className="space-y-4">
              {/* Time */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Clock className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold">
                    {shift.start_time?.slice(0, 5)} → {shift.end_time?.slice(0, 5)}
                  </p>
                  <p className="text-xs text-muted-foreground">Duración: {hoursLabel}</p>
                </div>
              </div>

              {/* Client */}
              {shift.client && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                  <Users className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cliente</p>
                    <p className="text-sm font-medium">{shift.client.name}</p>
                  </div>
                </div>
              )}

              {/* Location */}
              {shift.location && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                  <MapPin className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ubicación</p>
                    <p className="text-sm font-medium">{shift.location.name}</p>
                  </div>
                </div>
              )}

              {/* Meeting Point — clickable to Google Maps */}
              {shift.meeting_point && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.meeting_point)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-colors group"
                >
                  <Navigation className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Punto de encuentro</p>
                    <p className="text-sm group-hover:underline">{shift.meeting_point}</p>
                  </div>
                  <MapPin className="h-4 w-4 text-primary/60" />
                </a>
              )}

              {/* Special Instructions */}
              {shift.special_instructions && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/5 border border-warning/20">
                  <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-warning font-semibold">Instrucciones especiales</p>
                    <p className="text-sm mt-0.5 leading-relaxed">{shift.special_instructions}</p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {shift.notes && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Notas</p>
                    <p className="text-sm mt-0.5 leading-relaxed">{shift.notes}</p>
                  </div>
                </div>
              )}

              {/* Clock In button */}
              {assignmentStatus === "confirmed" && isTodayShift && (
                <Button
                  size="lg"
                  className="w-full h-12 text-sm gap-2 font-bold"
                  onClick={() => { onOpenChange(false); navigate(`/portal/clock?shiftId=${shift.id}`); }}
                >
                  <LogIn className="h-5 w-5" />
                  Marcar Entrada
                </Button>
              )}
            </div>
          )}

          {tab === "team" && (
            <ShiftTeamPanel shiftId={shift.id} companyId={shiftCompanyId} compact={false} />
          )}

          {tab === "chat" && shiftCompanyId && (
            <ShiftChatPanel shiftId={shift.id} shiftDate={shift.date} companyId={shiftCompanyId} isAdmin={false} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
