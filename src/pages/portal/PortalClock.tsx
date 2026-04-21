import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { format, startOfDay, endOfDay } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Clock, LogIn, LogOut, MapPin, Timer, CalendarDays,
  FileText, Camera, ScanLine, CheckCircle2, ChevronRight,
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
import { OpsStatusChip } from "@/components/operations/OpsStatusChip";
import {
  defaultAttendanceModeForPayType,
  actionLabelsForMode,
  type ShiftAttendanceMode,
} from "@/lib/shift-attendance-mode";

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
  attendance_mode: ShiftAttendanceMode;
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
      // Hide soft-deleted shifts (see src/lib/shifts/visibility.ts)
      supabase.from("shift_assignments")
        .select("shift_id, status, scheduled_shifts!inner(id, title, start_time, end_time, shift_code, date, pay_type, attendance_mode, qr_attendance_mode, qr_token, locations(name), clients(name))")
        .eq("employee_id", employeeId).eq("scheduled_shifts.date", todayStr)
        .is("scheduled_shifts.deleted_at", null)
        .not("scheduled_shifts.status", "in", "(cancelled,canceled)")
        .in("status", ["confirmed", "pending"]),
    ]);

    const list = (entriesRes.data ?? []) as TimeEntry[];
    setTodayEntries(list);
    setActiveEntry(list.find((e) => !e.clock_out) ?? null);

    const qrModes: Record<string, string> = {};
    const mappedShifts: TodayShift[] = (shiftsRes.data ?? []).map((sa: any) => {
      const ss = sa.scheduled_shifts;
      qrModes[ss.id] = ss.qr_attendance_mode || "disabled";
      return {
        id: ss.id, title: ss.title,
        start_time: ss.start_time, end_time: ss.end_time,
        shift_code: ss.shift_code,
        location_name: ss.locations?.name,
        client_name: ss.clients?.name,
        pay_type: ss.pay_type,
        attendance_mode:
          (ss.attendance_mode as ShiftAttendanceMode) ??
          defaultAttendanceModeForPayType(ss.pay_type),
      };
    });
    setShiftQrModes(qrModes);
    // Keep on the screen any shift the worker can act on:
    //  - clock or hybrid → traditional clock in/out (creates time_entries)
    //  - arrival → presence reporting (clock_events only, no payroll hours)
    const actionableShifts = mappedShifts.filter(
      s => s.attendance_mode !== "clock" || s.pay_type !== "daily",
    );
    // Daily-only-with-no-arrival edge case (shouldn't happen w/ defaults, but guard):
    setHasDailyOnlyShifts(actionableShifts.length === 0 && mappedShifts.length > 0);
    setTodayShifts(actionableShifts);
    const activeOpen = list.find(e => !e.clock_out);
    if (!activeOpen) {
      const preselect = urlShiftId ? actionableShifts.find(s => s.id === urlShiftId) : null;
      if (preselect) setSelectedShift(preselect);
      else if (actionableShifts.length === 1) setSelectedShift(actionableShifts[0]);
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
    if (!employeeId || !companyId) {
      return { kind: "error" as const, title: "Sesión no disponible", description: "Inicia sesión nuevamente." };
    }
    // Delegate validation + audit logging to the edge function.
    const { data: result, error } = await supabase.functions.invoke("attendance-qr-resolve", {
      body: { qr: data, employee_id: employeeId },
    });

    if (error || !result || result.outcome === "internal_error") {
      return {
        kind: "error" as const,
        title: "No pudimos validar el código",
        description: error?.message ?? result?.message ?? "Intenta de nuevo en unos segundos.",
      };
    }

    if (result.outcome !== "ok_clock_in" && result.outcome !== "ok_clock_out") {
      const titles: Record<string, string> = {
        invalid_payload: "Código inválido",
        shift_not_found: "Turno no encontrado",
        token_mismatch: "QR expirado",
        qr_disabled: "QR deshabilitado",
        not_assigned: "No estás asignado",
        out_of_window: "Fuera de horario",
        already_clocked_in_elsewhere: "Tienes un turno activo",
      };
      return {
        kind: "error" as const,
        title: titles[result.outcome] ?? "No se pudo procesar",
        description: result.message,
      };
    }

    // Success path: trigger clock-in/out flow
    const matchingShift = todayShifts.find(s => s.id === result.shift_id);
    if (matchingShift) setSelectedShift(matchingShift);

    if (result.outcome === "ok_clock_out") {
      setTimeout(() => initiateClockOut(), 200);
      return { kind: "success" as const, title: "Listo para fichar salida", description: result.shift?.title };
    }
    if (matchingShift) {
      setTimeout(() => initiateClockIn(), 200);
      return { kind: "success" as const, title: "Listo para fichar entrada", description: matchingShift.title };
    }
    return { kind: "error" as const, title: "Turno no programado para hoy" };
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

      // ────────────────────────────────────────────────────────────
      // Branch on attendance_mode:
      //   • clock / hybrid → create time_entry + clock_in event (payroll-relevant)
      //   • arrival        → only register an "arrival" event (presence only)
      // ────────────────────────────────────────────────────────────
      const labels = actionLabelsForMode(selectedShift.attendance_mode);

      if (selectedShift.attendance_mode === "arrival") {
        const { error } = await supabase.from("clock_events").insert({
          employee_id: employeeId, company_id: companyId, shift_id: selectedShift.id,
          time_entry_id: null,
          type: "arrival",
          latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null,
          accuracy: pos?.accuracy ?? null, device, photo_url: photoUrl,
          // Trigger compute_clock_event_attendance() will set is_payroll_relevant=false
          // and compute punctuality automatically.
        } as any);
        if (error) throw error;
      } else {
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
      }

      setSuccessState({ type: "in", time: format(new Date(), "HH:mm"), shift: selectedShift.title });
      toast({ title: labels.inSuccess });
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
  const activeShift = activeEntry ? todayShifts.find(s => s.id === activeEntry.shift_id) : null;

  // Resolve the single shift currently in focus (active > selected > only-one-today).
  const focusShift: TodayShift | null =
    activeShift ?? selectedShift ?? (todayShifts.length === 1 ? todayShifts[0] : null);

  // Other shifts of the day (excluding the focused one and already-clocked entries) — feed Zone 2.
  const otherShifts = todayShifts.filter(s => s.id !== focusShift?.id);
  const closedEntries = todayEntries.filter(e => e.clock_out);
  const hasZone2Content = otherShifts.length > 0 || closedEntries.length > 0;

  return (
    <div className="animate-fade-in pb-24">
      {/* ─── Profile photo gate — high-priority blocker ─── */}
      {!hasProfilePhoto && (
        <button
          onClick={() => navigate("/portal/profile")}
          className="w-full mb-3 rounded-xl border bg-card p-3 flex items-center gap-3 transition-all hover:bg-muted/30 active:scale-[0.99] relative overflow-hidden"
        >
          <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-destructive" />
          <div className="h-8 w-8 rounded-lg bg-destructive/[0.08] flex items-center justify-center shrink-0 ml-1">
            <Camera className="h-4 w-4 text-destructive" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-foreground">Profile photo required</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Tap to upload before clocking in</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        </button>
      )}

      {/* ─── Success toast inline — auto-dismiss ─── */}
      {successState && (
        <div className="mb-3 rounded-xl border bg-card p-3 flex items-center gap-3 animate-fade-in relative overflow-hidden">
          <span className={cn(
            "absolute left-0 top-0 bottom-0 w-[2px]",
            successState.type === "in" ? "bg-earning" : "bg-primary",
          )} />
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ml-1",
            successState.type === "in" ? "bg-earning/[0.08] text-earning" : "bg-primary/[0.08] text-primary",
          )}>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground">
              {successState.type === "in" ? "Clock-in recorded" : "Clock-out recorded"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {successState.shift} · <span className="tabular-nums font-medium">{successState.time}</span>
            </p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
           ZONE 1 — Primary action
           One mission per screen: clock in or clock out.
           ════════════════════════════════════════════════ */}
      <section
        className={cn(
          "rounded-2xl border overflow-hidden",
          isClockedIn
            ? "bg-card border-earning/30 shadow-[0_4px_20px_-8px_hsl(var(--earning)/0.18)]"
            : focusShift
            ? "bg-card border-primary/25"
            : "bg-card border-border/40",
        )}
      >
        {/* ── State header — single source of operational status ── */}
        {isClockedIn ? (
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-earning opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-earning" />
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-widest text-earning">On shift</span>
            </div>
            <p className="text-[10.5px] text-muted-foreground/70 tabular-nums">
              Started {format(new Date(activeEntry!.clock_in), "HH:mm")}
            </p>
          </div>
        ) : (
          <div className="px-4 pt-3.5 pb-1 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55">
              {focusShift ? "Ready to clock in" : "No shift selected"}
            </p>
            <p className="text-[10.5px] text-muted-foreground/70 tabular-nums">
              {format(now, "HH:mm:ss")}
            </p>
          </div>
        )}

        {/* ── Hero center — timer (if clocked in) or shift identity ── */}
        <div className="px-4 pt-1 pb-3 text-center">
          {isClockedIn ? (
            <>
              <p className="text-[44px] leading-none font-bold font-mono tabular-nums text-foreground">
                {getElapsed()}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 mt-2 font-semibold">
                Elapsed
              </p>
            </>
          ) : focusShift ? (
            <>
              <p className="text-[16px] font-bold text-foreground leading-tight line-clamp-2">
                {focusShift.title}
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-2 text-[12px] text-muted-foreground/85">
                <Clock className="h-3 w-3 opacity-60" />
                <span className="tabular-nums font-medium">
                  {focusShift.start_time.slice(0, 5)}–{focusShift.end_time.slice(0, 5)}
                </span>
                {focusShift.location_name && (
                  <>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="truncate max-w-[140px]">{focusShift.location_name}</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-[42px] leading-none font-semibold font-mono tabular-nums text-foreground">
                {format(now, "HH:mm")}
              </p>
              <p className="text-[11px] text-muted-foreground/65 capitalize mt-2">
                {format(now, "EEEE, MMMM d", { locale: enUS })}
              </p>
            </>
          )}
        </div>

        {/* ── Inline blocker — only when relevant ── */}
        {!isClockedIn && clockInBlocked && focusShift && (
          <div className="mx-4 mb-3 rounded-lg bg-warning/[0.06] border border-warning/15 px-3 py-2 flex items-start gap-2">
            <Clock className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground/85 font-medium leading-relaxed">{clockInBlocked}</p>
          </div>
        )}

        {/* ── Primary CTA — single dominant action ── */}
        <div className="px-4 pb-4">
          {isClockedIn ? (
            <Button
              onClick={initiateClockOut}
              disabled={acting}
              className="w-full h-14 rounded-xl text-[15px] font-bold gap-2.5 transition-all active:scale-[0.98] bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-md shadow-destructive/15"
            >
              {acting ? (
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <><LogOut className="h-4 w-4" /> Clock Out</>
              )}
            </Button>
          ) : focusShift ? (
            <Button
              onClick={initiateClockIn}
              disabled={acting || !companyId || !!clockInBlocked || !hasProfilePhoto}
              className="w-full h-14 rounded-xl text-[15px] font-bold gap-2.5 transition-all active:scale-[0.98] bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/15 disabled:opacity-40 disabled:shadow-none"
            >
              {acting ? (
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <><LogIn className="h-4 w-4" /> Clock In</>
              )}
            </Button>
          ) : (
            // Empty-state CTA: no shift, sober informational block (no fake CTA).
            <div className="rounded-xl bg-muted/30 border border-border/30 px-4 py-3.5 flex flex-col items-center text-center gap-1">
              <CalendarDays className="h-5 w-5 text-muted-foreground/45" />
              <p className="text-[12.5px] font-semibold text-foreground">
                {hasDailyOnlyShifts ? "Daily-pay shifts today" : "No shifts to clock"}
              </p>
              <p className="text-[10.5px] text-muted-foreground/65 max-w-[260px] leading-relaxed">
                {hasDailyOnlyShifts
                  ? "Today's shifts don't require clocking in. Pay is calculated automatically."
                  : "Contact your supervisor if a shift is missing."}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════
           ZONE 2 — Today
           Secondary, scannable. Other shifts + closed entries + alt methods.
           ════════════════════════════════════════════════ */}
      {hasZone2Content && (
        <section className="mt-5">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55">
              Today
            </h2>
            <p className="text-[10.5px] text-muted-foreground/50 tabular-nums">
              {totalHoursToday()} · {todayEntries.length} entr{todayEntries.length === 1 ? "y" : "ies"}
            </p>
          </div>

          <div className="rounded-2xl border border-border/40 bg-card overflow-hidden divide-y divide-border/30">
            {/* Other selectable shifts */}
            {otherShifts.map(s => {
              const alreadyClocked = todayEntries.some(e => e.shift_id === s.id);
              const timeCheck = isClockInAllowed(s);
              return (
                <button
                  key={s.id}
                  disabled={alreadyClocked || isClockedIn}
                  onClick={() => setSelectedShift(s)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                    !alreadyClocked && !isClockedIn && "hover:bg-muted/30 active:bg-muted/50",
                    (alreadyClocked || isClockedIn) && "opacity-55 cursor-not-allowed",
                  )}
                >
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground truncate">{s.title}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 tabular-nums">
                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      {s.location_name && <> · <span className="text-muted-foreground/55">{s.location_name}</span></>}
                    </p>
                  </div>
                  {alreadyClocked ? (
                    <OpsStatusChip label="Done" tone="success" size="sm" />
                  ) : !timeCheck.allowed ? (
                    <OpsStatusChip label="Not yet" tone="warning" size="sm" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                  )}
                </button>
              );
            })}

            {/* Closed entries — minimal rows */}
            {closedEntries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="h-8 w-8 rounded-lg bg-earning/[0.08] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-earning" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground tabular-nums font-mono">
                    {format(new Date(entry.clock_in), "HH:mm")}
                    <span className="text-muted-foreground/40 mx-1.5 font-sans">→</span>
                    {entry.clock_out ? format(new Date(entry.clock_out), "HH:mm") : "—"}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground/65 mt-0.5 tabular-nums">
                    {getDuration(entry)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Alt methods — minimal, low-emphasis row ─── */}
      {(hasQrShifts || (!isClockedIn && allowManual)) && (
        <div className="mt-3 flex items-center gap-2">
          {hasQrShifts && (
            <Button
              variant="ghost"
              onClick={() => setQrScannerOpen(true)}
              className="flex-1 h-10 rounded-xl text-[12px] font-medium text-muted-foreground gap-1.5 hover:bg-muted/40 hover:text-foreground"
            >
              <ScanLine className="h-3.5 w-3.5" />
              Scan QR
            </Button>
          )}
          {!isClockedIn && allowManual && (
            <Button
              variant="ghost"
              onClick={() => setRequestOpen(true)}
              className={cn(
                "h-10 rounded-xl text-[12px] font-medium text-muted-foreground gap-1.5 hover:bg-muted/40 hover:text-foreground",
                hasQrShifts ? "flex-1" : "w-full",
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              Report time
            </Button>
          )}
        </div>
      )}

      {/* ─── Manual time request dialog ─── */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Report uncaptured time
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Describe what hours you worked and why you couldn't clock in.</p>
            <Textarea value={requestMessage} onChange={e => setRequestMessage(e.target.value)}
              placeholder="E.g.: I worked from 8:00 to 17:00 but couldn't clock in because..." rows={4} className="text-sm resize-none rounded-xl" />
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
