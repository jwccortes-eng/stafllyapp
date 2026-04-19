import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  Clock, MapPin, Users, CalendarDays, FileText, Navigation,
  AlertCircle, LogIn, MessageCircle, Star, Copy, ExternalLink,
  Briefcase, ScanLine, Phone,
} from "lucide-react";
import { ShiftReviewButton } from "@/components/reviews/ShiftReviewButton";
import { NavigationButtons } from "@/components/navigation/NavigationButtons";
import { format, parseISO, differenceInMinutes, isToday, isTomorrow } from "date-fns";
import { enUS } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShiftTeamPanel } from "@/components/shifts/ShiftTeamPanel";
import { ShiftChatPanel } from "@/components/shifts/ShiftChatPanel";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";

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
  if (hrs > 0) return `Starts in ${hrs}h ${mins}m`;
  return `Starts in ${mins}m`;
}

function getStatusMeta(status?: string): { tone: OpsStatusTone; label: string } {
  switch (status) {
    case "confirmed":
    case "accepted":
      return { tone: "success", label: "Confirmed" };
    case "needs_reacceptance":
      return { tone: "warning", label: "Re-accept" };
    case "rejected":
      return { tone: "critical", label: "Rejected" };
    case "pending":
    default:
      return { tone: "warning", label: "Pending" };
  }
}

type DrawerTab = "info" | "team" | "chat";

export function PortalShiftDetailDrawer({ shift, assignmentStatus, open, onOpenChange }: PortalShiftDetailDrawerProps) {
  const navigate = useNavigate();
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
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
  const statusMeta = getStatusMeta(assignmentStatus);
  const shiftCompanyId = shift.company_id || empCompanyId || "";
  const countdown = isTodayShift ? getCountdown(shift.date, shift.start_time) : null;
  const isConfirmed = assignmentStatus === "confirmed" || assignmentStatus === "accepted";

  const copyAddress = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Address copied to clipboard" });
  };

  const clockLabel = clockingMethod === "required" ? "QR required" : clockingMethod === "optional" ? "QR optional" : "Mobile clock-in";
  const ClockMethodIcon = clockingMethod === "required" || clockingMethod === "optional" ? ScanLine : Phone;

  return (
    <Drawer open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTab("info"); }}>
      <DrawerContent className="max-h-[92vh] overflow-hidden p-0">
        {/* ────── Sticky header — compact, executive ────── */}
        <DrawerHeader className="px-4 pt-3 pb-3 space-y-2 border-b border-border/40 bg-card sticky top-0 z-10">
          {/* Meta row — code, day chip, status */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {shift.shift_code && (
              <span className="text-[10px] font-mono font-semibold text-muted-foreground/70 bg-muted/60 rounded px-1.5 py-0.5 tabular-nums">
                #{shift.shift_code.padStart(4, "0")}
              </span>
            )}
            {isTodayShift && (
              <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-primary text-primary-foreground uppercase tracking-widest">Today</span>
            )}
            {isTomorrowShift && (
              <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-muted text-foreground uppercase tracking-widest">Tomorrow</span>
            )}
            <span className="text-[11px] text-muted-foreground/70 font-medium tabular-nums">
              {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)} · {hoursLabel}
            </span>
            <div className="ml-auto">
              <OpsStatusChip tone={statusMeta.tone} label={statusMeta.label} size="sm" />
            </div>
          </div>

          {/* Title */}
          <DrawerTitle className="text-left text-[17px] font-bold leading-snug line-clamp-2">
            {shift.title}
          </DrawerTitle>

          {/* Sub-meta — client */}
          {shift.client && (
            <p className="text-[12px] text-muted-foreground/85 flex items-center gap-1.5">
              <Briefcase className="h-3 w-3 text-muted-foreground/55" />
              {shift.client.name}
            </p>
          )}

          {/* Countdown — only when actionable */}
          {countdown && isConfirmed && (
            <div className="flex items-center gap-2 text-[10.5px] font-semibold text-primary bg-primary/[0.06] rounded-lg px-2.5 py-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="tracking-wide">{countdown}</span>
            </div>
          )}
        </DrawerHeader>

        {/* ────── Tab bar — sober, compact ────── */}
        <div className="px-4 pt-2.5 pb-2 flex items-center gap-1 bg-background sticky top-0 z-[5]">
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-xl p-0.5 w-full">
            {(["info", "team", "chat"] as DrawerTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all",
                  tab === t
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground/70 hover:text-foreground"
                )}
              >
                {t === "info" && <><CalendarDays className="h-3 w-3" /> Details</>}
                {t === "team" && <><Users className="h-3 w-3" /> Team</>}
                {t === "chat" && <><MessageCircle className="h-3 w-3" /> Chat</>}
              </button>
            ))}
          </div>
        </div>

        {/* ────── Content ────── */}
        <div className="px-4 pb-[max(env(safe-area-inset-bottom,24px),24px)] overflow-y-auto" style={{ maxHeight: "calc(92vh - 220px)" }}>
          {tab === "info" && (
            <div className="space-y-3 pt-1">
              {/* A. Schedule — primary block */}
              <section className="rounded-xl border border-border/40 bg-card p-3.5 space-y-1.5">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Schedule</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground/70" />
                  <span className="text-[15px] font-bold text-foreground tabular-nums">
                    {shift.start_time?.slice(0, 5)} → {shift.end_time?.slice(0, 5)}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground/70 bg-muted/50 px-2 py-0.5 rounded-md font-medium tabular-nums">
                    {hoursLabel}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground/80 capitalize">
                  {format(parseISO(shift.date), "EEEE, MMMM d, yyyy", { locale: enUS })}
                </p>
              </section>

              {/* B. Location */}
              {shift.location && (
                <section className="rounded-xl border border-border/40 bg-card p-3.5 space-y-2">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Location</p>
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                    <p className="text-[13px] font-semibold flex-1">{shift.location.name}</p>
                    <button
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                      onClick={() => copyAddress(shift.location!.name)}
                      aria-label="Copy address"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {locationCoords && (
                    <NavigationButtons latitude={locationCoords.lat} longitude={locationCoords.lng} label="Navigate" />
                  )}
                </section>
              )}

              {/* C. Meeting Point — sober premium link */}
              {shift.meeting_point && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.meeting_point)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-border/40 bg-card hover:border-border/70 hover:bg-muted/30 transition-colors group"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <Navigation className="h-3.5 w-3.5 text-muted-foreground/80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Meeting Point</p>
                    <p className="text-[12.5px] font-semibold mt-0.5 truncate">{shift.meeting_point}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                </a>
              )}

              {/* D. Clocking method */}
              <section className="rounded-xl border border-border/40 bg-card p-3.5">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold mb-2">Clock-in method</p>
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <ClockMethodIcon className="h-4 w-4 text-muted-foreground/80" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground">{clockLabel}</p>
                    {clockingMethod === "required" && (
                      <p className="text-[10.5px] text-muted-foreground/70 mt-0.5">Scan the QR code on site to clock in</p>
                    )}
                  </div>
                </div>
              </section>

              {/* E. Instructions — only when present */}
              {shift.special_instructions && (
                <section className="rounded-xl border border-warning/30 bg-warning/[0.04] p-3.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-widest text-warning font-bold">Instructions</p>
                      <p className="text-[13px] mt-1 leading-relaxed text-foreground">{shift.special_instructions}</p>
                    </div>
                  </div>
                </section>
              )}

              {/* F. Notes */}
              {shift.notes && (
                <section className="rounded-xl border border-border/40 bg-card p-3.5">
                  <div className="flex items-start gap-2.5">
                    <FileText className="h-4 w-4 text-muted-foreground/55 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Notes</p>
                      <p className="text-[13px] mt-1 leading-relaxed">{shift.notes}</p>
                    </div>
                  </div>
                </section>
              )}

              {/* G. Payment disclaimer — minimal */}
              <p className="text-[10px] text-muted-foreground/45 leading-relaxed px-1 italic">
                Scheduled hours are estimates. Payroll uses actual clocked hours.
              </p>

              {/* H. Review — only when completed */}
              {shift.status === "completed" && employeeId && shiftCompanyId && (
                <section className="flex items-center gap-2.5 p-3 rounded-xl border border-border/40 bg-card">
                  <Star className="h-4 w-4 text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Rate this shift</p>
                  </div>
                  <ShiftReviewButton
                    shiftId={shift.id}
                    companyId={shiftCompanyId}
                    reviewerType="employee"
                    reviewerId={employeeId}
                  />
                </section>
              )}
            </div>
          )}

          {tab === "team" && (
            <div className="pt-1">
              <ShiftTeamPanel shiftId={shift.id} companyId={shiftCompanyId} compact={false} />
            </div>
          )}

          {tab === "chat" && shiftCompanyId && (
            <div className="pt-1">
              <ShiftChatPanel shiftId={shift.id} shiftDate={shift.date} companyId={shiftCompanyId} isAdmin={false} />
            </div>
          )}
        </div>

        {/* ────── Sticky footer — single primary action ────── */}
        {tab === "info" && isConfirmed && isTodayShift && (
          <div className="px-4 pt-2 pb-[max(env(safe-area-inset-bottom,16px),16px)] border-t border-border/40 bg-card">
            <Button
              size="lg"
              className="w-full h-12 text-sm gap-2 font-bold rounded-xl shadow-md shadow-primary/15"
              onClick={() => { onOpenChange(false); navigate(`/portal/clock?shiftId=${shift.id}`); }}
            >
              <LogIn className="h-4 w-4" />
              Clock In
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
