import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock, MapPin, Users, CalendarDays, FileText, Navigation,
  AlertCircle, LogIn, LogOut, MessageCircle, Star, Timer, Copy, ExternalLink,
  CheckCircle2, XCircle, Briefcase, ScanLine, Phone, Shield, Car,
  ChevronRight,
} from "lucide-react";
import { ShiftReviewButton } from "@/components/reviews/ShiftReviewButton";
import { NavigationButtons } from "@/components/navigation/NavigationButtons";
import { format, parseISO, differenceInMinutes, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
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
  if (diff < 0 || diff > 24 * 60 * 60 * 1000) return null;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `Empieza en ${hrs}h ${mins}m`;
  return `Empieza en ${mins}m`;
}

const statusConfig: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  confirmed: { label: "Confirmado", cls: "bg-[hsl(var(--status-confirmed)/0.1)] text-[hsl(var(--status-confirmed))]", icon: CheckCircle2 },
  pending: { label: "Pendiente", cls: "bg-[hsl(var(--status-pending)/0.1)] text-[hsl(var(--status-pending))]", icon: AlertCircle },
  rejected: { label: "Rechazado", cls: "bg-[hsl(var(--status-cancelled)/0.1)] text-[hsl(var(--status-cancelled))]", icon: XCircle },
  accepted: { label: "Aceptado", cls: "bg-[hsl(var(--status-confirmed)/0.1)] text-[hsl(var(--status-confirmed))]", icon: CheckCircle2 },
};

type DrawerTab = "info" | "team" | "chat";

export function PortalShiftDetailDrawer({ shift, assignmentStatus, open, onOpenChange }: PortalShiftDetailDrawerProps) {
  const navigate = useNavigate();
  const { employeeId } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<DrawerTab>("info");
  const [empCompanyId, setEmpCompanyId] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [clockingMethod, setClockingMethod] = useState<string | null>(null);

  useEffect(() => {
    if (employeeId) {
      supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle()
        .then(({ data }) => { if (data) setEmpCompanyId(data.company_id); });
    }
  }, [employeeId]);

  useEffect(() => {
    if (!shift?.id || !open) { setLocationCoords(null); setClockingMethod(null); return; }
    supabase.from("scheduled_shifts").select("location_id, qr_attendance_mode, locations(latitude, longitude)").eq("id", shift.id).maybeSingle()
      .then(({ data }) => {
        const loc = (data as any)?.locations;
        if (loc?.latitude && loc?.longitude) setLocationCoords({ lat: loc.latitude, lng: loc.longitude });
        else setLocationCoords(null);
        setClockingMethod((data as any)?.qr_attendance_mode || null);
      });
  }, [shift?.id, open]);

  if (!shift) return null;

  const hoursLabel = calcHours(shift.start_time?.slice(0, 5), shift.end_time?.slice(0, 5));
  const isTodayShift = isToday(parseISO(shift.date));
  const isTomorrowShift = isTomorrow(parseISO(shift.date));
  const cfg = statusConfig[assignmentStatus ?? ""] ?? statusConfig.pending;
  const StatusIcon = cfg.icon;
  const shiftCompanyId = shift.company_id || empCompanyId || "";
  const countdown = isTodayShift ? getCountdown(shift.date, shift.start_time) : null;
  const isConfirmed = assignmentStatus === "confirmed" || assignmentStatus === "accepted";

  const copyAddress = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: "Dirección copiada" });
  };

  const clockLabel = clockingMethod === "required" ? "QR obligatorio" : clockingMethod === "optional" ? "QR opcional" : "Fichaje móvil";
  const ClockMethodIcon = clockingMethod === "required" || clockingMethod === "optional" ? ScanLine : Phone;

  return (
    <Drawer open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTab("info"); }}>
      <DrawerContent className="max-h-[92vh] overflow-hidden">
        {/* ── Header ── */}
        <DrawerHeader className="pb-3 space-y-2.5 pt-4">
          {/* Countdown */}
          {countdown && isConfirmed && (
            <div className="bg-primary/[0.06] rounded-xl px-3.5 py-2 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] font-bold text-primary tracking-wide">{countdown}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {shift.shift_code && (
                <span className="text-[9px] font-mono font-bold text-primary bg-primary/10 rounded-md px-1.5 py-0.5">
                  #{shift.shift_code.padStart(4, "0")}
                </span>
              )}
              {isTodayShift && (
                <span className="text-[8px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground uppercase tracking-widest">HOY</span>
              )}
              {isTomorrowShift && (
                <span className="text-[8px] px-2 py-0.5 rounded-full font-bold bg-accent text-accent-foreground uppercase tracking-widest">MAÑANA</span>
              )}
            </div>
            <Badge className={cn("text-[9px] px-2.5 py-0.5 font-bold rounded-full border-0", cfg.cls)}>
              <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
              {cfg.label}
            </Badge>
          </div>

          <DrawerTitle className="text-left text-lg font-bold leading-snug line-clamp-2">{shift.title}</DrawerTitle>

          {/* Client */}
          {shift.client && (
            <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3 w-3 text-primary/40" />
              {shift.client.name}
            </p>
          )}
        </DrawerHeader>

        {/* Tab bar */}
        <div className="px-4 pb-3 flex items-center gap-1 bg-muted/30 mx-4 rounded-xl p-1">
          {(["info", "team", "chat"] as DrawerTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all",
                tab === t
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "info" && <><CalendarDays className="h-3 w-3" /> Detalles</>}
              {t === "team" && <><Users className="h-3 w-3" /> Equipo</>}
              {t === "chat" && <><MessageCircle className="h-3 w-3" /> Chat</>}
            </button>
          ))}
        </div>

        <div className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: "calc(92vh - 200px)" }}>
          {tab === "info" && (
            <div className="space-y-3">
              {/* ── A. Schedule block ── */}
              <div className="rounded-xl bg-muted/30 p-3.5 space-y-2">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Horario</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-base font-bold text-foreground tabular-nums">
                      {shift.start_time?.slice(0, 5)} → {shift.end_time?.slice(0, 5)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground/50 bg-muted/50 px-2 py-0.5 rounded-full font-medium">{hoursLabel}</span>
                </div>
                <p className="text-[12px] text-muted-foreground capitalize">
                  {format(parseISO(shift.date), "EEEE d 'de' MMMM yyyy", { locale: es })}
                </p>
              </div>

              {/* ── B. Location block ── */}
              {shift.location && (
                <div className="rounded-xl bg-muted/30 p-3.5 space-y-2">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Ubicación</p>
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-[13px] font-semibold flex-1">{shift.location.name}</p>
                    <button
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground/40 hover:text-foreground transition-colors"
                      onClick={() => copyAddress(shift.location!.name)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {locationCoords && (
                    <NavigationButtons latitude={locationCoords.lat} longitude={locationCoords.lng} label="Navegar" />
                  )}
                </div>
              )}

              {/* ── C. Meeting Point ── */}
              {shift.meeting_point && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.meeting_point)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-3.5 rounded-xl bg-primary/[0.04] border border-primary/10 hover:bg-primary/[0.07] transition-colors group"
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Navigation className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] uppercase tracking-widest text-primary/50 font-bold">Punto de encuentro</p>
                    <p className="text-[13px] font-semibold group-hover:underline mt-0.5">{shift.meeting_point}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-primary/30" />
                </a>
              )}

              {/* ── D. Clocking block ── */}
              <div className="rounded-xl bg-muted/30 p-3.5">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold mb-2">Método de fichaje</p>
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
                    <ClockMethodIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{clockLabel}</p>
                    {clockingMethod === "required" && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Escanea el QR en la ubicación para fichar</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── E. Instructions ── */}
              {shift.special_instructions && (
                <div className="rounded-xl bg-[hsl(var(--status-pending)/0.05)] border border-[hsl(var(--status-pending)/0.15)] p-3.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-[hsl(var(--status-pending))] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-[hsl(var(--status-pending))] font-bold">Instrucciones</p>
                      <p className="text-[13px] mt-1 leading-relaxed text-foreground">{shift.special_instructions}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── F. Notes ── */}
              {shift.notes && (
                <div className="rounded-xl bg-muted/30 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <FileText className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Notas</p>
                      <p className="text-[13px] mt-1 leading-relaxed">{shift.notes}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── G. Payment disclaimer ── */}
              <p className="text-[10px] text-muted-foreground/40 leading-relaxed px-1 italic">
                Las horas programadas son estimadas. La nómina se calcula con las horas reales fichadas.
              </p>

              {/* ── H. Review ── */}
              {shift.status === "completed" && employeeId && shiftCompanyId && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/30">
                  <Star className="h-4 w-4 text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Evaluar turno</p>
                  </div>
                  <ShiftReviewButton
                    shiftId={shift.id}
                    companyId={shiftCompanyId}
                    reviewerType="employee"
                    reviewerId={employeeId}
                  />
                </div>
              )}

              {/* ── I. Primary action ── */}
              {isConfirmed && isTodayShift && (
                <Button
                  size="lg"
                  className="w-full h-12 text-sm gap-2.5 font-bold rounded-xl shadow-lg shadow-primary/20"
                  onClick={() => { onOpenChange(false); navigate(`/portal/clock?shiftId=${shift.id}`); }}
                >
                  <LogIn className="h-4.5 w-4.5" />
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
