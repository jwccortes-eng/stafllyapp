import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { format, startOfDay, endOfDay } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Clock, LogIn, LogOut, MapPin, Timer, CalendarDays, Users,
  AlertCircle, FileText, ArrowLeft, ShieldAlert, Camera, ScanLine,
  CheckCircle2, XCircle, Briefcase, Navigation, ChevronRight,
} from "lucide-react";
import { capturePosition, getDeviceId, distanceMeters } from "@/lib/geo-helpers";
import { ClockPhotoCapture } from "@/components/portal/ClockPhotoCapture";
import { QRScannerDialog } from "@/components/portal/QRScannerDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate, useSearchParams } from "react-router-dom";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  notes: string | null;
  break_minutes: number | null;
  shift_id: string | null;
}

interface TodayShift {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  shift_code: string | null;
  location_name?: string;
  client_name?: string;
  pay_type?: string;
}

function isClockInAllowed(shift: TodayShift): { allowed: boolean; message: string } {
  const now = new Date();
  const [h, m] = shift.start_time.split(":").map(Number);
  const shiftStart = new Date();
  shiftStart.setHours(h, m, 0, 0);
  if (now < shiftStart) {
    const diffMin = Math.ceil((shiftStart.getTime() - now.getTime()) / 60000);
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    const timeLabel = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
    return { allowed: false, message: `Your shift starts at ${shift.start_time.slice(0, 5)}. ${timeLabel} remaining.` };
  }
  return { allowed: true, message: "" };
}

function isClockOutWithinSchedule(shift: TodayShift | null): { withinSchedule: boolean; message: string } {
  if (!shift) return { withinSchedule: true, message: "" };
  const now = new Date();
  const [eh, em] = shift.end_time.split(":").map(Number);
  const shiftEnd = new Date(); shiftEnd.setHours(eh, em, 0, 0);
  const [sh, sm] = shift.start_time.split(":").map(Number);
  const shiftStart = new Date(); shiftStart.setHours(sh, sm, 0, 0);
  if (now < shiftStart || now > shiftEnd) {
    return { withinSchedule: false, message: `Clock-out is outside scheduled hours (${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}).` };
  }
  return { withinSchedule: true, message: "" };
}

export default function PortalClock() {
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlShiftId = searchParams.get("shiftId");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>([]);
  const [selectedShift, setSelectedShift] = useState<TodayShift | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [clockInBlocked, setClockInBlocked] = useState<string | null>(null);
  const [hasProfilePhoto, setHasProfilePhoto] = useState(true);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [pendingClockAction, setPendingClockAction] = useState<"in" | "out" | null>(null);
  const [clockPhotoRequired, setClockPhotoRequired] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [shiftQrModes, setShiftQrModes] = useState<Record<string, string>>({});
  const [allowedMethods, setAllowedMethods] = useState<string[]>(["manual", "gps", "qr", "kiosk"]);
  const [successState, setSuccessState] = useState<{ type: "in" | "out"; time: string; shift: string } | null>(null);
  const [hasDailyOnlyShifts, setHasDailyOnlyShifts] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedShift) { setClockInBlocked(null); return; }
    const check = isClockInAllowed(selectedShift);
    setClockInBlocked(check.allowed ? null : check.message);
  }, [selectedShift, now]);

  const loadData = useCallback(async () => {
    if (!employeeId) { setLoading(false); return; }
    const [empRes] = await Promise.all([
      supabase.from("employees").select("company_id, avatar_url").eq("id", employeeId).maybeSingle(),
    ]);
    const emp = empRes.data;
    if (emp) {
      setCompanyId(emp.company_id);
      setHasProfilePhoto(!!emp.avatar_url);
      // Read clock_config (consolidated namespace)
      const { data: clockCfgRow } = await supabase
        .from("company_settings").select("value").eq("company_id", emp.company_id).eq("key", "clock_config").maybeSingle();
      const clockCfg = (clockCfgRow?.value && typeof clockCfgRow.value === "object") ? clockCfgRow.value as Record<string, unknown> : {};
      setClockPhotoRequired(clockCfg.require_photo === true);
      if (Array.isArray(clockCfg.allowed_methods) && clockCfg.allowed_methods.length > 0) {
        setAllowedMethods(clockCfg.allowed_methods as string[]);
      }
    }

    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();
    const todayStr = format(today, "yyyy-MM-dd");

    const [entriesRes, shiftsRes] = await Promise.all([
      supabase.from("time_entries")
        .select("id, clock_in, clock_out, status, notes, break_minutes, shift_id")
        .eq("employee_id", employeeId).gte("clock_in", dayStart).lte("clock_in", dayEnd)
        .order("clock_in", { ascending: false }),
      supabase.from("shift_assignments")
        .select("shift_id, status, scheduled_shifts!inner(id, title, start_time, end_time, shift_code, date, pay_type, qr_attendance_mode, qr_token, locations(name), clients(name))")
        .eq("employee_id", employeeId).eq("scheduled_shifts.date", todayStr).in("status", ["confirmed", "pending"]),
    ]);

    const list = (entriesRes.data ?? []) as TimeEntry[];
    setTodayEntries(list);
    setActiveEntry(list.find((e) => !e.clock_out) ?? null);

    const qrModes: Record<string, string> = {};
    const mappedShifts: TodayShift[] = (shiftsRes.data ?? []).map((sa: any) => {
      qrModes[sa.scheduled_shifts.id] = sa.scheduled_shifts.qr_attendance_mode || "disabled";
      return {
        id: sa.scheduled_shifts.id, title: sa.scheduled_shifts.title,
        start_time: sa.scheduled_shifts.start_time, end_time: sa.scheduled_shifts.end_time,
        shift_code: sa.scheduled_shifts.shift_code,
        location_name: sa.scheduled_shifts.locations?.name,
        client_name: sa.scheduled_shifts.clients?.name,
        pay_type: sa.scheduled_shifts.pay_type,
      };
    });
    setShiftQrModes(qrModes);
    const clockableShifts = mappedShifts.filter(s => s.pay_type !== "daily");
    setHasDailyOnlyShifts(clockableShifts.length === 0 && mappedShifts.length > 0);
    setTodayShifts(clockableShifts);
    const activeOpen = list.find(e => !e.clock_out);
    if (!activeOpen) {
      const preselect = urlShiftId ? clockableShifts.find(s => s.id === urlShiftId) : null;
      if (preselect) setSelectedShift(preselect);
      else if (clockableShifts.length === 1) setSelectedShift(clockableShifts[0]);
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { loadData(); }, [loadData]);

  const initiateClockIn = () => {
    if (!employeeId || !companyId || !selectedShift) return;
    if (!hasProfilePhoto) {
      toast({ title: "Profile photo required", description: "Upload a photo before clocking in.", variant: "destructive" });
      return;
    }
    const check = isClockInAllowed(selectedShift);
    if (!check.allowed) { toast({ title: "Not available yet", description: check.message, variant: "destructive" }); return; }
    if (clockPhotoRequired) { setPendingClockAction("in"); setPhotoDialogOpen(true); }
    else handleClockIn(null);
  };

  const initiateClockOut = () => {
    if (!activeEntry || !companyId || !employeeId) return;
    if (clockPhotoRequired) { setPendingClockAction("out"); setPhotoDialogOpen(true); }
    else handleClockOut(null);
  };

  const onPhotoCaptured = (photoUrl: string) => {
    setPhotoDialogOpen(false);
    if (pendingClockAction === "in") handleClockIn(photoUrl);
    else if (pendingClockAction === "out") handleClockOut(photoUrl);
    setPendingClockAction(null);
  };

  const handleQrScanned = async (data: string) => {
    setQrScannerOpen(false);
    if (!employeeId || !companyId) return;
    const parts = data.split(":");
    if (parts.length !== 4 || parts[0] !== "stafly" || parts[1] !== "shift") {
      toast({ title: "Invalid QR", description: "This code does not correspond to a shift.", variant: "destructive" }); return;
    }
    const [, , scannedShiftId, scannedToken] = parts;
    const { data: shiftData } = await supabase.from("scheduled_shifts")
      .select("id, title, qr_token, qr_attendance_mode, start_time, end_time, date").eq("id", scannedShiftId).maybeSingle();
    if (!shiftData) { toast({ title: "Shift not found", variant: "destructive" }); return; }
    if (shiftData.qr_token !== scannedToken) { toast({ title: "Expired or invalid QR", description: "Ask your supervisor for a new code.", variant: "destructive" }); return; }
    const { data: assignment } = await supabase.from("shift_assignments")
      .select("id, status").eq("shift_id", scannedShiftId).eq("employee_id", employeeId).neq("status", "rejected").maybeSingle();
    if (!assignment) { toast({ title: "You're not assigned to this shift", variant: "destructive" }); return; }
    const matchingShift = todayShifts.find(s => s.id === scannedShiftId);
    if (matchingShift) setSelectedShift(matchingShift);
    if (activeEntry && activeEntry.shift_id === scannedShiftId) { initiateClockOut(); }
    else if (!activeEntry) {
      if (matchingShift) setTimeout(() => initiateClockIn(), 100);
      else toast({ title: "This shift is not for today", variant: "destructive" });
    } else { toast({ title: "You have an active shift", description: "Clock out first.", variant: "destructive" }); }
  };

  const handleClockIn = async (photoUrl: string | null) => {
    if (!employeeId || !companyId || !selectedShift) return;
    setActing(true);
    try {
      let pos: { latitude: number; longitude: number; accuracy: number } | null = null;
      try { pos = await capturePosition(); } catch { /* GPS unavailable */ }
      const device = getDeviceId();
      if (selectedShift.id) {
        const { data: shiftData } = await supabase.from("scheduled_shifts")
          .select("location_id, locations(latitude, longitude, geofence_radius)").eq("id", selectedShift.id).maybeSingle();
        const loc = (shiftData as any)?.locations;
        if (loc?.latitude && loc?.longitude) {
          // Read clock_config for GPS enforcement
          const { data: clockCfgRow } = await supabase.from("company_settings")
            .select("value").eq("company_id", companyId).eq("key", "clock_config").maybeSingle();
          const clockCfg = (clockCfgRow?.value && typeof clockCfgRow.value === "object") ? clockCfgRow.value as Record<string, unknown> : {};
          const gpsEnforcement = (clockCfg.gps_enforcement as string) ?? "none";
          const configRadius = typeof clockCfg.gps_radius_meters === "number" ? clockCfg.gps_radius_meters : 200;
          if (!pos) {
            if (gpsEnforcement === "block") {
              toast({ title: "Enable your location", description: "Your company requires GPS location for clocking in. Enable it in settings and try again.", variant: "destructive" });
              setActing(false); return;
            }
          } else {
            const dist = distanceMeters(pos.latitude, pos.longitude, loc.latitude, loc.longitude);
            const radius = loc.geofence_radius ?? configRadius;
            if (dist > radius) {
              if (gpsEnforcement === "block") {
                toast({ title: "Outside work area", description: `Move closer to the shift location (${Math.round(dist)}m away).`, variant: "destructive" });
                await supabase.from("clock_alerts").insert({ employee_id: employeeId, company_id: companyId, shift_id: selectedShift.id, type: "OUTSIDE_GEOFENCE", severity: "high", description: `Clock-in blocked at ${Math.round(dist)}m` } as any);
                setActing(false); return;
              } else {
                // warn or none — just log
                await supabase.from("clock_alerts").insert({ employee_id: employeeId, company_id: companyId, shift_id: selectedShift.id, type: "OUTSIDE_GEOFENCE", severity: gpsEnforcement === "warn" ? "high" : "low", description: `Clock-in at ${Math.round(dist)}m` } as any);
              }
            }
          }
          if (pos && pos.accuracy > 100) {
            await supabase.from("clock_alerts").insert({ employee_id: employeeId, company_id: companyId, shift_id: selectedShift.id, type: "GPS_LOW_ACCURACY", severity: "low", description: `GPS accuracy: ±${Math.round(pos.accuracy)}m` } as any);
          }
        }
      }
      const { data: insertedEntry, error } = await supabase.from("time_entries").insert({
        employee_id: employeeId, company_id: companyId, clock_in: new Date().toISOString(), status: "pending", shift_id: selectedShift.id,
      }).select("id").single();
      if (error) throw error;
      if (insertedEntry) {
        await supabase.from("clock_events").insert({
          employee_id: employeeId, company_id: companyId, shift_id: selectedShift.id, time_entry_id: insertedEntry.id,
          type: "clock_in", latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null, accuracy: pos?.accuracy ?? null, device, photo_url: photoUrl,
        } as any);
      }
      setSuccessState({ type: "in", time: format(new Date(), "HH:mm"), shift: selectedShift.title });
      setTimeout(() => setSuccessState(null), 4000);
      setSelectedShift(null);
      await loadData();
    } catch (err: any) {
      toast({ title: "Could not register", description: err.message ?? "Try again.", variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleClockOut = async (photoUrl: string | null) => {
    if (!activeEntry || !companyId || !employeeId) return;
    const activeShift = todayShifts.find(s => s.id === activeEntry.shift_id) ?? null;
    const scheduleCheck = isClockOutWithinSchedule(activeShift);
    setActing(true);
    try {
      const clockOutTime = new Date().toISOString();
      let pos: { latitude: number; longitude: number; accuracy: number } | null = null;
      try { pos = await capturePosition(); } catch { /* GPS unavailable */ }
      const device = getDeviceId();
      await supabase.from("clock_events").insert({
        employee_id: employeeId, company_id: companyId, shift_id: activeEntry.shift_id, time_entry_id: activeEntry.id,
        type: "clock_out", latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null, accuracy: pos?.accuracy ?? null, device, photo_url: photoUrl,
      } as any);
      if (!scheduleCheck.withinSchedule) {
        await supabase.from("time_entries").update({ clock_out: clockOutTime, status: "pending", notes: `⚠️ Clock-out outside scheduled hours.` }).eq("id", activeEntry.id);
        // Log out-of-schedule clock-out as alert instead of ticket (more reliable)
        try {
          await supabase.from("clock_alerts").insert({
            employee_id: employeeId, company_id: companyId,
            shift_id: activeEntry.shift_id,
            type: "OUT_OF_SCHEDULE_CLOCKOUT", severity: "medium",
            description: `Clock-out at ${format(new Date(), "HH:mm")} outside scheduled hours.`,
          } as any);
        } catch { /* non-critical */ }
      } else {
        const { error } = await supabase.from("time_entries").update({ clock_out: clockOutTime }).eq("id", activeEntry.id);
        if (error) throw error;
      }
      setSuccessState({ type: "out", time: format(new Date(), "HH:mm"), shift: activeShift?.title ?? "Shift" });
      setTimeout(() => setSuccessState(null), 4000);
      await loadData();
    } catch (err: any) {
      toast({ title: "Could not register", description: err.message ?? "Try again.", variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleSendTimeRequest = async () => {
    if (!employeeId || !companyId || !requestMessage.trim()) return;
    setSendingRequest(true);
    try {
      await supabase.from("notifications").insert({
        company_id: companyId, recipient_id: companyId, recipient_type: "company",
        type: "manual_time_request", title: "Uncaptured time request",
        body: requestMessage.trim(), metadata: { employee_id: employeeId, request_date: format(new Date(), "yyyy-MM-dd") },
      } as any);
      toast({ title: "Request sent", description: "Your supervisor will review it soon." });
      setRequestOpen(false); setRequestMessage("");
    } catch (err: any) {
      toast({ title: "Error sending", description: err.message, variant: "destructive" });
    } finally { setSendingRequest(false); }
  };

  const getElapsed = () => {
    if (!activeEntry) return null;
    const diff = Math.floor((now.getTime() - new Date(activeEntry.clock_in).getTime()) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getDuration = (entry: TimeEntry) => {
    if (!entry.clock_out) return "In progress";
    const diff = Math.floor((new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 1000);
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  const totalHoursToday = () => {
    let total = 0;
    for (const entry of todayEntries) {
      const end = entry.clock_out ? new Date(entry.clock_out) : now;
      total += (end.getTime() - new Date(entry.clock_in).getTime()) / 1000;
    }
    return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
  };

  if (loading) {
    return (
      <div className="space-y-4 pt-8">
        <div className="h-16 animate-pulse bg-muted rounded-2xl" />
        <div className="h-40 animate-pulse bg-muted rounded-2xl" />
        <div className="h-14 animate-pulse bg-muted rounded-2xl" />
      </div>
    );
  }

  const isClockedIn = !!activeEntry;
  const hasQrShifts = allowedMethods.includes("qr") && Object.values(shiftQrModes).some(m => m !== "disabled" && m !== "");
  const allowManual = allowedMethods.includes("manual");
  const allowGps = allowedMethods.includes("gps");

  return (
    <div className="space-y-4 animate-fade-in pb-24">
      {/* Missing photo warning */}
      {!hasProfilePhoto && (
        <button onClick={() => navigate("/portal/profile")}
          className="w-full rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3 flex items-center gap-3 hover:bg-destructive/10 transition-colors active:scale-[0.98]">
          <Camera className="h-5 w-5 text-destructive shrink-0" />
          <div className="text-left flex-1">
            <p className="text-xs font-bold text-destructive">Upload your profile photo</p>
            <p className="text-[10px] text-muted-foreground">Required to clock in</p>
          </div>
          <ChevronRight className="h-4 w-4 text-destructive/30" />
        </button>
      )}

      {/* ── Success State ── */}
      {successState && (
        <div className={cn(
          "rounded-2xl p-5 text-center space-y-2 animate-fade-in",
          successState.type === "in"
            ? "bg-[hsl(var(--status-confirmed)/0.08)] border-2 border-[hsl(var(--status-confirmed)/0.2)]"
            : "bg-primary/[0.06] border-2 border-primary/20"
        )}>
          <CheckCircle2 className={cn("h-10 w-10 mx-auto", successState.type === "in" ? "text-[hsl(var(--status-confirmed))]" : "text-primary")} />
          <p className="text-lg font-bold font-heading text-foreground">
            {successState.type === "in" ? "✓ Clock-in recorded" : "✓ Clock-out recorded"}
          </p>
          <p className="text-sm text-muted-foreground">{successState.shift} · {successState.time}</p>
        </div>
      )}

      {/* ── Current time — compact ── */}
      <div className="text-center">
        <p className="text-4xl font-bold font-heading tracking-tight tabular-nums text-foreground">
          {format(now, "HH:mm")}
          <span className="text-lg text-muted-foreground/40 ml-0.5">{format(now, "ss")}</span>
        </p>
        <p className="text-[12px] text-muted-foreground capitalize mt-0.5">
          {format(now, "EEEE, MMMM d", { locale: enUS })}
        </p>
      </div>

      {/* ── Clocked-in status ── */}
      {isClockedIn && (
        <div className="rounded-2xl p-4 text-center relative overflow-hidden bg-gradient-to-br from-[hsl(var(--status-confirmed))] to-[hsl(var(--status-confirmed)/0.8)] text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,hsl(0_0%_100%/0.12),transparent_60%)]" />
          <div className="relative space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest">On shift</span>
            </div>
            <p className="text-3xl font-bold tabular-nums font-heading">{getElapsed()}</p>
            <p className="text-[11px] opacity-80">Clock-in: {format(new Date(activeEntry!.clock_in), "HH:mm")}</p>
          </div>
        </div>
      )}

      {/* ── Shift selection — only when not clocked in ── */}
      {!isClockedIn && (
        <>
          {todayShifts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                {todayShifts.length === 1 ? "Your shift today" : "Select your shift"}
              </p>
              <div className="space-y-1.5">
                {todayShifts.map(s => {
                  const isSelected = selectedShift?.id === s.id;
                  const alreadyClockedShift = todayEntries.some(e => e.shift_id === s.id);
                  const timeCheck = isClockInAllowed(s);
                  return (
                    <button
                      key={s.id} disabled={alreadyClockedShift}
                      onClick={() => setSelectedShift(isSelected ? null : s)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-all min-h-[56px]",
                        isSelected && "border-primary bg-primary/[0.04] ring-2 ring-primary/20",
                        !isSelected && !alreadyClockedShift && "border-border/40 hover:border-primary/30 bg-card shadow-sm",
                        alreadyClockedShift && "opacity-40 cursor-not-allowed bg-muted/20",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-bold truncate flex-1">{s.title}</span>
                        {alreadyClockedShift && (
                          <span className="text-[9px] font-bold text-[hsl(var(--status-confirmed))] flex items-center gap-0.5 shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </span>
                        )}
                        {!alreadyClockedShift && !timeCheck.allowed && (
                          <span className="text-[9px] font-bold text-[hsl(var(--status-pending))] flex items-center gap-0.5 shrink-0">
                            <Clock className="h-3 w-3" /> Not yet
                          </span>
                        )}
                        {!alreadyClockedShift && timeCheck.allowed && isSelected && (
                          <span className="text-[9px] font-bold text-primary flex items-center gap-0.5 shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Ready
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                        <span className="flex items-center gap-1 font-medium tabular-nums">
                          <Clock className="h-3 w-3" /> {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        </span>
                        {s.location_name && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3" /> {s.location_name}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/30 bg-muted/10 p-5 flex flex-col items-center gap-2 text-center">
              <CalendarDays className="h-7 w-7 text-muted-foreground/20" />
              <p className="text-sm font-bold text-foreground">
                 {hasDailyOnlyShifts ? "Daily-pay shifts" : "No shifts today"}
              </p>
              <p className="text-[11px] text-muted-foreground/60 max-w-[240px]">
                {hasDailyOnlyShifts
                  ? "Your shifts today don't require clocking in. Your pay is calculated automatically."
                  : "You have no assigned shifts. If one is missing, contact your supervisor."}
              </p>
            </div>
          )}
        </>
      )}

      {/* Clock-in blocked warning */}
      {!isClockedIn && clockInBlocked && selectedShift && (
        <div className="rounded-xl border border-[hsl(var(--status-pending)/0.3)] bg-[hsl(var(--status-pending)/0.05)] p-3 flex items-start gap-2.5">
          <Clock className="h-4 w-4 text-[hsl(var(--status-pending))] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[hsl(var(--status-pending))] font-medium leading-relaxed">{clockInBlocked}</p>
        </div>
      )}

      {/* ── Primary CTA ── */}
      {isClockedIn ? (
        <Button
          onClick={initiateClockOut} disabled={acting}
          className="w-full h-14 rounded-2xl text-base font-bold gap-3 shadow-xl transition-all active:scale-[0.95] bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        >
          {acting ? <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><LogOut className="h-5 w-5" /> Clock Out</>}
        </Button>
      ) : (
        <Button
          onClick={initiateClockIn}
          disabled={acting || !companyId || !selectedShift || !!clockInBlocked || !hasProfilePhoto}
          className="w-full h-14 rounded-2xl text-base font-bold gap-3 shadow-xl transition-all active:scale-[0.95] gradient-primary text-white hover:shadow-2xl disabled:opacity-40"
        >
          {acting ? <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><LogIn className="h-5 w-5" /> Clock In</>}
        </Button>
      )}

      {/* QR + manual row */}
      <div className="flex items-center gap-2">
        {hasQrShifts && (
          <Button
            variant="outline"
            onClick={() => setQrScannerOpen(true)}
            className="flex-1 h-11 rounded-xl text-xs font-bold gap-2 border-primary/20 text-primary hover:bg-primary/5"
          >
            <ScanLine className="h-4 w-4" />
            Scan QR
          </Button>
        )}
        {!isClockedIn && (
          <Button variant="ghost" size="sm" className={cn("h-11 text-xs text-muted-foreground gap-1.5", hasQrShifts ? "flex-1" : "w-full")} onClick={() => setRequestOpen(true)}>
            <FileText className="h-3.5 w-3.5" /> Report time
          </Button>
        )}
      </div>

      {/* Today summary */}
      {(todayEntries.length > 0 || isClockedIn) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border/40 bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Timer className="h-3 w-3" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Hours today</span>
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums font-heading">{totalHoursToday()}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <CalendarDays className="h-3 w-3" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Entries</span>
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums font-heading">{todayEntries.length}</p>
          </div>
        </div>
      )}

      {/* Daily history */}
      {todayEntries.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Today's history</h3>
          {todayEntries.map((entry) => {
            const isActive = !entry.clock_out;
            return (
              <div key={entry.id} className={cn(
                "rounded-xl border bg-card p-3 flex items-center gap-3 shadow-sm",
                isActive && "border-[hsl(var(--status-confirmed)/0.2)] bg-[hsl(var(--status-confirmed)/0.03)]"
              )}>
                <div className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                  isActive ? "bg-[hsl(var(--status-confirmed)/0.1)] text-[hsl(var(--status-confirmed))]" : "bg-muted text-muted-foreground"
                )}>
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold tabular-nums">{format(new Date(entry.clock_in), "HH:mm")}</span>
                    <span className="text-muted-foreground/40 text-xs">→</span>
                    <span className="text-sm font-bold tabular-nums">{entry.clock_out ? format(new Date(entry.clock_out), "HH:mm") : "—"}</span>
                    {isActive && <span className="text-[9px] font-bold text-[hsl(var(--status-confirmed))] ml-1">In progress</span>}
                  </div>
                  {!isActive && <p className="text-[10px] text-muted-foreground mt-0.5">{getDuration(entry)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual time request dialog */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Report uncaptured time
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Describe what hours you worked and why you couldn't clock in.</p>
            <Textarea value={requestMessage} onChange={e => setRequestMessage(e.target.value)}
              placeholder="E.g.: I worked from 8:00 to 17:00 but couldn't clock in because..." rows={4} className="text-sm resize-none" />
            <Button onClick={handleSendTimeRequest} disabled={sendingRequest || !requestMessage.trim()} className="w-full h-11 text-sm font-bold rounded-xl">
              {sendingRequest ? <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" /> : null}
              Send request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo capture dialog */}
      {employeeId && companyId && (
        <ClockPhotoCapture open={photoDialogOpen} onClose={() => { setPhotoDialogOpen(false); setPendingClockAction(null); }}
          onCaptured={onPhotoCaptured} employeeId={employeeId} companyId={companyId} clockType={pendingClockAction === "out" ? "clock_out" : "clock_in"} />
      )}

      {/* QR Scanner dialog */}
      <QRScannerDialog open={qrScannerOpen} onClose={() => setQrScannerOpen(false)} onScanned={handleQrScanned} />
    </div>
  );
}
