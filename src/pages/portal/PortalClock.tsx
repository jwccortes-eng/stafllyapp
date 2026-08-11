import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfDay, endOfDay } from "date-fns";
import { enUS, es } from "date-fns/locale";
import {
  Clock, LogIn, LogOut, MapPin, Timer, CalendarDays,
  FileText, Camera, ScanLine, CheckCircle2, ChevronRight,
} from "lucide-react";
import { capturePosition, getDeviceId, distanceMeters } from "@/lib/geo-helpers";
import { ClockPhotoCapture } from "@/components/portal/ClockPhotoCapture";
import { PortalCaptainEntryCard } from "@/components/portal/PortalCaptainEntryCard";
import { QRScannerDialog } from "@/components/portal/QRScannerDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useClockRequest } from "@/hooks/useClockRequest";
import { clockButtonLabel } from "@/lib/timeclock/clock-request-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OpsStatusChip } from "@/components/operations/OpsStatusChip";
import {
  defaultAttendanceModeForPayType,
  actionLabelsForMode,
  type ShiftAttendanceMode,
} from "@/lib/shift-attendance-mode";
import {
  TenantSafetyBadge,
  QaModeBanner,
} from "@/components/portal/TenantSafetyBadge";
import {
  isDemoWorkerEmail,
  readQaModeFlag,
  syncQaModeFromUrl,
  tenantSafetyFlags,
} from "@/lib/qa-mode";
import { useT } from "@/i18n/LanguageContext";
import { getPageCache, setPageCache, hasPageCache } from "@/lib/portal/page-cache";
import { ErrorBlock } from "@/components/ui/error-block";
import { MT, FOCUS_RING, TAP } from "@/lib/mobile/mobile-scale";
import { StatusBadge } from "@/components/ui/status-badge";

const STALE_OPEN_ENTRY_HOURS = 24;

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
  shift_ref: string | null;
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
    return { withinSchedule: false, message: `Estás fuera de la ventana estimada (entrada ${shift.start_time.slice(0, 5)} · salida estimada ${shift.end_time.slice(0, 5)}).` };
  }
  return { withinSchedule: true, message: "" };
}

function getEntryAgeHours(entry: TimeEntry | null, now: Date): number | null {
  if (!entry?.clock_in) return null;
  return Math.max(0, (now.getTime() - new Date(entry.clock_in).getTime()) / 36e5);
}

export default function PortalClock() {
  const { effectiveEmployeeId, stableEmployeeId, isResolvingEmployee } = useEffectiveEmployee();
  const employeeId = stableEmployeeId;
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const urlShiftId = searchParams.get("shiftId");

  // Cross-mount snapshot so bottom-nav return doesn't strip clock UI.
  // Only display/operational state is cached — never payroll math.
  interface ClockSnapshot {
    activeEntry: TimeEntry | null;
    todayEntries: TimeEntry[];
    companyId: string | null;
    companyFlags: { name: string | null; is_demo: boolean; is_test: boolean } | null;
    todayShifts: TodayShift[];
    hasProfilePhoto: boolean;
    clockPhotoRequired: boolean;
    shiftQrModes: Record<string, string>;
    allowedMethods: string[];
    hasDailyOnlyShifts: boolean;
    staleOpenEntry: { entry: TimeEntry; shift: TodayShift | null } | null;
  }
  const PAGE_KEY = "portal:clock";
  const cached = getPageCache<ClockSnapshot>(PAGE_KEY, employeeId);

  const [loading, setLoading] = useState(!cached);
  /** P0-A: intención en curso, para poder verificar el estado real del servidor. */
  const clockIntentRef = useRef<
    { type: "in"; shiftId: string } | { type: "out"; entryId: string } | null
  >(null);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(cached?.activeEntry ?? null);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>(cached?.todayEntries ?? []);
  const [companyId, setCompanyId] = useState<string | null>(cached?.companyId ?? null);
  const [companyFlags, setCompanyFlags] = useState<{
    name: string | null;
    is_demo: boolean;
    is_test: boolean;
  } | null>(cached?.companyFlags ?? null);
  const [qaMode, setQaMode] = useState<boolean>(false);
  const [tenantConfirmOpen, setTenantConfirmOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>(cached?.todayShifts ?? []);
  const [selectedShift, setSelectedShift] = useState<TodayShift | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [clockInBlocked, setClockInBlocked] = useState<string | null>(null);
  const [hasProfilePhoto, setHasProfilePhoto] = useState(cached?.hasProfilePhoto ?? true);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [pendingClockAction, setPendingClockAction] = useState<"in" | "out" | null>(null);
  const [clockPhotoRequired, setClockPhotoRequired] = useState(cached?.clockPhotoRequired ?? false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [shiftQrModes, setShiftQrModes] = useState<Record<string, string>>(cached?.shiftQrModes ?? {});
  const [allowedMethods, setAllowedMethods] = useState<string[]>(cached?.allowedMethods ?? ["manual", "gps", "qr", "kiosk"]);
  const [successState, setSuccessState] = useState<{ type: "in" | "out"; time: string; shift: string } | null>(null);
  const [hasDailyOnlyShifts, setHasDailyOnlyShifts] = useState(cached?.hasDailyOnlyShifts ?? false);
  const [staleOpenEntry, setStaleOpenEntry] = useState<{ entry: TimeEntry; shift: TodayShift | null } | null>(cached?.staleOpenEntry ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingEmployeeProfile, setMissingEmployeeProfile] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // QA mode: sync from URL once, then resolve flag + demo-worker auto-detect.
  useEffect(() => {
    syncQaModeFromUrl(window.location.search);
    setQaMode(readQaModeFlag() || isDemoWorkerEmail(user?.email));
  }, [user?.email]);

  useEffect(() => {
    if (!selectedShift) { setClockInBlocked(null); return; }
    const check = isClockInAllowed(selectedShift);
    setClockInBlocked(check.allowed ? null : check.message);
  }, [selectedShift, now]);

  const loadData = useCallback(async () => {
    if (!employeeId) {
      setMissingEmployeeProfile(!isResolvingEmployee);
      setLoading(false);
      return;
    }
    // First load only — subsequent visits keep current UI on screen
    // while the refetch runs silently in background.
    if (!hasPageCache(PAGE_KEY, employeeId)) setLoading(true);
    setLoadError(null);
    setMissingEmployeeProfile(false);
    try {
      const [empRes] = await Promise.all([
        supabase
          .from("employees")
          .select("company_id, avatar_url, companies(name, is_demo, is_test)")
          .eq("id", employeeId)
          .maybeSingle(),
      ]);
      const emp = empRes.data as any;
      if (!emp) {
        setMissingEmployeeProfile(true);
        setLoading(false);
        return;
      }
    // Local copies for snapshot (state setters are async).
    let nextClockPhotoRequired = clockPhotoRequired;
    let nextAllowedMethods = allowedMethods;
      setCompanyId(emp.company_id);
      setHasProfilePhoto(!!emp.avatar_url);
      setCompanyFlags({
        name: emp.companies?.name ?? null,
        is_demo: emp.companies?.is_demo === true,
        is_test: emp.companies?.is_test === true,
      });
      // Read clock_config (consolidated namespace)
      const { data: clockCfgRow } = await supabase
        .from("company_settings").select("value").eq("company_id", emp.company_id).eq("key", "clock_config").maybeSingle();
      const clockCfg = (clockCfgRow?.value && typeof clockCfgRow.value === "object") ? clockCfgRow.value as Record<string, unknown> : {};
      nextClockPhotoRequired = clockCfg.require_photo === true;
      setClockPhotoRequired(nextClockPhotoRequired);
      if (Array.isArray(clockCfg.allowed_methods) && clockCfg.allowed_methods.length > 0) {
        nextAllowedMethods = clockCfg.allowed_methods as string[];
        setAllowedMethods(nextAllowedMethods);
      }

      const today = new Date();
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();
      const todayStr = format(today, "yyyy-MM-dd");

      const [entriesRes, openEntriesRes, shiftsRes] = await Promise.all([
      supabase.from("time_entries")
        .select("id, clock_in, clock_out, status, notes, break_minutes, shift_id")
        .eq("employee_id", employeeId).gte("clock_in", dayStart).lte("clock_in", dayEnd)
        .order("clock_in", { ascending: false }),
      // Detect ANY open time entry (not just today's) so workers are never trapped
      // by a stuck/orphan entry from a previous day. The Clock out button must
      // remain reachable even if the entry was opened days ago.
      supabase.from("time_entries")
        .select("id, clock_in, clock_out, status, notes, break_minutes, shift_id")
        .eq("employee_id", employeeId).is("clock_out", null)
        .order("clock_in", { ascending: false }).limit(1),
      // Hide soft-deleted shifts (see src/lib/shifts/visibility.ts)
      // Hide drafts and draft reservations (see src/lib/shifts/shift-guards.ts):
      // a draft must NEVER allow clock-in or generate time_entries.
      supabase.from("shift_assignments")
        .select("shift_id, status, scheduled_shifts!inner(id, title, start_time, end_time, shift_code, shift_ref, date, pay_type, attendance_mode, qr_attendance_mode, qr_token, locations(name), clients(name))")
        .eq("employee_id", employeeId).eq("scheduled_shifts.date", todayStr)
        .eq("is_draft_reservation", false)
        .is("scheduled_shifts.deleted_at", null)
        .eq("scheduled_shifts.publication_status", "published")
        .not("scheduled_shifts.status", "in", "(cancelled,canceled)")
        .in("status", ["confirmed", "pending"]),
    ]);

      const list = (entriesRes.data ?? []) as TimeEntry[];
      setTodayEntries(list);
    // Prefer today's open entry; fall back to any open entry from previous days.
      const todayOpen = list.find((e) => !e.clock_out) ?? null;
      const anyOpen = (openEntriesRes.data?.[0] ?? null) as TimeEntry | null;
      setActiveEntry(todayOpen ?? anyOpen);

      const qrModes: Record<string, string> = {};
      const mappedShifts: TodayShift[] = (shiftsRes.data ?? []).map((sa: any) => {
      const ss = sa.scheduled_shifts;
      qrModes[ss.id] = ss.qr_attendance_mode || "disabled";
      return {
        id: ss.id, title: ss.title,
        start_time: ss.start_time, end_time: ss.end_time,
        shift_code: ss.shift_code,
        shift_ref: (ss as any).shift_ref ?? null,
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

    // ── Stale open entry recovery ──
    // If the active open entry is from a previous day, fetch its shift metadata
    // so the focus card + Clock out button render correctly. Without this the
    // worker would see "On shift" on /portal but no Clock out CTA here.
      let stale: { entry: TimeEntry; shift: TodayShift | null } | null = null;
      if (anyOpen && !todayOpen) {
      let staleShift: TodayShift | null = null;
      if (anyOpen.shift_id) {
        const { data: ssRow } = await supabase
          .from("scheduled_shifts")
          .select("id, title, start_time, end_time, shift_code, shift_ref, pay_type, attendance_mode, locations(name), clients(name)")
          .eq("id", anyOpen.shift_id)
          .maybeSingle();
        if (ssRow) {
          const ss: any = ssRow;
          staleShift = {
            id: ss.id, title: ss.title,
            start_time: ss.start_time, end_time: ss.end_time,
            shift_code: ss.shift_code,
            shift_ref: (ss as any).shift_ref ?? null,
            location_name: ss.locations?.name,
            client_name: ss.clients?.name,
            pay_type: ss.pay_type,
            attendance_mode:
              (ss.attendance_mode as ShiftAttendanceMode) ??
              defaultAttendanceModeForPayType(ss.pay_type),
          };
          // Make sure the focus card can resolve activeShift via todayShifts lookup.
          if (!actionableShifts.some(s => s.id === staleShift!.id)) {
            actionableShifts.push(staleShift);
          }
        }
      }
      stale = { entry: anyOpen, shift: staleShift };
    }
      setStaleOpenEntry(stale);

    // Daily-only-with-no-arrival edge case (shouldn't happen w/ defaults, but guard):
      setHasDailyOnlyShifts(actionableShifts.length === 0 && mappedShifts.length > 0 && !stale);
      setTodayShifts(actionableShifts);
      const activeOpen = todayOpen ?? anyOpen;
      if (!activeOpen) {
        const preselect = urlShiftId ? actionableShifts.find(s => s.id === urlShiftId) : null;
        if (preselect) setSelectedShift(preselect);
        else if (actionableShifts.length === 1) setSelectedShift(actionableShifts[0]);
      }
    // Snapshot operational/display state so a bottom-nav return doesn't
    // strip the clock UI back to skeletons. Never persists payroll math.
      setPageCache<ClockSnapshot>(PAGE_KEY, employeeId, {
      activeEntry: todayOpen ?? anyOpen,
      todayEntries: list,
      companyId: emp?.company_id ?? null,
      companyFlags: emp ? {
        name: emp.companies?.name ?? null,
        is_demo: emp.companies?.is_demo === true,
        is_test: emp.companies?.is_test === true,
      } : null,
      todayShifts: actionableShifts,
      hasProfilePhoto: !!emp?.avatar_url,
      clockPhotoRequired: nextClockPhotoRequired,
      shiftQrModes: qrModes,
      allowedMethods: nextAllowedMethods,
      hasDailyOnlyShifts: actionableShifts.length === 0 && mappedShifts.length > 0 && !stale,
      staleOpenEntry: stale,
      });
    } catch (err: any) {
      console.error("[PortalClock] load failed", err);
      setLoadError(err?.message ?? "No pudimos actualizar el reloj.");
    } finally {
      setLoading(false);
    }
    // NOTE: clockPhotoRequired / allowedMethods are intentionally NOT in deps —
    // loadData writes them, so including them creates a self-triggering refetch loop
    // that made the portal feel "stuck refreshing to the same point".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, urlShiftId, isResolvingEmployee]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── P0-A · Clock delivery integrity ───────────────────────────────────
  // Verificación canónica contra el servidor. Nunca se asume éxito ni se crean
  // time_entries locales: se relee la tabla real.
  const verifyClockIntent = useCallback(async (): Promise<boolean> => {
    const intent = clockIntentRef.current;
    if (!intent || !employeeId) return false;
    if (intent.type === "in") {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("shift_id", intent.shiftId)
        .gte("clock_in", startOfDay(new Date()).toISOString())
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    }
    const { data, error } = await supabase
      .from("time_entries")
      .select("id, clock_out")
      .eq("id", intent.entryId)
      .maybeSingle();
    if (error) throw error;
    return !!data?.clock_out;
  }, [employeeId]);

  const clockRequest = useClockRequest({
    verify: verifyClockIntent,
    onConfirmed: async () => { await loadData(); },
  });
  const acting = clockRequest.locked;


  const proceedWithClockIn = () => {
    if (clockPhotoRequired) { setPendingClockAction("in"); setPhotoDialogOpen(true); }
    else handleClockIn(null);
  };

  const initiateClockIn = () => {
    if (!employeeId || !companyId || !selectedShift) return;
    if (!hasProfilePhoto) {
      toast({ title: t("portal.clock.photo_required"), description: t("portal.clock.upload_photo"), variant: "destructive" });
      return;
    }
    const check = isClockInAllowed(selectedShift);
    if (!check.allowed) { toast({ title: t("portal.clock.not_available_yet"), description: check.message, variant: "destructive" }); return; }
    // QA-mode safety: only intercept QA sessions hitting a real tenant.
    // Real workers (no QA flag, non-demo email) are NOT interrupted.
    const flags = tenantSafetyFlags(companyFlags);
    if (qaMode && flags.isReal) {
      setTenantConfirmOpen(true);
      return;
    }
    proceedWithClockIn();
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
    clockIntentRef.current = { type: "in", shiftId: selectedShift.id };
    const clientEventId = createClientEventId();
    const eventTimeDevice = new Date().toISOString();
    const shiftForEvent = selectedShift;
    await clockRequest.submit(async () => {

      let pos: { latitude: number; longitude: number; accuracy: number } | null = null;
      try { pos = await capturePosition(); } catch { /* GPS unavailable */ }
      const device = getDeviceId();

      // Geofence evaluation — captured once so we can both enforce policy AND
      // persist the result onto time_entries (Fase A safe-write).
      //   • null  → no expected location OR GPS unavailable (never "fraud")
      //   • true  → GPS valid AND inside radius
      //   • false → GPS valid AND outside radius
      let withinGeofence: boolean | null = null;

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
          const radius = loc.geofence_radius ?? configRadius;
          if (!pos) {
            // GPS unavailable / denied / timed out — never treated as fraud.
            // within_geofence stays null. We still log a distinct low-severity
            // alert so admins can see the pattern without payroll being touched.
            if (gpsEnforcement === "block") {
              toast({ title: t("portal.clock.enable_location"), description: t("portal.clock.gps_required"), variant: "destructive" });
              throw new Error(t("portal.clock.gps_required"));
            }
            try {
              await supabase.from("clock_alerts").insert({
                employee_id: employeeId, company_id: companyId, shift_id: selectedShift.id,
                type: "GPS_UNAVAILABLE", severity: "low",
                description: "Clock-in without GPS (permission denied, timeout or unsupported).",
              } as any);
            } catch { /* alert is non-critical */ }
          } else {
            const dist = distanceMeters(pos.latitude, pos.longitude, loc.latitude, loc.longitude);
            withinGeofence = dist <= radius;
            if (!withinGeofence) {
              if (gpsEnforcement === "block") {
                toast({ title: t("portal.clock.outside_work_area"), description: t("portal.clock.outside_work_area_desc", { meters: Math.round(dist) }), variant: "destructive" });
                await supabase.from("clock_alerts").insert({ employee_id: employeeId, company_id: companyId, shift_id: selectedShift.id, type: "OUTSIDE_GEOFENCE", severity: "high", description: `Clock-in blocked at ${Math.round(dist)}m` } as any);
                throw new Error(t("portal.clock.outside_work_area_desc", { meters: Math.round(dist) }));
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
        // ── P0 · Offline-first ──────────────────────────────────────────
        // Sin conectividad no se bloquea al worker: el evento se guarda
        // durable en el dispositivo y se sincroniza después. Nunca se crea
        // un time_entry ficticio y payroll sigue leyendo sólo lo canónico.
        const queueOffline = async () => {
          await offlineQueue.enqueue({
            client_event_id: clientEventId,
            type: "CLOCK_IN",
            employee_id: employeeId,
            company_id: companyId,
            shift_id: shiftForEvent.id,
            assignment_id: null,
            time_entry_id: null,
            closes_client_event_id: null,
            event_time_device: eventTimeDevice,
            timezone: deviceTimezone(),
            device_id: device,
            gps: pos,
            within_geofence: withinGeofence,
            photo_url: photoUrl,
            offline: true,
          });
        };

        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          await queueOffline();
          setSelectedShift(null);
          return;
        }

        // Fase A safe-write: persist GPS evidence onto the new time_entry.
        // Payroll math is unchanged — these columns are informational only.
        let insertedEntryId: string | null = null;
        try {
          const { data: insertedEntry, error } = await supabase.from("time_entries").insert({
            employee_id: employeeId, company_id: companyId, clock_in: eventTimeDevice, status: "pending", shift_id: shiftForEvent.id,
            clock_in_lat: pos?.latitude ?? null,
            clock_in_lng: pos?.longitude ?? null,
            clock_in_within_geofence: withinGeofence,
            // Idempotencia: un reintento con la misma clave nunca duplica.
            client_event_id: clientEventId,
            captured_offline: false,
            event_time_device: eventTimeDevice,
            synced_at: new Date().toISOString(),
            sync_delay_seconds: 0,
          } as any).select("id").single();
          if (error) throw error;
          insertedEntryId = insertedEntry?.id ?? null;
        } catch (err) {
          // Entrega incierta (timeout, red caída, 5xx): el fichaje NO se pierde.
          if (isAmbiguousFailure(err)) {
            await queueOffline();
            setSelectedShift(null);
            return;
          }
          throw err;
        }
        if (insertedEntryId) {
          await supabase.from("clock_events").insert({
            employee_id: employeeId, company_id: companyId, shift_id: shiftForEvent.id, time_entry_id: insertedEntryId,
            type: "clock_in", latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null, accuracy: pos?.accuracy ?? null, device, photo_url: photoUrl,
          } as any);
        }
      }


      setSuccessState({ type: "in", time: format(new Date(), "HH:mm"), shift: selectedShift.title });
      toast({ title: labels.inSuccess });
      setTimeout(() => setSuccessState(null), 4000);
      setSelectedShift(null);
    });
  };

  const handleClockOut = async (photoUrl: string | null) => {
    if (!activeEntry || !companyId || !employeeId) return;
    const activeShift = todayShifts.find(s => s.id === activeEntry.shift_id) ?? null;
    const scheduleCheck = isClockOutWithinSchedule(activeShift);
    clockIntentRef.current = { type: "out", entryId: activeEntry.id };
    await clockRequest.submit(async () => {
      const clockOutTime = new Date().toISOString();
      let pos: { latitude: number; longitude: number; accuracy: number } | null = null;
      try { pos = await capturePosition(); } catch { /* GPS unavailable */ }
      const device = getDeviceId();

      // Fase A safe-write: compute clock_out_within_geofence so it can be
      // persisted onto the same row we're closing. We deliberately do NOT
      // re-enforce policy on clock-out — workers must always be able to
      // clock out even if they walked away from the job site.
      //   • null  → no expected location, or GPS unavailable
      //   • true  → GPS valid AND inside radius at clock-out
      //   • false → GPS valid AND outside radius at clock-out
      let withinGeofence: boolean | null = null;
      if (activeEntry.shift_id && pos) {
        const { data: shiftData } = await supabase.from("scheduled_shifts")
          .select("locations(latitude, longitude, geofence_radius)").eq("id", activeEntry.shift_id).maybeSingle();
        const loc = (shiftData as any)?.locations;
        if (loc?.latitude && loc?.longitude) {
          const { data: clockCfgRow } = await supabase.from("company_settings")
            .select("value").eq("company_id", companyId).eq("key", "clock_config").maybeSingle();
          const clockCfg = (clockCfgRow?.value && typeof clockCfgRow.value === "object") ? clockCfgRow.value as Record<string, unknown> : {};
          const configRadius = typeof clockCfg.gps_radius_meters === "number" ? clockCfg.gps_radius_meters : 200;
          const radius = loc.geofence_radius ?? configRadius;
          const dist = distanceMeters(pos.latitude, pos.longitude, loc.latitude, loc.longitude);
          withinGeofence = dist <= radius;
        }
      } else if (activeEntry.shift_id && !pos) {
        // Distinct, low-severity signal: GPS unavailable at clock-out.
        // Never treated as fraud, never alters payroll.
        try {
          await supabase.from("clock_alerts").insert({
            employee_id: employeeId, company_id: companyId, shift_id: activeEntry.shift_id,
            type: "GPS_UNAVAILABLE", severity: "low",
            description: "Clock-out without GPS (permission denied, timeout or unsupported).",
          } as any);
        } catch { /* alert is non-critical */ }
      }

      await supabase.from("clock_events").insert({
        employee_id: employeeId, company_id: companyId, shift_id: activeEntry.shift_id, time_entry_id: activeEntry.id,
        type: "clock_out", latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null, accuracy: pos?.accuracy ?? null, device, photo_url: photoUrl,
      } as any);
      if (!scheduleCheck.withinSchedule) {
        await supabase.from("time_entries").update({
          clock_out: clockOutTime, status: "pending", notes: `⚠️ Clock-out outside scheduled hours.`,
          clock_out_lat: pos?.latitude ?? null,
          clock_out_lng: pos?.longitude ?? null,
          clock_out_within_geofence: withinGeofence,
        } as any).eq("id", activeEntry.id);
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
        const { error } = await supabase.from("time_entries").update({
          clock_out: clockOutTime,
          clock_out_lat: pos?.latitude ?? null,
          clock_out_lng: pos?.longitude ?? null,
          clock_out_within_geofence: withinGeofence,
        } as any).eq("id", activeEntry.id);
        if (error) throw error;
      }
      setSuccessState({ type: "out", time: format(new Date(), "HH:mm"), shift: activeShift?.title ?? "Shift" });
      setTimeout(() => setSuccessState(null), 4000);
    });
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
      toast({ title: t("portal.clock.request_sent"), description: t("portal.clock.request_sent_desc") });
      setRequestOpen(false); setRequestMessage("");
    } catch (err: any) {
      toast({ title: t("portal.clock.error_sending"), description: err.message, variant: "destructive" });
    } finally { setSendingRequest(false); }
  };

  const getElapsed = () => {
    if (!activeEntry) return null;
    const diff = Math.floor((now.getTime() - new Date(activeEntry.clock_in).getTime()) / 1000);
    // Stale recovery: if entry was opened >24h ago, show a sober "—:—:—"
    // to avoid a misleading 73:42:11 timer. The banner above already explains.
    if (diff > 24 * 3600) return "—:—:—";
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

  if (!employeeId && missingEmployeeProfile) {
    return (
      <div className="pt-4">
        <ErrorBlock
          title="No encontramos tu perfil"
          message="No encontramos tu perfil de empleado para esta compañía."
        />
      </div>
    );
  }

  const isClockedIn = !!activeEntry;
  const activeEntryAgeHours = getEntryAgeHours(activeEntry, now);
  const isStaleActiveEntry = activeEntryAgeHours != null && activeEntryAgeHours > STALE_OPEN_ENTRY_HOURS;
  const hasQrShifts = allowedMethods.includes("qr") && Object.values(shiftQrModes).some(m => m !== "disabled" && m !== "");
  const allowManual = allowedMethods.includes("manual");
  const allowGps = allowedMethods.includes("gps");
  const activeShift = activeEntry ? todayShifts.find(s => s.id === activeEntry.shift_id) : null;

  // Resolve the single shift currently in focus (active > selected > only-one-today).
  const focusShift: TodayShift | null =
    activeShift ?? selectedShift ?? (todayShifts.length === 1 ? todayShifts[0] : null);

  // ── Post-clockout state — the focused shift has a *completed* entry today.
  // After Marcar salida, the worker must see "Turno completado" instead of a
  // misleading "Marcar entrada" CTA. Re-clocking the same shift requires an
  // explicit secondary action (not implemented here — keep the screen calm).
  const focusShiftCompletedEntry: TimeEntry | null =
    !isClockedIn && focusShift
      ? todayEntries.find(e => e.shift_id === focusShift.id && !!e.clock_out) ?? null
      : null;

  // Other shifts of the day (excluding the focused one and already-clocked entries) — feed Zone 2.
  const otherShifts = todayShifts.filter(s => s.id !== focusShift?.id);
  const closedEntries = todayEntries.filter(e => e.clock_out);
  // Avoid duplicating the focused shift's closed entry in Zone 2 — it already
  // appears as the primary "Turno completado" card in Zone 1.
  const zone2ClosedEntries = focusShiftCompletedEntry
    ? closedEntries.filter(e => e.id !== focusShiftCompletedEntry.id)
    : closedEntries;
  const hasZone2Content = otherShifts.length > 0 || zone2ClosedEntries.length > 0;


  const safetyFlags = tenantSafetyFlags(companyFlags);

  return (
    <div className="animate-fade-in pb-24">
      {isResolvingEmployee && (
        <div className="mb-3 rounded-xl border border-border/50 bg-card/70 px-3 py-2 text-[12px] text-muted-foreground">
          Actualizando…
        </div>
      )}
      {loadError && (
        <div className="mb-3 rounded-xl border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[12px] text-muted-foreground">
          {loadError}
        </div>
      )}
      {/* ─── Tenant safety badge (always visible) + QA-mode banner ─── */}
      <div className="mb-3">
        <TenantSafetyBadge
          flags={safetyFlags}
          companyName={companyFlags?.name}
          qaMode={qaMode}
        />
      </div>
      {qaMode ? <QaModeBanner isReal={safetyFlags.isReal} /> : null}

      {/* ─── Stage 1 advisory — Connecteam remains payroll source ─── */}
      <div className="mb-3 rounded-xl border border-warning/25 bg-warning/[0.06] p-3 flex items-start gap-2.5">
        <Clock className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground leading-tight">
            {t("portal.clock.stage1.title")}
          </p>
          <p className="text-[12px] text-muted-foreground/85 mt-0.5 leading-snug">
            {t("portal.clock.stage1.body")}
          </p>
        </div>
      </div>

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
            <p className="text-sm font-semibold text-foreground">{t("portal.clock.photo_required")}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">{t("portal.clock.photo_required_subtitle")}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 flip-rtl" />
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
            <p className="text-sm font-semibold text-foreground">
              {successState.type === "in" ? t("portal.clock.clock_in_recorded") : t("portal.clock.clock_out_recorded")}
            </p>
            <p className="text-[12px] text-muted-foreground truncate mt-0.5">
              {successState.shift} · <span className="tabular-nums font-medium">{successState.time}</span>
            </p>
          </div>
        </div>
      )}

      {/* ─── Stale open entry banner — recovery for stuck shifts ─── */}
      {staleOpenEntry && !successState && (
        <div className="mb-3 rounded-xl border border-warning/30 bg-warning/[0.06] p-3 flex items-start gap-3 relative overflow-hidden">
          <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-warning" />
          <div className="h-8 w-8 rounded-lg bg-warning/[0.1] flex items-center justify-center shrink-0 ml-1">
            <Timer className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{t("portal.clock.stale_title")}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
              {t("portal.clock.stale_body", {
                shift: staleOpenEntry.shift?.title ?? t("portal.clock.stale_shift_default"),
                time: format(new Date(staleOpenEntry.entry.clock_in), "d MMM, HH:mm"),
              })}
            </p>
            <p className="text-[12px] text-muted-foreground/70 mt-1 leading-relaxed">
              {t("portal.clock.stale_review_body")}
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
            : focusShiftCompletedEntry
            ? "bg-card border-earning/30"
            : focusShift
            ? "bg-card border-primary/25"
            : "bg-card border-border/40",
        )}
      >
        {focusShiftCompletedEntry && focusShift ? (
          <>
            {/* ── Post-clockout state — shift completed today ── */}
            <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-earning" />
                </span>
                <span className="text-[12px] font-bold uppercase tracking-widest text-earning">
                  {t("portal.clock.completed_label")}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground/70 tabular-nums">
                {format(now, "HH:mm:ss")}
              </p>
            </div>

            <div className="px-4 pt-1 pb-3 text-center">
              <p className="text-[16px] font-bold text-foreground leading-tight line-clamp-2">
                {focusShift.title}
              </p>
              <div className="mt-3 flex items-center justify-center gap-5">
                <div className="text-center">
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground/65 leading-none mb-1">
                    {t("portal.clock.clock_in_label")}
                  </p>
                  <p className="text-[22px] font-bold font-mono tabular-nums text-foreground leading-none">
                    {format(new Date(focusShiftCompletedEntry.clock_in), "HH:mm")}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground/65 leading-none mb-1">
                    {t("portal.clock.clock_out_label")}
                  </p>
                  <p className="text-[22px] font-bold font-mono tabular-nums text-foreground leading-none">
                    {format(new Date(focusShiftCompletedEntry.clock_out!), "HH:mm")}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[12px] text-muted-foreground/80 tabular-nums">
                {t("portal.clock.duration")}: <span className="font-semibold text-foreground">{getDuration(focusShiftCompletedEntry)}</span>
              </p>
              {focusShift.location_name && (
                <p className="mt-1 text-[12px] text-muted-foreground/70 truncate">
                  {focusShift.location_name}
                </p>
              )}
            </div>

            <div className="px-4 pb-4">
              <div className="rounded-xl bg-earning/[0.06] border border-earning/20 px-3 py-3 flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-earning shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground leading-tight">
                    {t("portal.clock.saved_title")}
                  </p>
                  <p className="text-[12px] text-muted-foreground/85 mt-0.5 leading-snug">
                    {t("portal.clock.saved_body")}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ── State header — single source of operational status ── */}
            {isClockedIn ? (
              <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    {!isStaleActiveEntry && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-earning opacity-60" />}
                    <span className={cn("relative inline-flex rounded-full h-2 w-2", isStaleActiveEntry ? "bg-warning" : "bg-earning")} />
                  </span>
                  <span className={cn("text-[12px] font-bold uppercase tracking-widest", isStaleActiveEntry ? "text-warning" : "text-earning")}>{isStaleActiveEntry ? t("portal.clock.needs_review_label") : t("portal.clock.on_shift")}</span>
                </div>
                <p className="text-[12px] text-muted-foreground/70 tabular-nums">
                  {t("portal.clock.started_at", { time: format(new Date(activeEntry!.clock_in), "HH:mm") })}
                </p>
              </div>
            ) : (
              <div className="px-4 pt-3.5 pb-1 flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground/55">
                  {focusShift ? t("portal.clock.ready_to_clock_in") : t("portal.clock.no_shift_selected")}
                </p>
                <p className="text-[12px] text-muted-foreground/70 tabular-nums">
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
                  <p className="text-[12px] uppercase tracking-widest text-muted-foreground/55 mt-2 font-semibold">
                    {t("portal.clock.elapsed")}
                  </p>
                </>
              ) : focusShift ? (
                <>
                  <p className="text-[16px] font-bold text-foreground leading-tight line-clamp-2">
                    {focusShift.title}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-5">
                    <div className="text-center">
                      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground/65 leading-none mb-1">
                        {t("portal.clock.expected_clock_in")}
                      </p>
                      <p className="text-[22px] font-bold font-mono tabular-nums text-foreground leading-none">
                        {focusShift.start_time.slice(0, 5)}
                      </p>
                    </div>
                    <div className="text-center opacity-70">
                      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55 leading-none mb-1">
                        {t("portal.clock.estimated_clock_out")}
                      </p>
                      <p className="text-[16px] font-semibold font-mono tabular-nums text-muted-foreground leading-none">
                        {focusShift.end_time.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                  {focusShift.location_name && (
                    <p className="mt-2 text-[12px] text-muted-foreground/70 truncate">
                      {focusShift.location_name}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[42px] leading-none font-semibold font-mono tabular-nums text-foreground">
                    {format(now, "HH:mm")}
                  </p>
                  <p className="text-[12px] text-muted-foreground/65 first-letter:uppercase mt-2">
                    {format(now, "EEEE d 'de' MMMM", { locale: es })}
                  </p>
                </>
              )}
            </div>

            {/* ── Inline blocker — only when relevant ── */}
            {!isClockedIn && clockInBlocked && focusShift && (
              <div className="mx-4 mb-3 rounded-lg bg-warning/[0.06] border border-warning/15 px-3 py-2 flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                <p className="text-[12px] text-foreground/85 font-medium leading-relaxed">{clockInBlocked}</p>
              </div>
            )}

            {/* ── P0-A · Estado explícito del envío del fichaje ── */}
            {(clockRequest.state.status === "FAILED" || clockRequest.state.status === "UNKNOWN") && (
              <div
                className={cn(
                  "mx-4 mb-3 rounded-lg px-3 py-2.5 border",
                  clockRequest.state.status === "FAILED"
                    ? "bg-destructive/[0.06] border-destructive/20"
                    : "bg-warning/[0.06] border-warning/20",
                )}
                role="status"
              >
                <p className="text-[12px] font-semibold text-foreground">
                  {clockRequest.state.status === "FAILED"
                    ? "No se registró tu fichaje"
                    : "No sabemos si tu fichaje quedó registrado"}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  {clockRequest.state.error ??
                    "La conexión se interrumpió. Verificamos con el servidor antes de permitir otro intento."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-8 rounded-lg text-[12px]"
                  disabled={clockRequest.state.verifying}
                  onClick={() => { void clockRequest.retry(); }}
                >
                  {clockRequest.state.status === "UNKNOWN" ? "Verificar estado real" : "Reintentar"}
                </Button>
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
                    <>
                      <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      {clockButtonLabel(clockRequest.state, t("portal.clock.mark_out"))}
                    </>
                  ) : (
                    <><LogOut className="h-4 w-4" /> {clockButtonLabel(clockRequest.state, t("portal.clock.mark_out"))}</>
                  )}
                </Button>
              ) : focusShift ? (
                <Button
                  onClick={initiateClockIn}
                  disabled={acting || !companyId || !!clockInBlocked || !hasProfilePhoto}
                  className="w-full h-14 rounded-xl text-[15px] font-bold gap-2.5 transition-all active:scale-[0.98] bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/15 disabled:opacity-40 disabled:shadow-none"
                >
                  {acting ? (
                    <>
                      <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      {clockButtonLabel(clockRequest.state, t("portal.clock.mark_in"))}
                    </>
                  ) : (
                    <><LogIn className="h-4 w-4" /> {clockButtonLabel(clockRequest.state, t("portal.clock.mark_in"))}</>
                  )}
                </Button>
              ) : (
                // Empty-state CTA: no shift, sober informational block (no fake CTA).
                <div className="rounded-xl bg-muted/30 border border-border/30 px-4 py-3.5 flex flex-col items-center text-center gap-1">
                  <CalendarDays className="h-5 w-5 text-muted-foreground/45" />
                  <p className="text-sm font-semibold text-foreground">
                    {hasDailyOnlyShifts ? t("portal.clock.daily_only_today") : t("portal.clock.no_shifts_today")}
                  </p>
                  <p className="text-[12px] text-muted-foreground/65 max-w-[260px] leading-relaxed">
                    {hasDailyOnlyShifts
                      ? t("portal.clock.daily_only_subtitle")
                      : t("portal.clock.no_shifts_today_subtitle")}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Captain bridge — only renders for authorized admins / shift leads */}
      {focusShift && (
        <PortalCaptainEntryCard
          shiftId={focusShift.id}
          companyId={companyId}
          employeeId={employeeId}
          isClockedIn={isClockedIn}
          workerCompleted={!!focusShiftCompletedEntry}
        />
      )}




      {/* ════════════════════════════════════════════════
           ZONE 2 — Today
           Secondary, scannable. Other shifts + closed entries + alt methods.
           ════════════════════════════════════════════════ */}
      {hasZone2Content && (
        <section className="mt-5">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground/55">
              {t("portal.clock.today_section")}
            </h2>
            <p className="text-[12px] text-muted-foreground/50 tabular-nums">
              {totalHoursToday()} · {todayEntries.length} {todayEntries.length === 1 ? t("portal.clock.entries_one") : t("portal.clock.entries_many")}
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
                    "w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left transition-colors",
                    FOCUS_RING,
                    !alreadyClocked && !isClockedIn && "hover:bg-muted/30 active:bg-muted/50",
                    (alreadyClocked || isClockedIn) && "opacity-55 cursor-not-allowed",
                  )}
                >
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground truncate">{s.title}</p>
                    <p className="text-[12px] text-muted-foreground/70 mt-0.5">
                      <span className="font-semibold text-foreground">{t("portal.clock.clock_in_label")} <span className="tabular-nums font-mono">{s.start_time.slice(0, 5)}</span></span>
                      {s.end_time && (
                        <span className="text-muted-foreground/60"> · {t("portal.clock.ends_approx")} <span className="tabular-nums font-mono">{s.end_time.slice(0, 5)}</span></span>
                      )}
                      {s.location_name && <> · <span className="text-muted-foreground/55">{s.location_name}</span></>}
                    </p>
                  </div>
                  {alreadyClocked ? (
                    <OpsStatusChip label={t("portal.clock.done")} tone="success" size="sm" />
                  ) : !timeCheck.allowed ? (
                    <OpsStatusChip label={t("portal.clock.not_yet")} tone="warning" size="sm" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 flip-rtl" />
                  )}
                </button>
              );
            })}

            {/* Closed entries — minimal rows */}
            {zone2ClosedEntries.map(entry => (
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
                  <p className="text-[12px] text-muted-foreground/65 mt-0.5 tabular-nums">
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
              className={cn("flex-1 min-h-11 rounded-xl text-[12px] font-medium text-muted-foreground gap-1.5 hover:bg-muted/40 hover:text-foreground", FOCUS_RING)}
            >
              <ScanLine className="h-3.5 w-3.5" />
              {t("portal.clock.scan_qr")}
            </Button>
          )}
          {!isClockedIn && allowManual && (
            <Button
              variant="ghost"
              onClick={() => setRequestOpen(true)}
              className={cn(
                "min-h-11 rounded-xl text-[12px] font-medium text-muted-foreground gap-1.5 hover:bg-muted/40 hover:text-foreground",
                FOCUS_RING,
                hasQrShifts ? "flex-1" : "w-full",
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              {t("portal.clock.report_time")}
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
              {t("portal.clock.report_time_dialog_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("portal.clock.report_time_dialog_desc")}</p>
            <Textarea value={requestMessage} onChange={e => setRequestMessage(e.target.value)}
              placeholder={t("portal.clock.report_time_placeholder")} rows={4} className="text-sm resize-none rounded-xl" />
            <Button onClick={handleSendTimeRequest} disabled={sendingRequest || !requestMessage.trim()} className="w-full h-11 text-sm font-bold rounded-xl">
              {sendingRequest ? <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" /> : null}
              {t("portal.clock.send_request")}
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

      {/* QA-mode real-tenant confirmation dialog (only shown when both apply) */}
      <Dialog open={tenantConfirmOpen} onOpenChange={setTenantConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Real tenant — confirm clock-in</DialogTitle>
            <DialogDescription>
              This is a real tenant
              {companyFlags?.name ? ` (${companyFlags.name})` : ""}. Clock entries
              may affect operational review. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setTenantConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setTenantConfirmOpen(false);
                proceedWithClockIn();
              }}
            >
              Continue on real tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
