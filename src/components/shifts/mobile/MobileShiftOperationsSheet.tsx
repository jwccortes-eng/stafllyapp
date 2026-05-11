import { useEffect, useMemo, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Clock, MapPin, Building2, Users, Phone, FileEdit, AlertTriangle,
  CheckCircle2, CalendarDays, Sparkles, UserPlus, Share2, ClipboardList,
  ExternalLink, Copy, StickyNote, Hash, Tag, Workflow, ChevronDown,
  ShieldCheck, MessageCircle, MessageSquare, Crown, Loader2, Bell,
} from "lucide-react";
import { SendNotificationDialog } from "@/components/shifts/SendNotificationDialog";
import { buildWhatsAppTargets, normalizePhone } from "@/lib/phone";
import { format, parseISO, isToday, isTomorrow, isPast, isThisWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isDraftShift, isPublishedShift } from "@/lib/shifts/shift-guards";
import { formatShiftCode, type Shift, type Assignment, type Employee } from "@/components/shifts/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { staffedAssignments } from "@/lib/shifts/assignment-coverage";
import { canManageShifts } from "@/lib/shifts/shift-permissions";
import { ShiftAttendancePanel } from "@/components/shifts/ShiftAttendancePanel";
import { MobileShiftTeamHub } from "@/components/shifts/mobile/MobileShiftTeamHub";
import { ShiftCloseoutSection } from "@/components/shifts/closeout/ShiftCloseoutSection";
import {
  TraceabilitySnapshot,
  type TraceRisk,
  type TraceTimelineEvent,
  type TraceLinkedRecord,
  type TraceSourceKind,
} from "@/components/traceability/TraceabilitySnapshot";

/**
 * MobileShiftOperationsSheet — Mobile Shifts Phase 1.5
 *
 * Operations Snapshot for a shift. Frontend-only, READ-ONLY for mutations.
 * No queries — consumes data already loaded by MobileShiftsView.
 * No notifications, no DB writes, no schema/RLS impact.
 */

/**
 * Centralized operator-facing helper copy. Kept local: action labels,
 * badges, section titles, dynamic aria labels, and dev-only strings.
 *
 * i18n-ready: keys are flat for now and grouped by section via comments.
 * When a translation system is added, swap string values for `t(key)`
 * without touching the JSX.
 */
const MOBILE_SHIFT_COPY = {
  // Shared
  readOnlyMobile: "Solo lectura en móvil",

  // Coverage section
  coverageHelper: "Cupos requeridos, trabajadores asignados y estado actual de personal.",

  // Assigned workers section
  assignedWorkersHelper: "Revisa el equipo asignado y contáctalos desde el móvil.",
  assignedSortedHelper: "Ordenado por rol y estado de asistencia.",
  noWorkersTitle: "Aún no hay trabajadores asignados",
  noWorkersHelper: "Agrega trabajadores desde escritorio antes de revisar cobertura o asistencia.",

  // Attendance section
  attendanceSectionHelper: "Revisa la actividad de entrada y salida.",
  attendanceUnavailableTitle: "Asistencia no disponible",
  attendanceUnavailableHelper: "Asigna trabajadores antes de revisar la asistencia.",
  noClockActivityTitle: "Sin actividad de reloj",
  noClockActivityHelper: "La actividad de entrada y salida aparecerá aquí cuando los trabajadores empiecen.",

  // Shift details section
  shiftDetailsHelper: "Información principal del turno.",
  noClientTitle: "Falta cliente",
  noClientHelper: "Agrega el cliente desde escritorio para identificar este turno fácilmente.",
  noLocationTitle: "Falta ubicación del trabajo",
  noLocationHelper: "Agrega la ubicación desde escritorio. El punto de encuentro es distinto — es donde se reúnen los trabajadores, no el lugar real.",
  noLocationOrMeetingTitle: "Falta ubicación y punto de encuentro",
  noLocationOrMeetingHelper: "Los trabajadores no sabrán a dónde ir. Agrega una ubicación desde escritorio.",
  noMeetingPoint: "Sin punto de encuentro.",

  // Notes section
  notesSectionHelper: "Notas internas de este turno.",
  noNotesTitle: "Sin notas",
  noNotesHelper: "Las notas internas se pueden agregar desde escritorio por ahora.",

  // Worker row — no phone state
  noPhoneTitle: "Sin teléfono registrado",
  noPhoneHelper: "Agrega un número en el perfil del trabajador para habilitar llamada, SMS y WhatsApp.",

  // Error states
  teamErrorTitle: "No se pudo cargar el equipo",
  teamErrorHelper: "Revisa tu conexión e intenta de nuevo. No se cambió ningún dato del turno.",
} as const;

interface Props {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
  employees: Employee[];
  clientName: string;
  locationName: string;
  /** Optional — if a meeting point text is available, pass it. */
  meetingPoint?: string | null;
  /** When true and the sheet opens, immediately open the Manage Team hub. */
  initialOpenTeamHub?: boolean;
}

function formatTimeShort(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function dateLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEEE, MMM d", { locale: enUS });
  } catch { return dateStr; }
}

function initials(e: Employee): string {
  const a = e.first_name?.[0] ?? "";
  const b = e.last_name?.[0] ?? "";
  return (a + b).toUpperCase() || "·";
}

export function MobileShiftOperationsSheet({
  shift, open, onOpenChange, assignments, employees,
  clientName, locationName, meetingPoint, initialOpenTeamHub,
}: Props) {
  const navigate = useNavigate();
  const [traceOpen, setTraceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);

  // Auto-open Manage Team hub when requested by deep-link intent.
  useEffect(() => {
    if (open && initialOpenTeamHub && shift) {
      setHubOpen(true);
    }
  }, [open, initialOpenTeamHub, shift?.id]);
  const { allRoles, canAccessAdminForCompany } = useAuth();
  const { selectedCompanyId } = useCompany();

  // Per-shift attendance + clock cache. Loaded when sheet opens.
  type AsgnExtra = {
    id: string;
    employee_id: string;
    status: string;
    response_status: string | null;
    attendance_status: string | null;
    assignment_role: string | null;
    accepted_at: string | null;
    rejected_at: string | null;
    responded_at: string | null;
  };
  const [asgnExtras, setAsgnExtras] = useState<AsgnExtra[]>([]);
  const [clockByEmp, setClockByEmp] = useState<Record<string, { clock_in: string | null; clock_out: string | null }>>({});
  const [shiftAdminId, setShiftAdminId] = useState<string | null>(null);
  const [shiftMeeting, setShiftMeeting] = useState<{ point: string | null; time: string | null }>({ point: null, time: null });
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!shift || !open) return;
    setLoadingTeam(true);
    setTeamError(null);
    (async () => {
      const [asgnRes, teRes, shiftRes] = await Promise.all([
        supabase
          .from("shift_assignments")
          .select("id, employee_id, status, response_status, attendance_status, assignment_role, accepted_at, rejected_at, responded_at")
          .eq("shift_id", shift.id),
        supabase
          .from("time_entries")
          .select("employee_id, clock_in, clock_out")
          .eq("shift_id", shift.id)
          .neq("status", "rejected"),
        supabase
          .from("scheduled_shifts")
          .select("shift_admin_id, meeting_point, meeting_time")
          .eq("id", shift.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (asgnRes.error || teRes.error) {
        setTeamError(MOBILE_SHIFT_COPY.teamErrorTitle);
      }
      setAsgnExtras(((asgnRes.data ?? []) as any));
      const sd = (shiftRes.data as any) ?? null;
      setShiftAdminId(sd?.shift_admin_id ?? null);
      setShiftMeeting({ point: sd?.meeting_point ?? null, time: sd?.meeting_time ?? null });
      const map: Record<string, { clock_in: string | null; clock_out: string | null }> = {};
      for (const te of (teRes.data ?? []) as any[]) {
        const prev = map[te.employee_id];
        if (!prev || (te.clock_in && (!prev.clock_in || te.clock_in < prev.clock_in))) {
          map[te.employee_id] = { clock_in: te.clock_in, clock_out: te.clock_out };
        }
      }
      setClockByEmp(map);
      setLoadingTeam(false);
    })();
    return () => { cancelled = true; };
  }, [shift?.id, open, reloadKey]);

  const canValidate = canManageShifts({ allRoles, canAccessAdminForCompany, companyId: selectedCompanyId });

  const data = useMemo(() => {
    if (!shift) return null;

    const empById = new Map(employees.map(e => [e.id, e]));
    // UNIFIED COVERAGE: scheduled = anything not rejected/removed.
    // No more "confirmed-only" filter — that was the mobile vs desktop drift.
    const shiftAsgns = staffedAssignments(assignments, shift.id);
    const assignedWorkers = shiftAsgns
      .map(a => empById.get(a.employee_id))
      .filter(Boolean) as Employee[];

    const slots = shift.slots ?? 0;
    const assignedCount = shiftAsgns.length;
    const coverage = slots > 0 ? Math.round((assignedCount / slots) * 100) : (assignedCount > 0 ? 100 : 0);
    const understaffed = slots > 0 && assignedCount < slots;
    const fullyStaffed = slots > 0 && assignedCount >= slots;
    const draft = isDraftShift(shift);
    const published = isPublishedShift(shift);
    const noClient = !shift.client_id;
    const noLocation = !shift.location_id;
    const hours = calcHours(shift.start_time, shift.end_time);

    let dateBucket: "today" | "tomorrow" | "past" | "future" = "future";
    try {
      const d = parseISO(shift.date);
      if (isToday(d)) dateBucket = "today";
      else if (isTomorrow(d)) dateBucket = "tomorrow";
      else if (isPast(d)) dateBucket = "past";
    } catch { /* noop */ }

    let weekendLabel: string | null = null;
    try {
      const d = parseISO(shift.date);
      const day = d.getDay();
      if (day === 0) weekendLabel = "Sunday";
      else if (day === 6) weekendLabel = "Saturday";
      else if (day === 5) weekendLabel = "Friday night";
    } catch { /* noop */ }

    let weekBucket: { label: string; tone: "info" | "muted" } | null = null;
    try {
      const d = parseISO(shift.date);
      // Wed–Tue pay-period anchor would require pay_periods data which is not
      // loaded here. Fall back to a calendar-week context only — read-only.
      if (isThisWeek(d, { weekStartsOn: 1 })) {
        weekBucket = { label: "This week", tone: "info" };
      } else if (isPast(d)) {
        weekBucket = { label: "Past week", tone: "muted" };
      } else {
        weekBucket = { label: "Future week", tone: "muted" };
      }
    } catch { /* noop */ }

    return {
      shiftAsgns, assignedWorkers, slots, assignedCount, coverage,
      understaffed, fullyStaffed, draft, published, noClient, noLocation,
      hours, dateBucket, weekendLabel, weekBucket,
    };
  }, [shift, assignments, employees]);

  const assignedWorkers = data?.assignedWorkers ?? [];
  const slots = data?.slots ?? 0;
  const assignedCount = data?.assignedCount ?? 0;
  const coverage = data?.coverage ?? 0;
  const understaffed = data?.understaffed ?? false;
  const fullyStaffed = data?.fullyStaffed ?? false;
  const draft = data?.draft ?? false;
  const published = data?.published ?? false;
  const noClient = data?.noClient ?? false;
  const noLocation = data?.noLocation ?? false;
  const hours = data?.hours ?? null;
  const dateBucket = data?.dateBucket ?? "future";
  const weekendLabel = data?.weekendLabel ?? null;
  const weekBucket = data?.weekBucket ?? null;

  // ── Memoized assignment lookup + sorted workers (avoids repeated .find in sort/map)
  const asgnByEmployeeId = useMemo(() => {
    const map = new Map<string, AsgnExtra>();
    for (const item of asgnExtras) {
      map.set(item.employee_id, item);
    }
    return map;
  }, [asgnExtras]);

  const sortedAssignedWorkers = useMemo(() => {
    return [...assignedWorkers].sort((a, b) => {
      const ea = asgnByEmployeeId.get(a.id) ?? null;
      const eb = asgnByEmployeeId.get(b.id) ?? null;
      const sa = getWorkerSortScore(a, ea, clockByEmp[a.id], shiftAdminId, dateBucket);
      const sb = getWorkerSortScore(b, eb, clockByEmp[b.id], shiftAdminId, dateBucket);
      if (sa !== sb) return sa - sb;
      const na = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim().toLowerCase();
      const nb = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim().toLowerCase();
      return na.localeCompare(nb);
    });
  }, [assignedWorkers, asgnByEmployeeId, clockByEmp, shiftAdminId, dateBucket]);

  if (!shift || !data) return null;

  // ── Smart brief (deterministic) — only actionable issues, ordered by urgency.
  const briefMessages: { tone: "good" | "warn" | "bad" | "info"; text: string }[] = [];
  if (published && understaffed) {
    const missing = slots - assignedCount;
    briefMessages.push({ tone: "bad", text: `Faltan ${missing} trabajador${missing === 1 ? "" : "es"}` });
  }
  if (assignedCount === 0) briefMessages.push({ tone: "bad", text: "Sin trabajadores asignados" });
  if (noLocation) briefMessages.push({ tone: "warn", text: meetingPoint ? "Falta ubicación del trabajo (hay punto de encuentro)" : "Falta ubicación del trabajo" });
  if (!(shiftMeeting.point ?? meetingPoint)) briefMessages.push({ tone: "warn", text: "Falta punto de encuentro" });
  if (noClient) briefMessages.push({ tone: "warn", text: "Falta cliente" });
  if (draft) briefMessages.push({ tone: "warn", text: "Borrador — los trabajadores aún no lo ven" });
  if (draft && fullyStaffed) briefMessages.push({ tone: "info", text: "Listo para publicar" });
  if (
    dateBucket === "today" &&
    assignedWorkers.length > 0 &&
    Object.keys(clockByEmp).length === 0
  ) {
    briefMessages.push({ tone: "warn", text: "Sin actividad de reloj" });
  }

  // ── Snapshot text
  const snapshot = (() => {
    const when = dateBucket === "today" ? "Today"
      : dateBucket === "tomorrow" ? "Tomorrow"
      : dateBucket === "past" ? `On ${format(parseISO(shift.date), "MMM d", { locale: enUS })}`
      : `On ${format(parseISO(shift.date), "EEE MMM d", { locale: enUS })}`;
    const where = locationName ? ` at ${locationName}` : (clientName && clientName !== "—" ? ` for ${clientName}` : "");
    const cov = slots > 0 ? `Coverage is ${assignedCount}/${slots} workers.` : `${assignedCount} worker${assignedCount === 1 ? "" : "s"} assigned.`;
    const pubText = draft ? "It is still a draft" : published ? "It is published" : "Status pending";
    const tail = published && understaffed
      ? ` and needs ${slots - assignedCount} more worker${slots - assignedCount === 1 ? "" : "s"} before start time.`
      : draft ? " — workers will not see it until published." : ".";
    const meetBit = shiftMeeting.point ? ` Punto de encuentro: ${shiftMeeting.point}${shiftMeeting.time ? ` at ${formatTimeShort(shiftMeeting.time)}` : ""}.` : "";
    return `This shift is scheduled for ${when}, Entrada ${formatTimeShort(shift.start_time)} · Termina aprox. ${formatTimeShort(shift.end_time)}${where}.${meetBit} ${cov} ${pubText}${tail}`;
  })();

  // ── Actions
  const summaryText = (() => {
    const code = shift.shift_code ? `Shift #${formatShiftCode(shift.shift_code)} · ` : "";
    const placeBits = [locationName, clientName && clientName !== "—" ? clientName : null].filter(Boolean).join(" · ");
    const dateBit = (() => {
      try { return format(parseISO(shift.date), "MMM d", { locale: enUS }); } catch { return shift.date; }
    })();
    const cov = slots > 0
      ? `Assigned ${assignedCount}/${slots}${understaffed ? ` · Needs ${slots - assignedCount} worker${slots - assignedCount === 1 ? "" : "s"}` : ""}`
      : `Assigned ${assignedCount}`;
    const meetBit = shiftMeeting.point ? ` · Punto de encuentro: ${shiftMeeting.point}${shiftMeeting.time ? ` ${formatTimeShort(shiftMeeting.time)}` : ""}` : "";
    return `${code}${placeBits || "Shift"} · ${dateBit} · Entrada ${formatTimeShort(shift.start_time)} · Termina aprox. ${formatTimeShort(shift.end_time)}${meetBit} · ${cov}`;
  })();

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      toast.success("Resumen del turno copiado");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: "Shift", text: summaryText });
        return;
      } catch { /* user cancelled or unsupported */ }
    }
    handleCopySummary();
  };

  const handleViewAttendance = () => {
    onOpenChange(false);
    navigate(`/app/attendance?shift=${shift.id}`);
  };

  // Stafly Work Route — meeting point/time effective values.
  const mp = shiftMeeting.point ?? meetingPoint ?? null;
  const mt = shiftMeeting.time ? formatTimeShort(shiftMeeting.time) : null;
  const startShort = formatTimeShort(shift.start_time);
  const endShort = formatTimeShort(shift.end_time);

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="h-[92vh] p-0 rounded-t-3xl flex flex-col overflow-hidden bg-background"
      >
        {/* Sticky Context Header — Phase 1A compact: title + 1 meta line + 1 priority pill. */}
        {(() => {
          // Single priority status pill: Unstaffed > Missing job site > No client > Draft > Published > OK.
          const pill: { label: string; cls: string } | null =
            published && understaffed
              ? { label: "Falta personal", cls: "border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10" }
              : noLocation
                ? { label: meetingPoint ? "Falta ubicación" : "Falta ubicación", cls: "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10" }
                : noClient
                  ? { label: "Falta cliente", cls: "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10" }
                  : draft
                    ? { label: "Borrador", cls: "border-border/60 text-muted-foreground bg-muted/40" }
                    : published && fullyStaffed
                      ? { label: "Personal completo", cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10" }
                      : published
                        ? { label: "Publicado", cls: "border-primary/30 text-primary bg-primary/5" }
                        : null;
          const coverageBit = slots > 0 ? `${assignedCount}/${slots}` : `${assignedCount}`;
          return (
            <div
              className="px-5 pt-3 pb-2.5 border-b border-border/40 bg-background/95 backdrop-blur-sm"
              role="region"
              aria-label={`Shift context for ${clientName && clientName !== "—" ? clientName : (shift.title || "shift")}, ${dateLabel(shift.date)}, entrada ${startShort}, termina aprox. ${endShort}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {shift.shift_code && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold text-muted-foreground/80">
                        <Hash className="h-3 w-3" />
                        {formatShiftCode(shift.shift_code)}
                      </span>
                    )}
                    {weekendLabel && (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        · {weekendLabel}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight leading-tight line-clamp-2">
                    {clientName && clientName !== "—" ? clientName : (shift.title || "Shift")}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {dateLabel(shift.date)} · <span className="font-semibold tabular-nums text-foreground/80">{coverageBit}</span> asignados
                  </p>
                  {/* Stafly Work Route — Entrada protagonista; Termina aprox. secundario. */}
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">Entrada</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-foreground leading-none">{startShort}</span>
                    <span className="text-[11px] text-muted-foreground/80 truncate">· Termina aprox. <span className="font-mono tabular-nums">{endShort}</span></span>
                  </div>
                  {mp ? (
                    <p className="text-[11px] text-muted-foreground mt-1 truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0 opacity-70" />
                      <span className="truncate">
                        Punto de encuentro: <span className="text-foreground/90 font-medium">{mp}</span>
                        {mt && <> · <span className="font-mono tabular-nums">{mt}</span></>}
                      </span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1 truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0 opacity-70" />
                      <span className="truncate">{locationName || "No location"}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 px-2 rounded-full -mt-1 -mr-1 text-xs gap-1"
                    onClick={() => onOpenChange(false)}
                    aria-label="Volver a turnos"
                  >
                    <X className="h-4 w-4" />
                    Volver
                  </Button>
                  {pill && (
                    <Badge
                      variant="outline"
                      className={cn("h-[20px] px-2 text-[10px] font-semibold", pill.cls)}
                    >
                      {pill.label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4 space-y-5">
          {/* 1. Qué necesita atención — solo problemas accionables */}
          {briefMessages.length > 0 && (
            <section>
              <SectionTitle icon={Sparkles}>Qué necesita atención</SectionTitle>
              <div className="space-y-1.5">
                {briefMessages.map((m, i) => (
                  <BriefRow key={i} tone={m.tone} text={m.text} />
                ))}
              </div>
            </section>
          )}

          {/* 2. Acciones rápidas — 2x2 grid */}
          <section>
            <SectionTitle icon={Sparkles}>Acciones rápidas</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {canValidate && (
                <Button
                  className="h-12 rounded-xl justify-start gap-2 text-sm font-semibold"
                  onClick={() => setHubOpen(true)}
                >
                  <Users className="h-4 w-4" />
                  <span>Gestionar equipo</span>
                </Button>
              )}
              <Button
                variant="outline"
                className="h-12 rounded-xl justify-start gap-2 text-sm font-medium"
                onClick={handleViewAttendance}
              >
                <ClipboardList className="h-4 w-4" />
                <span>Asistencia</span>
              </Button>
              {canValidate && (
                <Button
                  variant="outline"
                  className="h-12 rounded-xl justify-start gap-2 text-sm font-medium"
                  onClick={() => setNotifyOpen(true)}
                >
                  <Bell className="h-4 w-4" />
                  <span>Notificar equipo</span>
                </Button>
              )}
              <Button
                variant="outline"
                className="h-12 rounded-xl justify-start gap-2 text-sm font-medium"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
                <span>Compartir turno</span>
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl justify-start gap-2 text-sm font-medium col-span-2"
                onClick={handleCopySummary}
              >
                <Copy className="h-4 w-4" />
                <span>Copiar resumen</span>
              </Button>
            </div>
          </section>

          {/* 3. Equipo asignado */}
          <section>
            <SectionTitle
              icon={Users}
              helper={MOBILE_SHIFT_COPY.assignedWorkersHelper}
              badge={MOBILE_SHIFT_COPY.readOnlyMobile}
            >
              Equipo asignado
              <span className="ml-1.5 text-xs font-normal text-muted-foreground normal-case tracking-normal">
                ({assignedCount}{slots > 0 ? `/${slots}` : ""})
              </span>
            </SectionTitle>

            {/* Coverage chips */}
            {(() => {
              let checkedIn = 0, checkedOut = 0, missing = 0;
              for (const w of assignedWorkers) {
                const c = clockByEmp[w.id];
                if (c?.clock_out) checkedOut++;
                else if (c?.clock_in) checkedIn++;
                else missing++;
              }
              return (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  <CoverChip label="requeridos" value={slots > 0 ? slots : "—"} />
                  <CoverChip label="asignados" value={assignedCount} />
                  <CoverChip label="registrados" value={checkedIn} tone={checkedIn > 0 ? "good" : "muted"} />
                  <CoverChip label="salieron" value={checkedOut} tone="muted" />
                  <CoverChip label="ausentes" value={missing} tone={missing > 0 && dateBucket === "today" ? "bad" : "muted"} />
                </div>
              );
            })()}

            {loadingTeam ? (
              <div className="space-y-1.5">
                {[0, 1].map(i => (
                  <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : teamError ? (
              <ErrorBlock
                title={MOBILE_SHIFT_COPY.teamErrorTitle}
                helper={MOBILE_SHIFT_COPY.teamErrorHelper}
                devHint={teamError}
                retryDisabled={loadingTeam}
                retryLabel={loadingTeam ? "Reintentando..." : "Reintentar"}
                onRetry={() => setReloadKey(k => k + 1)}
                onBack={() => onOpenChange(false)}
              />
            ) : assignedWorkers.length === 0 ? (
              <EmptyBlock
                icon={Users}
                title={MOBILE_SHIFT_COPY.noWorkersTitle}
                helper={MOBILE_SHIFT_COPY.noWorkersHelper}
                badge={MOBILE_SHIFT_COPY.readOnlyMobile}
              />
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground mb-1.5 px-0.5">
                  {MOBILE_SHIFT_COPY.assignedSortedHelper}
                </p>
                <div className="space-y-1.5">
                  {sortedAssignedWorkers.map(w => {
                    const extra = asgnByEmployeeId.get(w.id) ?? null;
                    return (
                      <WorkerRow
                        key={w.id}
                        worker={w}
                        assignmentStatus={extra?.status ?? null}
                        attendanceStatus={extra?.attendance_status ?? null}
                        role={extra?.assignment_role ?? null}
                        clock={clockByEmp[w.id]}
                        isShiftAdmin={shiftAdminId === w.id}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {understaffed && (
              <div className="mt-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Cambios de personal disponibles desde escritorio por ahora.
                </div>
                <div className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1 leading-relaxed">
                  {slots - assignedCount} cupo{slots - assignedCount === 1 ? "" : "s"} abierto{slots - assignedCount === 1 ? "" : "s"}. Puedes revisar la cobertura y contactar al equipo asignado desde el móvil.
                </div>
              </div>
            )}
          </section>

          {/* 4. Asistencia */}
          <section>
            <SectionTitle
              icon={ClipboardList}
              helper={MOBILE_SHIFT_COPY.attendanceSectionHelper}
            >
              Asistencia
            </SectionTitle>
            {assignedWorkers.length === 0 ? (
              <EmptyBlock
                icon={ClipboardList}
                title={MOBILE_SHIFT_COPY.attendanceUnavailableTitle}
                helper={MOBILE_SHIFT_COPY.attendanceUnavailableHelper}
              />
            ) : Object.keys(clockByEmp).length === 0 ? (
              <EmptyBlock
                icon={Clock}
                title={MOBILE_SHIFT_COPY.noClockActivityTitle}
                helper={MOBILE_SHIFT_COPY.noClockActivityHelper}
              />
            ) : shift && selectedCompanyId ? (
              <>
                <ShiftAttendancePanel
                  shiftId={shift.id}
                  companyId={selectedCompanyId}
                  assignments={assignments}
                  employees={employees}
                  canManage={canValidate}
                />
                <p className="mt-2 px-0.5 text-[11px] text-muted-foreground">
                  Datos cargados desde el sistema de asistencia.
                </p>
              </>
            ) : null}
          </section>

          {/* 5. Cierre diario — colapsable */}
          {shift && selectedCompanyId ? (
            <section>
              <button
                type="button"
                onClick={() => setCloseoutOpen(v => !v)}
                className="w-full flex items-center justify-between gap-2 mb-2.5 px-0.5 text-left"
                aria-expanded={closeoutOpen}
              >
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    Cierre diario
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    closeoutOpen && "rotate-180"
                  )}
                />
              </button>
              {closeoutOpen ? (
                <ShiftCloseoutSection
                  shiftId={shift.id}
                  companyId={selectedCompanyId}
                  canSubmit={canValidate || shiftAdminId != null}
                  canReview={canValidate}
                  role={canValidate ? "admin" : "shift_admin"}
                />
              ) : (
                <p className="px-0.5 text-xs text-muted-foreground">
                  Toca para revisar o registrar el cierre operativo del día.
                </p>
              )}
            </section>
          ) : null}

          {/* 6. Más detalles — colapsado por defecto */}
          <section>
            <button
              type="button"
              onClick={() => setMoreOpen(v => !v)}
              className="w-full flex items-center justify-between gap-2 mb-2.5 px-0.5 text-left"
              aria-expanded={moreOpen}
            >
              <div className="flex items-center gap-1.5">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  Más detalles
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  moreOpen && "rotate-180"
                )}
              />
            </button>
            {moreOpen ? (
              <div className="space-y-4">
                {/* Detalles del turno */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
                    Detalles del turno
                  </p>
                  <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40">
                    <DetailRow icon={CalendarDays} label="Fecha" value={(() => {
                      try { return format(parseISO(shift.date), "EEEE, MMMM d, yyyy", { locale: enUS }); } catch { return shift.date; }
                    })()} />
                    <DetailRow icon={Clock} label="Entrada" value={startShort} />
                    <DetailRow icon={Clock} label="Termina aprox." value={endShort} muted />
                    {noClient ? (
                      <div className="px-4 py-3">
                        <EmptyBlock
                          icon={Building2}
                          title={MOBILE_SHIFT_COPY.noClientTitle}
                          helper={MOBILE_SHIFT_COPY.noClientHelper}
                          compact
                        />
                      </div>
                    ) : (
                      <DetailRow icon={Building2} label="Cliente" value={clientName && clientName !== "—" ? clientName : "—"} muted={!clientName || clientName === "—"} />
                    )}
                    {noLocation ? (
                      <div className="px-4 py-3">
                        <EmptyBlock
                          icon={MapPin}
                          title={meetingPoint ? MOBILE_SHIFT_COPY.noLocationTitle : MOBILE_SHIFT_COPY.noLocationOrMeetingTitle}
                          helper={meetingPoint ? MOBILE_SHIFT_COPY.noLocationHelper : MOBILE_SHIFT_COPY.noLocationOrMeetingHelper}
                          compact
                        />
                      </div>
                    ) : (
                      <DetailRow icon={MapPin} label="Ubicación" value={locationName || "—"} muted={!locationName} />
                    )}
                    {mp ? (
                      <DetailRow
                        icon={MapPin}
                        label="Punto de encuentro"
                        value={mt ? `${mp} · ${mt}` : mp}
                      />
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 opacity-60" />
                        <span>{MOBILE_SHIFT_COPY.noMeetingPoint}</span>
                      </div>
                    )}
                    <DetailRow
                      icon={FileEdit}
                      label="Publicación"
                      value={draft ? "Borrador" : published ? "Publicado" : (shift.publication_status ?? "—")}
                    />
                    {shift.claimable && (
                      <DetailRow icon={Sparkles} label="Reclamable" value="Abierto a reclamos del equipo" />
                    )}
                  </div>
                </div>

                {/* Notas */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
                    Notas
                  </p>
                  {shift.notes ? (
                    <div className="rounded-2xl border border-border/50 bg-card px-4 py-3">
                      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {shift.notes}
                      </p>
                    </div>
                  ) : (
                    <EmptyBlock
                      icon={StickyNote}
                      title={MOBILE_SHIFT_COPY.noNotesTitle}
                      helper={MOBILE_SHIFT_COPY.noNotesHelper}
                    />
                  )}
                </div>

                {/* Origen e historial */}
                <div>
                  <button
                    type="button"
                    onClick={() => setTraceOpen(v => !v)}
                    className="w-full flex items-center justify-between gap-2 mb-2 px-0.5 text-left"
                    aria-expanded={traceOpen}
                  >
                    <div className="flex items-center gap-1.5">
                      <Workflow className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Origen e historial
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        traceOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {traceOpen ? (
                    <TraceabilitySnapshot
                      compact
                      source={shiftTraceSource(draft, published)}
                      sourceNote="Turno programado · la nómina solo usa entradas reales de reloj"
                      timeline={buildShiftTimeline(shift)}
                      linked={buildShiftLinked({
                        shift, clientName, locationName, assignedCount, slots,
                      })}
                      risks={buildShiftRisks({
                        draft, published, understaffed, assignedCount,
                        noClient, noLocation, hasShiftCode: !!shift.shift_code,
                        imported: !!shift.import_batch_id,
                      })}
                      audit={buildShiftAudit(shift)}
                    />
                  ) : (
                    <p className="px-0.5 text-xs text-muted-foreground">
                      Toca para ver de dónde viene este turno, cambios recientes y registros vinculados.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="px-0.5 text-xs text-muted-foreground">
                Detalles del turno, notas, publicación y origen.
              </p>
            )}
          </section>
        </div>

        {/* Sticky footer — Phase 1A: primary = Manage team (operational), secondary = Attendance. */}
        <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom,0px),12px)] border-t border-border/40 bg-background/95 backdrop-blur-sm">
          {canValidate ? (
            <div className="flex items-center gap-2">
              <Button
                className="flex-1 h-12 rounded-xl text-sm font-semibold gap-2"
                onClick={() => setHubOpen(true)}
                aria-label="Abrir gestión de equipo de este turno"
              >
                <Users className="h-4 w-4" />
                Gestionar equipo
              </Button>
              <Button
                variant="outline"
                className="h-12 px-4 rounded-xl text-sm font-semibold gap-2"
                onClick={handleViewAttendance}
                aria-label="Ver asistencia"
              >
                <ClipboardList className="h-4 w-4" />
                Asistencia
              </Button>
            </div>
          ) : (
            <Button
              className="w-full h-12 rounded-xl text-sm font-semibold gap-2"
              onClick={handleViewAttendance}
            >
              <ClipboardList className="h-4 w-4" />
              Ver asistencia
            </Button>
          )}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            La edición del turno está disponible desde escritorio por ahora.
          </p>
        </div>
      </SheetContent>
    </Sheet>
    <MobileShiftTeamHub
      open={hubOpen}
      onOpenChange={setHubOpen}
      shift={shift}
      assignments={asgnExtras.map(a => ({
        id: a.id,
        employee_id: a.employee_id,
        status: a.status,
        response_status: a.response_status,
        attendance_status: a.attendance_status,
        assignment_role: a.assignment_role,
        accepted_at: a.accepted_at,
        rejected_at: a.rejected_at,
        responded_at: a.responded_at,
      }))}
      employees={employees}
      canManage={canValidate}
      clientName={clientName}
      locationName={locationName}
      meetingPoint={shiftMeeting.point ?? meetingPoint ?? null}
      meetingTime={shiftMeeting.time ?? null}
      hasMeetingPointLocation={!!(shift as unknown as { meeting_point_location_id?: string | null })?.meeting_point_location_id}
      shiftAdminId={shiftAdminId}
      companyId={selectedCompanyId}
      onMutated={() => setReloadKey(k => k + 1)}
    />
    <SendNotificationDialog
      open={notifyOpen}
      onOpenChange={setNotifyOpen}
      shift={shift}
      assignments={assignments}
      employees={employees}
      meetingPoint={shiftMeeting.point ?? meetingPoint ?? null}
      meetingTime={shiftMeeting.time ?? null}
      clientName={clientName}
      jobSiteName={locationName}
      specialInstructions={shift.notes ?? null}
      friendlyDate={dateLabel(shift.date)}
    />
    </>
  );
}

/* ───── Subcomponents ───── */

function SectionTitle({
  icon: Icon, children, helper, badge,
}: {
  icon: any;
  children: React.ReactNode;
  helper?: string;
  badge?: string;
}) {
  return (
    <div className="mb-2.5 px-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          {children}
        </span>
        {badge && (
          <span className="ml-auto inline-flex items-center h-[18px] px-1.5 rounded-full bg-muted text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      {helper && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
          {helper}
        </p>
      )}
    </div>
  );
}

function ErrorBlock({
  title, helper, onRetry, onBack, devHint, retryDisabled, retryLabel,
}: {
  title: string;
  helper?: string;
  onRetry?: () => void;
  onBack?: () => void;
  devHint?: string | null;
  retryDisabled?: boolean;
  retryLabel?: string;
}) {
  const isDev = typeof import.meta !== "undefined" && (import.meta as any)?.env?.DEV;
  const label = retryLabel ?? "Retry";
  const isRetrying = !!retryDisabled && label !== "Retry";
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-2xl border border-dashed border-rose-500/40 bg-muted/20 px-4 py-4"
    >
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
          {helper && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{helper}</p>
          )}
          {isDev && devHint && (
            <p className="mt-1.5 text-[10px] font-mono text-rose-700/70 dark:text-rose-300/70 leading-snug break-words">
              {devHint}
            </p>
          )}
          {(onRetry || onBack) && (
            <div className="mt-2.5 flex items-center gap-2">
              {onRetry && (
                <Button
                  size="sm"
                  className="h-8 rounded-lg gap-1.5"
                  onClick={onRetry}
                  disabled={retryDisabled}
                  aria-label={label}
                  aria-busy={isRetrying || undefined}
                >
                  {isRetrying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {label}
                </Button>
              )}
              {onBack && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-lg"
                  onClick={onBack}
                  aria-label="Back to shifts"
                >
                  Back
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyBlock({
  icon: Icon, title, helper, badge, compact,
}: {
  icon?: any;
  title: string;
  helper?: string;
  badge?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border/60 bg-muted/20",
        compact ? "px-3 py-2.5" : "px-4 py-4",
      )}
    >
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground leading-tight">{title}</span>
            {badge && (
              <span className="inline-flex items-center h-[18px] px-1.5 rounded-full bg-muted text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {badge}
              </span>
            )}
          </div>
          {helper && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{helper}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: "good" | "warn" | "bad" }) {
  const cls =
    accent === "good" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "warn" ? "text-amber-600 dark:text-amber-400" :
    accent === "bad"  ? "text-rose-600 dark:text-rose-400" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-border/50 bg-card px-3.5 py-3.5 shadow-sm">
      <div className={cn("text-2xl font-semibold tabular-nums leading-none", cls)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-2 font-medium">{label}</div>
    </div>
  );
}

function BriefRow({ tone, text }: { tone: "good" | "warn" | "bad" | "info"; text: string }) {
  const map = {
    good: { cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 },
    warn: { cls: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400", Icon: AlertTriangle },
    bad:  { cls: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400", Icon: AlertTriangle },
    info: { cls: "border-border bg-muted/30 text-foreground/80", Icon: Sparkles },
  } as const;
  const { cls, Icon } = map[tone];
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5", cls)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium leading-snug">{text}</span>
    </div>
  );
}

function CoverChip({
  label, value, tone = "default",
}: { label: string; value: number | string; tone?: "default" | "good" | "warn" | "bad" | "muted" }) {
  const cls =
    tone === "good" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" :
    tone === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" :
    tone === "bad"  ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30" :
    tone === "muted" ? "bg-muted/50 text-muted-foreground border-border/50" :
    "bg-card text-foreground border-border/60";
  return (
    <div className={cn("inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-[11px] font-medium", cls)}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-80">{label}</span>
    </div>
  );
}

function attendanceBadgeFor(
  attendanceStatus: string | null,
  clock: { clock_in: string | null; clock_out: string | null } | undefined,
): { label: string; cls: string } {
  if (clock?.clock_out) return { label: "Clocked out", cls: "bg-muted text-muted-foreground" };
  if (clock?.clock_in) return { label: "Clocked in", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
  switch ((attendanceStatus ?? "").toLowerCase()) {
    case "present": return { label: "Present", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
    case "late":    return { label: "Late", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
    case "absent":  return { label: "Absent", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" };
    case "excused": return { label: "Excused", cls: "bg-muted text-muted-foreground" };
    case "needs_review": return { label: "Needs review", cls: "bg-primary/15 text-primary" };
    default: return { label: "Not started", cls: "bg-muted text-muted-foreground" };
  }
}

function roleBadgeFor(role: string | null, isShiftAdmin: boolean): { label: string; cls: string } | null {
  if (isShiftAdmin) return { label: "Shift admin", cls: "bg-primary/15 text-primary border-primary/30" };
  if (!role) return null;
  const r = role.toLowerCase();
  if (r === "captain") return { label: "Captain", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" };
  if (r === "lead" || r === "admin") return { label: "Lead", cls: "bg-primary/15 text-primary border-primary/30" };
  if (r === "staff" || r === "worker") return null;
  return { label: role, cls: "bg-muted text-muted-foreground border-border" };
}

function areWorkerRowPropsEqual(
  prev: {
    worker: Employee;
    assignmentStatus: string | null;
    attendanceStatus: string | null;
    role: string | null;
    clock: { clock_in: string | null; clock_out: string | null } | undefined;
    isShiftAdmin: boolean;
  },
  next: {
    worker: Employee;
    assignmentStatus: string | null;
    attendanceStatus: string | null;
    role: string | null;
    clock: { clock_in: string | null; clock_out: string | null } | undefined;
    isShiftAdmin: boolean;
  },
): boolean {
  if (prev.worker.id !== next.worker.id) return false;
  if (prev.worker.first_name !== next.worker.first_name) return false;
  if (prev.worker.last_name !== next.worker.last_name) return false;
  if (prev.worker.phone_number !== next.worker.phone_number) return false;
  if (prev.worker.avatar_url !== next.worker.avatar_url) return false;
  if (prev.assignmentStatus !== next.assignmentStatus) return false;
  if (prev.attendanceStatus !== next.attendanceStatus) return false;
  if (prev.role !== next.role) return false;
  if (prev.isShiftAdmin !== next.isShiftAdmin) return false;
  if (prev.clock?.clock_in !== next.clock?.clock_in) return false;
  if (prev.clock?.clock_out !== next.clock?.clock_out) return false;
  return true;
}

const WorkerRow = memo(function WorkerRow({
  worker, assignmentStatus, attendanceStatus, role, clock, isShiftAdmin,
}: {
  worker: Employee;
  assignmentStatus: string | null;
  attendanceStatus: string | null;
  role: string | null;
  clock: { clock_in: string | null; clock_out: string | null } | undefined;
  isShiftAdmin: boolean;
}) {
  const phone = worker.phone_number?.trim();
  const normalized = normalizePhone(phone);
  const wa = phone ? buildWhatsAppTargets(phone, "") : null;
  const workerName = `${worker.first_name ?? ""} ${worker.last_name ?? ""}`.trim() || "worker";
  const initialsStr = (worker.first_name?.[0] ?? "").toUpperCase() + (worker.last_name?.[0] ?? "").toUpperCase();
  const att = attendanceBadgeFor(attendanceStatus, clock);
  const roleBadge = roleBadgeFor(role, isShiftAdmin);
  const statusLow = (assignmentStatus ?? "").toLowerCase();
  const showAssignStatus = statusLow && !["accepted", "confirmed", "assigned"].includes(statusLow);

  const handleCopy = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Phone copied");
    } catch {
      toast.error("Couldn't copy phone");
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {worker.avatar_url ? <AvatarImage src={worker.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-xs font-semibold bg-muted">
            {initialsStr || "·"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium leading-snug truncate">
              {worker.first_name} {worker.last_name}
            </span>
            {isShiftAdmin && <Crown className="h-3.5 w-3.5 text-primary shrink-0" />}
          </div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {phone ? phone : MOBILE_SHIFT_COPY.noPhoneTitle}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <span className={cn("inline-flex items-center h-5 px-1.5 rounded-full text-[10px] font-semibold", att.cls)}>
          {att.label}
        </span>
        {roleBadge && (
          <span className={cn("inline-flex items-center h-5 px-1.5 rounded-full border text-[10px] font-semibold", roleBadge.cls)}>
            {roleBadge.label}
          </span>
        )}
        {showAssignStatus && (
          <span className="inline-flex items-center h-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold capitalize">
            {statusLow.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {phone ? (
        <div className="flex items-center gap-1.5 mt-2.5">
          <a
            href={`tel:${phone}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/15 active:scale-[0.98] transition text-xs font-semibold"
            aria-label={`Call ${workerName}`}
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            Call
          </a>
          <a
            href={`sms:${normalized || phone}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-muted text-foreground hover:bg-muted/80 active:scale-[0.98] transition text-xs font-semibold"
            aria-label={`Send SMS to ${workerName}`}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            SMS
          </a>
          {wa?.waMeUrl && (
            <a
              href={wa.waMeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[#25D366]/10 text-[#128C4F] dark:text-[#25D366] hover:bg-[#25D366]/15 active:scale-[0.98] transition text-xs font-semibold"
              aria-label={`Open WhatsApp for ${workerName}`}
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 active:scale-[0.98] transition"
            aria-label={`Copy phone number for ${workerName}`}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          className="mt-2.5 rounded-xl border border-dashed border-border/60 bg-muted/30 px-3 py-2"
          aria-label={`No phone on file for ${workerName}. Add a phone number from the worker profile to enable contact actions.`}
        >
          <div className="flex items-start gap-2">
            <Phone className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-foreground/80 leading-tight">
                {MOBILE_SHIFT_COPY.noPhoneTitle}
              </div>
              <div className="text-[10.5px] text-muted-foreground leading-snug mt-0.5">
                {MOBILE_SHIFT_COPY.noPhoneHelper}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}, areWorkerRowPropsEqual);

function DetailRow({ icon: Icon, label, value, muted }: { icon: any; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="text-xs font-medium text-muted-foreground w-24 shrink-0">
        {label}
      </div>
      <div className={cn("text-sm font-medium truncate text-right flex-1", muted && "text-muted-foreground")}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ draft, published, understaffed }: { draft: boolean; published: boolean; understaffed: boolean }) {
  const base = "text-[11px] font-medium h-[22px] px-2 leading-none";
  if (draft) {
    return <Badge variant="outline" className={cn(base, "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10")}>Draft</Badge>;
  }
  if (published && understaffed) {
    return <Badge variant="outline" className={cn(base, "border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10")}>Unstaffed</Badge>;
  }
  if (published) {
    return <Badge variant="outline" className={cn(base, "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10")}>Published</Badge>;
  }
  return <Badge variant="outline" className={cn(base)}>Shift</Badge>;
}

function PublicationBadge({
  status, draft, published,
}: { status?: string | null; draft: boolean; published: boolean }) {
  const base = "h-[22px] px-2 text-[11px] font-semibold leading-none";
  const s = (status ?? "").toLowerCase();
  if (s === "cancelled" || s === "canceled") {
    return <Badge variant="outline" aria-label="Publication status: cancelled" className={cn(base, "border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10")}>Cancelled</Badge>;
  }
  if (s === "archived") {
    return <Badge variant="outline" aria-label="Publication status: archived" className={cn(base, "border-border/60 text-muted-foreground bg-muted/40")}>Archived</Badge>;
  }
  if (draft) {
    return <Badge variant="outline" aria-label="Publication status: draft — workers cannot see this shift yet" className={cn(base, "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10")}>Draft</Badge>;
  }
  if (published) {
    return <Badge variant="outline" aria-label="Publication status: published" className={cn(base, "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10")}>Published</Badge>;
  }
  return <Badge variant="outline" aria-label="Publication status: shift" className={cn(base)}>Shift</Badge>;
}

/* ───── Traceability builders (pure, read-only) ───── */

function shiftTraceSource(draft: boolean, _published: boolean): TraceSourceKind {
  // Scheduled shifts are NOT a paid source — surface as "scheduled_only".
  // Drafts get the same kind (the warning tone is reinforced via risks).
  return "scheduled_only";
}

function buildShiftTimeline(shift: Shift): TraceTimelineEvent[] {
  // Synthesize start/end from date + time so the timeline is meaningful even
  // if no created_at/published_at is present in the row.
  const startISO = shift.date && shift.start_time
    ? `${shift.date}T${shift.start_time}`
    : null;
  const endISO = shift.date && shift.end_time
    ? `${shift.date}T${shift.end_time}`
    : null;

  const events: TraceTimelineEvent[] = [];
  if (shift.created_at) events.push({ label: "Created", at: shift.created_at });
  if (shift.published_at) events.push({ label: "Published", at: shift.published_at });
  if (shift.updated_at) events.push({ label: "Last updated", at: shift.updated_at });
  events.push({ label: "Scheduled start", at: startISO });
  events.push({ label: "Scheduled end", at: endISO });
  return events;
}

function buildShiftLinked(args: {
  shift: Shift;
  clientName: string;
  locationName: string;
  assignedCount: number;
  slots: number;
}): TraceLinkedRecord[] {
  const { shift, clientName, locationName, assignedCount, slots } = args;
  const open = slots > 0 ? Math.max(0, slots - assignedCount) : 0;
  return [
    { label: "Shift ID", value: shift.id.slice(0, 8) + "…", hint: shift.id },
    { label: "Shift code", value: shift.shift_code ? formatShiftCode(shift.shift_code) : null },
    { label: "Client", value: clientName && clientName !== "—" ? clientName : null },
    { label: "Job site", value: locationName || null },
    { label: "Assignments", value: String(assignedCount) },
    { label: "Open slots", value: slots > 0 ? String(open) : "—" },
    {
      label: "Publication",
      value: shift.publication_status ?? (shift.status || null),
    },
  ];
}

function buildShiftRisks(args: {
  draft: boolean;
  published: boolean;
  understaffed: boolean;
  assignedCount: number;
  noClient: boolean;
  noLocation: boolean;
  hasShiftCode: boolean;
  imported: boolean;
}): TraceRisk[] {
  const risks: TraceRisk[] = [];
  // Always-on payroll guardrail
  risks.push({
    label: "Scheduled hours are not used for pay — payroll uses real clock entries only",
    tone: "info",
  });
  if (args.draft) risks.push({ label: "Draft shift — workers won't see it yet", tone: "warn" });
  if (args.published && args.understaffed) risks.push({ label: "Needs more staff", tone: "warn" });
  if (args.assignedCount === 0) risks.push({ label: "No workers assigned", tone: "bad" });
  if (args.noClient) risks.push({ label: "No client linked", tone: "warn" });
  if (args.noLocation) risks.push({ label: "No job site linked", tone: "warn" });
  if (!args.hasShiftCode) risks.push({ label: "No shift code", tone: "warn" });
  if (args.imported) risks.push({ label: "Imported from a batch", tone: "info" });
  return risks;
}

function buildShiftAudit(shift: Shift): TraceLinkedRecord[] {
  const fmtTs = (ts: string | null | undefined) => {
    if (!ts) return null;
    try { return format(parseISO(ts), "MMM d, yyyy · HH:mm", { locale: enUS }); }
    catch { return ts; }
  };
  return [
    { label: "Created at", value: fmtTs(shift.created_at), hint: shift.created_at ?? undefined },
    { label: "Created by", value: shift.created_by ? shift.created_by.slice(0, 8) + "…" : null, hint: shift.created_by ?? undefined },
    { label: "Published by", value: shift.published_by ? shift.published_by.slice(0, 8) + "…" : null, hint: shift.published_by ?? undefined },
    { label: "Updated at", value: fmtTs(shift.updated_at), hint: shift.updated_at ?? undefined },
    { label: "Import batch", value: shift.import_batch_id ? shift.import_batch_id.slice(0, 8) + "…" : null, hint: shift.import_batch_id ?? undefined },
    { label: "Reconciliation hash", value: shift.reconciliation_hash ? shift.reconciliation_hash.slice(0, 10) + "…" : null, hint: shift.reconciliation_hash ?? undefined },
  ];
}

/* ───── Worker sort (mobile shift Assigned section) ─────
 * Lower score = appears first.
 *   0  Shift admin
 *  10  Captain / lead / admin role
 *  20  Currently clocked in (clock_in && !clock_out) or marked present
 *  30  Needs review / late / absent — only when shift is today/past
 *  40  Not started / pending / missing clock-in
 *  60  Clocked out (already left)
 *  80  Excused
 * +5 when worker has no phone (contactable workers first within group).
 */
function getWorkerSortScore(
  worker: Employee,
  extra: { status: string; attendance_status: string | null; assignment_role: string | null } | null,
  clock: { clock_in: string | null; clock_out: string | null } | undefined,
  shiftAdminId: string | null,
  dateBucket: "today" | "tomorrow" | "past" | "future",
): number {
  let score = 40;
  const role = (extra?.assignment_role ?? "").toLowerCase();
  const att = (extra?.attendance_status ?? "").toLowerCase();
  const isUrgentDay = dateBucket === "today" || dateBucket === "past";

  if (shiftAdminId && worker.id === shiftAdminId) {
    score = 0;
  } else if (role === "captain" || role === "lead" || role === "admin") {
    score = 10;
  } else if (clock?.clock_in && !clock?.clock_out) {
    score = 20;
  } else if (clock?.clock_out) {
    score = 60;
  } else if (att === "needs_review" || att === "late" || att === "absent") {
    score = isUrgentDay ? 30 : 50;
  } else if (att === "excused") {
    score = 80;
  } else if (att === "present") {
    score = 20;
  } else {
    score = 40;
  }

  const phone = (worker.phone_number ?? "").trim();
  if (!phone) score += 5;

  return score;
}

