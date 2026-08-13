import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import { useServiceRootRefs } from "@/hooks/useServiceRootRefs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  Clock, MapPin, Users, FileText, Navigation,
  AlertCircle, LogIn, MessageCircle, Star, Copy,
  Briefcase, ScanLine, Phone, ChevronRight, X, Check, Loader2,
} from "lucide-react";
import { ShiftReviewButton } from "@/components/reviews/ShiftReviewButton";
import { NavigationButtons } from "@/components/navigation/NavigationButtons";
import { format, parseISO, differenceInMinutes, isToday, isTomorrow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShiftTeamPanel } from "@/components/shifts/ShiftTeamPanel";
import { ShiftChatPanel } from "@/components/shifts/ShiftChatPanel";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";
import { HistoricalShiftWorkSummary } from "@/components/portal/HistoricalShiftWorkSummary";
import type { WorkedShiftEntry } from "@/hooks/useWorkedShiftHistory";

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
  shift_ref?: string | null;
  meeting_point?: string | null;
  meeting_time?: string | null;
  special_instructions?: string | null;
  location?: { name: string; latitude?: number | null; longitude?: number | null } | null;
  client?: { name: string } | null;
  company_id?: string;
}

interface PortalShiftDetailDrawerProps {
  shift: ShiftInfo | null;
  assignmentStatus?: string;
  responseStatus?: string;
  onAccept?: () => void;
  onReject?: () => void;
  responding?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional H4 — read-only worked-history info for past shifts. */
  historyInfo?: WorkedShiftEntry;
  historyLoading?: boolean;
}

function calcHours(start: string, end: string): string {
  if (!start || !end) return "—";
  const s = new Date(`2000-01-01T${start}`);
  let e = new Date(`2000-01-01T${end}`);
  if (e <= s) e = new Date(e.getTime() + 86400000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
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

function getStatusMeta(status?: string): { tone: OpsStatusTone; label: string } {
  switch (status) {
    case "confirmed":
    case "accepted":
      return { tone: "success", label: "Confirmado" };
    case "needs_reacceptance":
      return { tone: "warning", label: "Re-accept" };
    case "rejected":
      return { tone: "critical", label: "Rechazado" };
    case "pending":
    default:
      return { tone: "warning", label: "Pendiente" };
  }
}

/**
 * PortalShiftDetailDrawer — single-mission detail screen.
 *
 * Design principles:
 *  • One header, one decision. No tab bar.
 *  • Information consolidated: "When & Where" merges schedule + location.
 *  • Team / Chat are sober secondary links; they push to a sub-screen
 *    (rendered inline as overlay) only when the user opts in.
 *  • Footer holds a single dominant CTA.
 */
export function PortalShiftDetailDrawer({ shift, assignmentStatus, responseStatus, onAccept, onReject, responding, open, onOpenChange, historyInfo, historyLoading }: PortalShiftDetailDrawerProps) {
  const navigate = useNavigate();
  useServiceRootRefs(shift ? [shift as any] : []);
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const { toast } = useToast();
  const [empCompanyId, setEmpCompanyId] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [clockingMethod, setClockingMethod] = useState<string | null>(null);
  const [secondaryView, setSecondaryView] = useState<"team" | "chat" | null>(null);

  useEffect(() => {
    if (employeeId) {
      supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle()
        .then(({ data }) => { if (data) setEmpCompanyId(data.company_id); });
    }
  }, [employeeId]);

  useEffect(() => {
    if (!shift?.id || !open) { setLocationCoords(null); setClockingMethod(null); setSecondaryView(null); return; }
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
  // Worker truth: prefer responseStatus when provided; fallback to assignmentStatus.
  const effectiveStatus = responseStatus ?? assignmentStatus;
  const statusMeta = getStatusMeta(effectiveStatus);
  const shiftCompanyId = shift.company_id || empCompanyId || "";
  const countdown = isTodayShift ? getCountdown(shift.date, shift.start_time) : null;
  const isAccepted = effectiveStatus === "confirmed" || effectiveStatus === "accepted";
  const isPending = effectiveStatus === "pending" || effectiveStatus === "needs_reacceptance";
  const isRejected = effectiveStatus === "rejected";
  const showResponseActions = isPending && !!(onAccept || onReject);
  const showClockInAction = isAccepted && isTodayShift;
  const showStickyFooter = !secondaryView && (showResponseActions || showClockInAction);
  // H4 — show worked-history block for past shifts (or whenever historyInfo is provided).
  const isPastShift = (() => {
    try {
      const d = parseISO(shift.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d.getTime() < today.getTime();
    } catch { return false; }
  })();
  const showHistoryBlock = isPastShift || !!historyInfo;

  const dayLabel = isTodayShift
    ? "Today"
    : isTomorrowShift
    ? "Tomorrow"
    : format(parseISO(shift.date), "EEE d MMM", { locale: es });

  const copyAddress = (text: string, label = "Dirección") => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: `${label} copiada al portapapeles` });
  };

  const clockLabel = clockingMethod === "required" ? "QR obligatorio" : clockingMethod === "optional" ? "QR opcional" : "Marcar desde el móvil";
  const ClockMethodIcon = clockingMethod === "required" || clockingMethod === "optional" ? ScanLine : Phone;

  return (
    <Drawer open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSecondaryView(null); }}>
      <DrawerContent className="max-h-[94vh] overflow-hidden p-0 bg-background">
        {/* ─── Header — one block, one identity ─── */}
        <DrawerHeader className="px-5 pt-4 pb-4 space-y-3 border-b border-border/40 bg-card sticky top-0 z-10">
          {/* Top meta — day + status */}
          <div className="flex items-center gap-2 text-[12px]">
            <span className={cn(
              "px-2 py-0.5 rounded-md font-bold uppercase tracking-widest text-[10px]",
              isTodayShift ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/80",
            )}>
              {dayLabel}
            </span>
            <span className="text-muted-foreground/60 first-letter:uppercase">
              {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
            </span>
            <div className="ml-auto">
              <OpsStatusChip tone={statusMeta.tone} label={statusMeta.label} size="sm" />
            </div>
          </div>

          {/* Title + client */}
          <div className="space-y-1">
            <DrawerTitle className="text-left text-[19px] font-bold leading-tight line-clamp-2 text-foreground">
              {shift.title}
            </DrawerTitle>
            <p className="text-[12.5px] text-muted-foreground/85 flex items-center gap-1.5">
              <Briefcase className="h-3 w-3 text-muted-foreground/55 shrink-0" />
              <span className={cn(!shift.client?.name && "italic text-muted-foreground/65")}>
                {shift.client?.name ?? "Cliente por confirmar"}
              </span>
              {getShiftDisplayIdentity(shift).primaryRefKind !== "none" && (
                <span className="ml-1 text-[10px] font-mono text-muted-foreground/55 tabular-nums">
                  · {getShiftDisplayIdentity(shift).primaryRef}
                </span>
              )}
            </p>
          </div>

          {/* Work route — Clock In protagonist, estimated end secondary */}
          <div className="flex items-end gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/65 leading-none mb-1">
                Clock In
              </p>
              <p className="text-[34px] leading-none font-bold font-mono tabular-nums text-foreground">
                {shift.start_time?.slice(0, 5)}
              </p>
              <p className="text-[10.5px] text-muted-foreground/65 mt-1.5 tabular-nums">
                Ends approx. {shift.end_time?.slice(0, 5)} · {hoursLabel} estimadas
              </p>
            </div>
          </div>

          {/* Countdown — only when actionable */}
          {countdown && isAccepted && (
            <div className="flex items-center gap-2 text-[10.5px] font-bold text-primary bg-primary/[0.06] rounded-lg px-2.5 py-1.5 border border-primary/10">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="tracking-wide uppercase">{countdown}</span>
            </div>
          )}
        </DrawerHeader>

        {/* ─── Content ─── */}
        <div
          className="px-5 pb-6 overflow-y-auto"
          style={{ maxHeight: showStickyFooter ? "calc(94vh - 280px)" : "calc(94vh - 200px)" }}
        >
          {!secondaryView && (
            <div className="space-y-4 pt-4">
              {/* H4 — Historical worked summary, only on past shifts */}
              {showHistoryBlock && (
                <HistoricalShiftWorkSummary
                  scheduledStart={shift.start_time}
                  scheduledEnd={shift.end_time}
                  info={historyInfo}
                  loading={historyLoading}
                />
              )}
              {/* When & Where — always visible; missing fields render as "por confirmar" */}
              <section className="rounded-2xl border border-border/40 bg-card overflow-hidden">
                {/* Date row */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/80" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">Cuándo</p>
                    <p className="text-[13px] font-semibold text-foreground first-letter:uppercase mt-0.5">
                      {format(parseISO(shift.date), "EEEE d 'de' MMMM", { locale: es })}
                    </p>
                  </div>
                </div>

                {/* Location row — always present */}
                {shift.location ? (
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground/80" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">Dónde</p>
                        <p className="text-[13px] font-semibold text-foreground mt-0.5 truncate">{shift.location.name}</p>
                      </div>
                      <button
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                        onClick={() => copyAddress(shift.location!.name, "Dirección")}
                        aria-label="Copiar dirección"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {locationCoords && (
                      <NavigationButtons latitude={locationCoords.lat} longitude={locationCoords.lng} label="Abrir mapa" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">Dónde</p>
                      <p className="text-[13px] italic text-muted-foreground/70 mt-0.5">Ubicación por confirmar</p>
                    </div>
                  </div>
                )}

                {/* Punto de encuentro — always present */}
                {shift.meeting_point ? (
                  <div className="flex items-start gap-3 px-4 py-3 border-t border-border/30">
                    <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                      <Navigation className="h-3.5 w-3.5 text-muted-foreground/80" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">Punto de encuentro</p>
                      <p className="text-[13px] font-semibold text-foreground mt-0.5 line-clamp-2 leading-snug">{shift.meeting_point}</p>
                    </div>
                    {shift.meeting_time && (
                      <div className="shrink-0 text-right pr-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 leading-none mb-1">Hora</p>
                        <p className="text-[16px] font-bold font-mono tabular-nums text-foreground leading-none">
                          {shift.meeting_time.slice(0, 5)}
                        </p>
                      </div>
                    )}
                    <button
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                      onClick={() => copyAddress(shift.meeting_point!, "Punto de encuentro")}
                      aria-label="Copiar punto de encuentro"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.meeting_point)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                      aria-label="Abrir mapa"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </a>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 px-4 py-3 border-t border-border/30">
                    <div className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                      <Navigation className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">Punto de encuentro</p>
                      <p className="text-[13px] italic text-muted-foreground/70 mt-0.5 leading-snug">
                        {shift.meeting_time ? `Por confirmar · ${shift.meeting_time.slice(0,5)}` : "Por confirmar"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Clock-in method — merged */}
                <div className="flex items-center gap-3 px-4 py-3 border-t border-border/30">
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <ClockMethodIcon className="h-3.5 w-3.5 text-muted-foreground/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">Clock In</p>
                    <p className="text-[13px] font-semibold text-foreground mt-0.5">{clockLabel}</p>
                  </div>
                </div>
              </section>

              {/* Instructions — only when present, high-signal */}
              {shift.special_instructions && (
                <section className="rounded-2xl border border-warning/25 bg-warning/[0.04] p-4">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-warning font-bold">Instrucciones</p>
                      <p className="text-[13px] mt-1 leading-relaxed text-foreground">{shift.special_instructions}</p>
                    </div>
                  </div>
                </section>
              )}

              {/* Notes — only when present */}
              {shift.notes && (
                <section className="rounded-2xl border border-border/40 bg-card p-4">
                  <div className="flex items-start gap-2.5">
                    <FileText className="h-4 w-4 text-muted-foreground/55 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">Notas</p>
                      <p className="text-[13px] mt-1 leading-relaxed text-foreground/85">{shift.notes}</p>
                    </div>
                  </div>
                </section>
              )}

              {/* Secondary actions — sober, low-emphasis links */}
              {shiftCompanyId && (
                <div className="rounded-2xl border border-border/40 bg-card overflow-hidden divide-y divide-border/30">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setSecondaryView("team")}
                  >
                    <Users className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                    <span className="text-[13px] font-semibold text-foreground flex-1">Equipo del turno</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                  </button>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setSecondaryView("chat")}
                  >
                    <MessageCircle className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                    <span className="text-[13px] font-semibold text-foreground flex-1">Chat del turno</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                  </button>
                </div>
              )}

              {/* Review — only when completed */}
              {shift.status === "completed" && employeeId && shiftCompanyId && (
                <section className="flex items-center gap-2.5 p-3 rounded-2xl border border-border/40 bg-card">
                  <Star className="h-4 w-4 text-warning shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">Califica este turno</p>
                  </div>
                  <ShiftReviewButton
                    shiftId={shift.id}
                    companyId={shiftCompanyId}
                    reviewerType="employee"
                    reviewerId={employeeId}
                  />
                </section>
              )}

              {/* Disclaimer — minimal */}
              <p className="text-[10px] text-muted-foreground/40 leading-relaxed px-1 italic">
                Las horas programadas son una estimación. La nómina usa las horas reales registradas.
              </p>
            </div>
          )}

          {/* Secondary overlay views — Team / Chat */}
          {secondaryView && (
            <div className="pt-3 space-y-3">
              <button
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors -ml-1"
                onClick={() => setSecondaryView(null)}
              >
                <X className="h-3.5 w-3.5" /> Volver al detalle
              </button>
              {secondaryView === "team" && (
                <ShiftTeamPanel shiftId={shift.id} companyId={shiftCompanyId} compact={false} />
              )}
              {secondaryView === "chat" && shiftCompanyId && (
                <ShiftChatPanel shiftId={shift.id} shiftDate={shift.date} companyId={shiftCompanyId} isAdmin={false} />
              )}
            </div>
          )}
        </div>

        {/* ─── Sticky action bar ─── */}
        {showStickyFooter && (
          <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom,16px),16px)] border-t border-border/40 bg-card flex gap-2">
            {showResponseActions && onReject && (
              <Button
                variant="outline"
                size="lg"
                className="flex-1 h-12 text-[14px] gap-2 font-semibold rounded-xl"
                onClick={onReject}
                disabled={!!responding}
              >
                <X className="h-4 w-4" /> Decline
              </Button>
            )}
            {showResponseActions && onAccept && (
              <Button
                size="lg"
                className="flex-[1.4] h-12 text-[14px] gap-2 font-bold rounded-xl shadow-md shadow-primary/15"
                onClick={onAccept}
                disabled={!!responding}
              >
                {responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Accept
              </Button>
            )}
            {!showResponseActions && showClockInAction && (
              <Button
                size="lg"
                className="w-full h-12 text-[14px] gap-2 font-bold rounded-xl shadow-md shadow-primary/15"
                onClick={() => { onOpenChange(false); navigate(`/portal/clock?shiftId=${shift.id}`); }}
              >
                <LogIn className="h-4 w-4" />
                Marcar entrada
              </Button>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
