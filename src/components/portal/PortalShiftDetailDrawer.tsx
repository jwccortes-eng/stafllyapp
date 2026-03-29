import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock, MapPin, Users, CalendarDays, FileText, Navigation,
  AlertCircle, LogIn, MessageCircle, Star, Timer, Copy, ExternalLink,
  CheckCircle2, XCircle,
} from "lucide-react";
import { ShiftReviewButton } from "@/components/reviews/ShiftReviewButton";
import { NavigationButtons } from "@/components/navigation/NavigationButtons";
import { format, parseISO, differenceInMinutes, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShiftTeamPanel } from "@/components/shifts/ShiftTeamPanel";
import { ShiftChatPanel } from "@/components/shifts/ShiftChatPanel";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  location?: { name: string; latitude?: number | null; longitude?: number | null } | null;
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
  const s = new Date(`2000-01-01T${start}`);
  let e = new Date(`2000-01-01T${end}`);
  if (e <= s) e = new Date(e.getTime() + 86400000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

function getCountdown(dateStr: string, startTime: string): string | null {
  const now = new Date();
  const [h, m] = startTime.split(":").map(Number);
  const shiftStart = parseISO(dateStr);
  shiftStart.setHours(h, m, 0, 0);
  const diff = shiftStart.getTime() - now.getTime();
  if (diff < 0) return null;
  if (diff > 24 * 60 * 60 * 1000) return null;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `Empieza en ${hrs}h ${mins}m`;
  return `Empieza en ${mins}m`;
}

const statusConfig: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  confirmed: { label: "Confirmado", cls: "bg-earning/10 text-earning", icon: CheckCircle2 },
  pending: { label: "Pendiente de confirmar", cls: "bg-warning/10 text-warning", icon: AlertCircle },
  rejected: { label: "Rechazado", cls: "bg-deduction/10 text-deduction", icon: XCircle },
  accepted: { label: "Aceptado", cls: "bg-earning/10 text-earning", icon: CheckCircle2 },
};

type DrawerTab = "info" | "team" | "chat";

export function PortalShiftDetailDrawer({ shift, assignmentStatus, open, onOpenChange }: PortalShiftDetailDrawerProps) {
  const navigate = useNavigate();
  const { employeeId } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<DrawerTab>("info");
  const [empCompanyId, setEmpCompanyId] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (employeeId) {
      supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle()
        .then(({ data }) => { if (data) setEmpCompanyId(data.company_id); });
    }
  }, [employeeId]);

  useEffect(() => {
    if (!shift?.id || !open) { setLocationCoords(null); return; }
    supabase.from("scheduled_shifts").select("location_id, locations(latitude, longitude)").eq("id", shift.id).maybeSingle()
      .then(({ data }) => {
        const loc = (data as any)?.locations;
        if (loc?.latitude && loc?.longitude) setLocationCoords({ lat: loc.latitude, lng: loc.longitude });
        else setLocationCoords(null);
      });
  }, [shift?.id, open]);

  if (!shift) return null;

  const hoursLabel = calcHours(shift.start_time?.slice(0, 5), shift.end_time?.slice(0, 5));
  const isTodayShift = isToday(parseISO(shift.date));
  const cfg = statusConfig[assignmentStatus ?? ""] ?? statusConfig.pending;
  const StatusIcon = cfg.icon;
  const shiftCompanyId = shift.company_id || empCompanyId || "";
  const countdown = isTodayShift ? getCountdown(shift.date, shift.start_time) : null;
  const isConfirmed = assignmentStatus === "confirmed" || assignmentStatus === "accepted";

  const copyAddress = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: "Dirección copiada al portapapeles" });
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTab("info"); }}>
      <DrawerContent className="max-h-[90vh]">
        {/* ── A. Header Summary ── */}
        <DrawerHeader className="pb-3 space-y-3">
          {/* Countdown banner */}
          {countdown && isConfirmed && (
            <div className="bg-primary/8 rounded-xl px-3.5 py-2 flex items-center gap-2 -mx-2">
              <Timer className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-primary">{countdown}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {shift.shift_code && (
                <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 rounded-md px-1.5 py-0.5">
                  #{shift.shift_code.padStart(4, "0")}
                </span>
              )}
              {isTodayShift && (
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground uppercase tracking-wider">HOY</span>
              )}
            </div>
            <Badge className={cn("text-[10px] px-2.5 py-0.5 font-bold rounded-full border-0", cfg.cls)}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {cfg.label}
            </Badge>
          </div>

          <DrawerTitle className="text-left text-lg font-bold leading-snug">{shift.title}</DrawerTitle>

          {/* Date + time prominent */}
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" />
              {shift.start_time?.slice(0, 5)} → {shift.end_time?.slice(0, 5)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">{hoursLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            {format(parseISO(shift.date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </DrawerHeader>

        {/* Tab bar */}
        <div className="px-4 pb-3 flex items-center gap-1">
          {(["info", "team", "chat"] as DrawerTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all",
                tab === t
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              {t === "info" && <><CalendarDays className="h-3.5 w-3.5" /> Detalles</>}
              {t === "team" && <><Users className="h-3.5 w-3.5" /> Equipo</>}
              {t === "chat" && <><MessageCircle className="h-3.5 w-3.5" /> Chat</>}
            </button>
          ))}
        </div>

        <div className="px-4 pb-6 overflow-y-auto">
          {tab === "info" && (
            <div className="space-y-3">
              {/* ── B. Primary Action Block ── */}
              {isConfirmed && isTodayShift && (
                <Button
                  size="lg"
                  className="w-full h-12 text-sm gap-2 font-bold"
                  onClick={() => { onOpenChange(false); navigate(`/portal/clock?shiftId=${shift.id}`); }}
                >
                  <LogIn className="h-5 w-5" />
                  Marcar Entrada
                </Button>
              )}

              {/* ── C. Location Block ── */}
              {shift.client && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                  <Users className="h-5 w-5 text-primary/70 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cliente</p>
                    <p className="text-sm font-medium">{shift.client.name}</p>
                  </div>
                </div>
              )}

              {shift.location && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                    <MapPin className="h-5 w-5 text-primary/70 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Ubicación</p>
                      <p className="text-sm font-medium">{shift.location.name}</p>
                    </div>
                    <button
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                      onClick={() => copyAddress(shift.location!.name)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {locationCoords && (
                    <NavigationButtons latitude={locationCoords.lat} longitude={locationCoords.lng} label="Navegar a ubicación" />
                  )}
                </div>
              )}

              {/* Meeting Point */}
              {shift.meeting_point && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.meeting_point)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-primary/[0.04] border border-primary/15 hover:bg-primary/[0.08] transition-colors group"
                >
                  <Navigation className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-primary/60 font-semibold">Punto de encuentro</p>
                    <p className="text-sm font-medium group-hover:underline">{shift.meeting_point}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-primary/40" />
                </a>
              )}

              {/* ── E. Instructions Block ── */}
              {shift.special_instructions && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/5 border border-warning/20">
                  <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-warning font-bold">Instrucciones especiales</p>
                    <p className="text-sm mt-1 leading-relaxed">{shift.special_instructions}</p>
                  </div>
                </div>
              )}

              {shift.notes && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                  <FileText className="h-5 w-5 text-muted-foreground/60 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Notas del turno</p>
                    <p className="text-sm mt-1 leading-relaxed">{shift.notes}</p>
                  </div>
                </div>
              )}

              {/* ── F. Payment disclaimer ── */}
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                  💡 Las horas programadas son estimadas. La nómina se calcula con las horas reales fichadas.
                </p>
              </div>

              {/* Review button for completed */}
              {shift.status === "completed" && employeeId && shiftCompanyId && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                  <Star className="h-5 w-5 text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Evaluar este trabajo</p>
                  </div>
                  <ShiftReviewButton
                    shiftId={shift.id}
                    companyId={shiftCompanyId}
                    reviewerType="employee"
                    reviewerId={employeeId}
                  />
                </div>
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
