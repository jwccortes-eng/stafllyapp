import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import { useEffect, useMemo, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Clock, MapPin, Building2, Users, Phone, FileEdit, AlertTriangle,
  CheckCircle2, CalendarDays, Sparkles, UserPlus, Share2, ClipboardList,
  ExternalLink, Copy, StickyNote, Hash, Tag, Workflow, ChevronDown,
  ShieldCheck, MessageCircle, MessageSquare, Crown, Loader2, Bell, Download,
  MoreHorizontal, UserCog,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { SendNotificationDialog } from "@/components/shifts/SendNotificationDialog";
import { ExportConnecteamPreviewDialog } from "@/components/shifts/integrations/ExportConnecteamPreviewDialog";
import { buildWhatsAppTargets, normalizePhone } from "@/lib/phone";
import { format, parseISO, isToday, isTomorrow, isPast, isThisWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { isDraftShift, isPublishedShift } from "@/lib/shifts/shift-guards";
import { resolveShiftLocationTruth } from "@/lib/shifts/service-location";
import { formatShiftCode, type Shift, type Assignment, type Employee } from "@/components/shifts/types";
import { FAMILY_CLASSES } from "@/lib/status/status-registry";
import { MT } from "@/lib/mobile/mobile-scale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useServiceState } from "@/hooks/useServiceState";
import { staffedAssignments } from "@/lib/shifts/assignment-coverage";
import { CalendarX2 } from "lucide-react";
import { CancelShiftDialog } from "@/components/shifts/CancelShiftDialog";
import { canManageShifts, TIME_DOMAIN_WRITE_PERMISSIONS } from "@/lib/shifts/shift-permissions";
import { usePermissions } from "@/hooks/usePermissions";
import { ShiftAttendancePanel } from "@/components/shifts/ShiftAttendancePanel";
import { MobileShiftTeamHub } from "@/components/shifts/mobile/MobileShiftTeamHub";
import { ShiftShareMenu } from "@/components/shifts/ShiftShareMenu";
import { ShiftCloseoutSection } from "@/components/shifts/closeout/ShiftCloseoutSection";
import { ShiftLifecycleTimeline } from "@/components/shifts/ShiftLifecycleTimeline";
import { CaptainNextActionCard } from "@/components/shifts/CaptainNextActionCard";
import { LiveShiftBoard } from "@/components/shifts/LiveShiftBoard";
import { AttendanceEvidenceCard } from "@/components/shifts/ops/AttendanceEvidenceCard";

import {
  TraceabilitySnapshot,
  type TraceRisk,
  type TraceTimelineEvent,
  type TraceLinkedRecord,
  type TraceSourceKind,
} from "@/components/traceability/TraceabilitySnapshot";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

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
  readOnlyMobile: "Operación móvil",
  mobileSafeActions: "Acciones seguras disponibles en móvil.",

  // Coverage section
  coverageHelper: "Cupos requeridos, trabajadores asignados y estado actual de personal.",

  // Assigned workers section
  assignedWorkersHelper: "Revisa estado, contacto y alertas del equipo.",
  assignedSortedHelper: "Lista rápida del equipo y estado operativo.",
  noWorkersTitle: "Aún no hay trabajadores asignados",
  noWorkersHelper: "Asigna trabajadores desde Gestionar equipo o usa las herramientas avanzadas en escritorio.",

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
  noLocationHelper: "El punto de encuentro es distinto — es donde se reúnen los trabajadores, no el lugar real. Puedes reportar la ubicación correcta desde móvil; los cambios avanzados siguen en escritorio.",
  noLocationOrMeetingTitle: "Falta ubicación y punto de encuentro",
  noLocationOrMeetingHelper: "Los trabajadores no sabrán a dónde ir. Reporta la ubicación correcta desde móvil o edítala en escritorio.",
  noMeetingPoint: "Sin punto de encuentro.",

  // Notes section
  notesSectionHelper: "Notas internas de este turno.",
  noNotesTitle: "Sin notas",
  noNotesHelper: "Las notas internas se pueden agregar desde escritorio.",

  // Worker row — no phone state
  noPhoneTitle: "Sin teléfono registrado",
  noPhoneHelper: "Agrega el número desde móvil para habilitar llamada, SMS y WhatsApp.",

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
  /** Optional — when provided (and the user can manage shifts), shows the
   *  "Editar turno" action. The parent owns the edit surface. */
  onEdit?: (shift: Shift) => void;
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
    if (isToday(d)) return "Hoy";
    if (isTomorrow(d)) return "Mañana";
    return format(d, "EEEE, d 'de' MMMM", { locale: es });
  } catch { return dateStr; }
}

function initials(e: Employee): string {
  const a = e.first_name?.[0] ?? "";
  const b = e.last_name?.[0] ?? "";
  return (a + b).toUpperCase() || "·";
}

export function MobileShiftOperationsSheet({
  shift: shiftProp, open, onOpenChange, assignments, employees,
  clientName, locationName, meetingPoint, initialOpenTeamHub, onEdit,
}: Props) {
  const navigate = useNavigate();
  const [traceOpen, setTraceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [connecteamExportOpen, setConnecteamExportOpen] = useState(false);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [locationReportOpen, setLocationReportOpen] = useState(false);

  // Auto-open Manage Team hub when requested by deep-link intent.
  useEffect(() => {
    if (open && initialOpenTeamHub && shiftProp) {
      setHubOpen(true);
    }
  }, [open, initialOpenTeamHub, shiftProp?.id]);
  const { allRoles, canAccessAdminForCompany, user } = useAuth();
  const { selectedCompanyId } = useCompany();

  // P0 SINGLE SERVICE STATE — la hoja no renderiza el snapshot de la lista:
  // lee la versión canónica (fila completa, scoped al tenant) y solo usa la
  // prop como semilla visual para no romper la continuidad al abrir.
  const { service: canonicalShift } = useServiceState<Shift>({
    companyId: selectedCompanyId,
    shiftId: shiftProp?.id ?? null,
    placeholder: shiftProp,
    enabled: open,
  });
  const shift = (canonicalShift ?? shiftProp) as Shift | null;

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
    import_batch_id: string | null;
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
          .select("id, employee_id, status, response_status, attendance_status, assignment_role, accepted_at, rejected_at, responded_at, import_batch_id")
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

  // P0 Domain boundary — validar horas exige permisos del dominio de horas.
  const canValidate =
    canManageShifts({ allRoles, canAccessAdminForCompany, companyId: selectedCompanyId }) &&
    canAnyPermission([...TIME_DOMAIN_WRITE_PERMISSIONS], selectedCompanyId);
  const editLocked = ["locked", "archived", "cancelled"].includes(shift?.status ?? "");
  // P0 — Cancelación segura del turno (misma operación canónica que desktop).
  const [cancelOpen, setCancelOpen] = useState(false);


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
    const s = shift as Shift & {
      job_site_location_id?: string | null;
      job_site_address?: string | null;
      meeting_point?: string | null;
      meeting_point_location_id?: string | null;
    };
    // Resolver canónico único (P0 Service Location SSOT).
    const noLocation =
      resolveShiftLocationTruth({
        location_id: s.location_id,
        job_site_location_id: s.job_site_location_id,
        job_site_address: s.job_site_address,
        meeting_point: s.meeting_point,
        meeting_point_location_id: s.meeting_point_location_id,
      }).destinationStatus === "MISSING_DESTINATION";
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
  // OX-9.2: la cobertura NO se repite aquí. Vive en un solo bloque de equipo.
  const briefMessages: { tone: "good" | "warn" | "bad" | "info"; text: string }[] = [];
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
      : dateBucket === "past" ? `On ${format(parseISO(shift.date), "MMM d", { locale: es })}`
      : `On ${format(parseISO(shift.date), "EEE MMM d", { locale: es })}`;
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
    const identity = getShiftDisplayIdentity(shift);
    const code = identity.primaryRefKind !== "none" ? `Turno ${identity.primaryRef} · ` : "";
    const placeBits = [locationName, clientName && clientName !== "—" ? clientName : null].filter(Boolean).join(" · ");
    const dateBit = (() => {
      try { return format(parseISO(shift.date), "MMM d", { locale: es }); } catch { return shift.date; }
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
      toast.error("No se pudo copiar al portapapeles");
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

  /**
   * OX-9.2 — una sola acción principal por pantalla.
   * Cobertura pendiente → Completar equipo.
   * Incidencias abiertas → Resolver atención.
   * Todo en orden → Operar turno.
   */
  const primaryAction: { key: "team" | "attention" | "operate"; label: string; icon: any; onClick: () => void } =
    canValidate && understaffed
      ? { key: "team", label: "Completar equipo", icon: UserPlus, onClick: () => setHubOpen(true) }
      : briefMessages.length > 0
        ? {
            key: "attention",
            label: "Resolver atención",
            icon: AlertTriangle,
            onClick: () => {
              if (noLocation) setLocationReportOpen(true);
              else if (canValidate) setHubOpen(true);
              else handleViewAttendance();
            },
          }
        : { key: "operate", label: "Operar turno", icon: ClipboardList, onClick: handleViewAttendance };


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
        {/* Sticky Context Header — OX-9.2: identidad y horario. La cobertura NO vive aquí. */}
        {(() => {
          // Single priority status pill. La cobertura se declara una sola vez,
          // en el bloque de equipo — el header nunca la repite.
          const pill: { label: string; cls: string } | null =
            noLocation
              ? { label: "Falta ubicación", cls: FAMILY_CLASSES.warning }
              : noClient
                ? { label: "Falta cliente", cls: FAMILY_CLASSES.warning }
                : draft
                  ? { label: "Borrador", cls: FAMILY_CLASSES.neutral }
                  : published && fullyStaffed
                    ? { label: "Completo", cls: FAMILY_CLASSES.positive }
                    : published
                      ? { label: "Publicado", cls: "border-primary/30 text-primary bg-primary/5" }
                      : null;

          // Status text line (under title) — sin contadores de cobertura.
          const statusText: string | null = draft
            ? "No visible para trabajadores"
            : null;



          // Header title + subtitle
          const headerTitle = (clientName && clientName !== "—") ? clientName : (shift.title || "Turno");
          const subtitle = (clientName && clientName !== "—" && shift.title && shift.title.trim() && shift.title !== clientName)
            ? shift.title
            : null;

          return (
            <div
              className="px-5 pt-3 pb-3 border-b border-border/40 bg-background/95 backdrop-blur-sm"
              role="region"
              aria-label={`Contexto del turno para ${headerTitle}, ${dateLabel(shift.date)}, entrada ${startShort}, termina aprox. ${endShort}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {/* P0 · una sola referencia visible por turno. */}
                    {getShiftDisplayIdentity(shift).primaryRefKind !== "none" && (
                      <span className="inline-flex items-center gap-0.5 text-[12px] font-mono font-semibold text-muted-foreground/80">
                        <Hash className="h-3 w-3" />
                        {getShiftDisplayIdentity(shift).primaryRef}
                      </span>
                    )}
                    <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                      {dateLabel(shift.date)}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight leading-tight line-clamp-2">
                    {headerTitle}
                  </h2>
                  {subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {subtitle}
                    </p>
                  )}
                  {/* Status line */}
                  {statusText && (
                    <p className="text-xs mt-1.5 font-semibold text-muted-foreground">
                      {statusText}
                    </p>
                  )}

                  {/* Schedule line */}
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">Entrada</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-foreground leading-none">{startShort}</span>
                    <span className="text-[12px] text-muted-foreground/80 truncate">· Termina aprox. <span className="font-mono tabular-nums">{endShort}</span></span>
                  </div>
                  {/* Trabajo + Encuentro */}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-start gap-1.5 text-[12px]">
                      <Building2 className="h-3 w-3 shrink-0 mt-0.5 opacity-70 text-muted-foreground" />
                      <span className="text-muted-foreground shrink-0">Trabajo:</span>
                      {locationName ? (
                        <span className="text-foreground/90 font-medium line-clamp-2">{locationName}</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">Falta ubicación</span>
                      )}
                    </div>
                    <div className="flex items-start gap-1.5 text-[12px]">
                      <MapPin className="h-3 w-3 shrink-0 mt-0.5 opacity-70 text-muted-foreground" />
                      <span className="text-muted-foreground shrink-0">Encuentro:</span>
                      {mp ? (
                        <span className="text-foreground/90 font-medium line-clamp-2">
                          {mp}{mt && <> · <span className="font-mono tabular-nums">{mt}</span></>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/80">Sin punto de encuentro</span>
                      )}
                    </div>
                  </div>
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
                      className={cn("h-[22px] px-2.5 text-[12px] font-bold tabular-nums", pill.cls)}
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

          {/* 2. Equipo — única declaración de cobertura de la pantalla. Sin barra, sin CTA duplicada. */}
          <section>
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">Equipo</span>
              </div>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-foreground">
                {slots > 0
                  ? `${assignedCount} de ${slots} cubiertos`
                  : `${assignedCount} ${assignedCount === 1 ? "persona asignada" : "personas asignadas"}`}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[13px] leading-snug",
                  understaffed ? "text-critical font-semibold" : "text-muted-foreground",
                )}
              >
                {understaffed
                  ? `Falta ${slots - assignedCount} ${slots - assignedCount === 1 ? "persona" : "personas"}`
                  : slots > 0
                    ? "Equipo completo"
                    : "Este turno no define cupos"}
              </p>
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

            {/* Coverage chips + operational counts */}
            {(() => {
              let checkedIn = 0, checkedOut = 0, missing = 0, imported = 0, noPhone = 0, rejected = 0, pending = 0;
              for (const w of assignedWorkers) {
                const c = clockByEmp[w.id];
                if (c?.clock_out) checkedOut++;
                else if (c?.clock_in) checkedIn++;
                else missing++;
                const extra = asgnByEmployeeId.get(w.id) ?? null;
                const sLow = (extra?.status ?? "").toLowerCase();
                if (extra?.import_batch_id && !extra?.accepted_at && !extra?.responded_at &&
                    (sLow === "accepted" || sLow === "assigned" || sLow === "confirmed")) imported++;
                if (sLow === "rejected") rejected++;
                if (sLow === "pending") pending++;
                if (!w.phone_number) noPhone++;
              }
              const missingSlots = slots > 0 ? Math.max(0, slots - assignedCount) : 0;
              return (
                <div className="flex flex-wrap gap-1 mb-2.5">
                  <CoverChip label="req." value={slots > 0 ? slots : "—"} />
                  <CoverChip label="asign." value={assignedCount} />
                  {missingSlots > 0 && <CoverChip label="falta" value={missingSlots} tone="warn" />}
                  {checkedIn > 0 && <CoverChip label="en sitio" value={checkedIn} tone="good" />}
                  {checkedOut > 0 && <CoverChip label="salieron" value={checkedOut} tone="muted" />}
                  {imported > 0 && <CoverChip label="import." value={imported} tone="info" />}
                  {pending > 0 && <CoverChip label="pend." value={pending} tone="warn" />}
                  {rejected > 0 && <CoverChip label="rech." value={rejected} tone="bad" />}
                  {noPhone > 0 && <CoverChip label="sin tel." value={noPhone} tone="warn" />}
                </div>
              );
            })()}

            {loadingTeam ? (
              <div className="space-y-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />
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
                <p className="text-[12px] text-muted-foreground mb-1.5 px-0.5">
                  {MOBILE_SHIFT_COPY.assignedSortedHelper}
                </p>
                <div className="space-y-1">
                  {sortedAssignedWorkers.slice(0, 6).map(w => {
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
                        acceptedAt={extra?.accepted_at ?? null}
                        respondedAt={extra?.responded_at ?? null}
                        importBatchId={extra?.import_batch_id ?? null}
                        canManagePhone={canValidate}
                        onPhoneSaved={() => setReloadKey(k => k + 1)}
                      />
                    );
                  })}
                </div>
                {sortedAssignedWorkers.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setHubOpen(true)}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border/60 bg-card text-xs font-semibold text-foreground hover:bg-muted/40 transition"
                  >
                    Ver equipo completo ({sortedAssignedWorkers.length})
                    <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                )}
              </>
            )}

            {/* OX-9.2: la carencia de cobertura ya se declara una sola vez arriba. */}

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
                <p className="mt-2 px-0.5 text-[12px] text-muted-foreground">
                  Datos cargados desde el sistema de asistencia.
                </p>
              </>
            ) : null}
          </section>

          {/* 4b. Asistencia & evidencia — paridad con desktop (helpers puros,
              cero writes a time_entries / payroll). Sólo visible cuando hay
              tenant + asignaciones; las validaciones admin se guardan en
              shift_notes.attendance_validation, igual que en escritorio. */}
          {shift && selectedCompanyId && assignedWorkers.length > 0 ? (
            <section>
              <AttendanceEvidenceCard
                shift={shift as any}
                /* ROOT CAUSE FIX (P1): `assignments` is the company-wide list
                   for the whole calendar. Passing it unscoped made attendance
                   and evidence show workers from OTHER shifts. Always scope
                   by shift_id here. */
                assignments={staffedAssignments(assignments, shift.id).map(a => {
                  const e = employees.find(emp => emp.id === a.employee_id);
                  return {
                    id: a.id,
                    employee_id: a.employee_id,
                    shift_id: a.shift_id,
                    status: (a as any).status ?? "",
                    employee: e ? {
                      first_name: e.first_name ?? "",
                      last_name: e.last_name ?? "",
                      phone_number: (e as any).phone_number ?? null,
                    } : null,
                  };
                })}
                companyId={selectedCompanyId}
                userId={user?.id ?? null}
              />
            </section>
          ) : null}

          {/* 5. Cierre diario — alerta compacta solo si urgente (hoy / pasado) */}
          {shift && selectedCompanyId && (dateBucket === "today" || dateBucket === "past") ? (
            <section>
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground truncate">
                    Cierre diario pendiente
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg text-xs font-semibold"
                  onClick={() => {
                    setMoreOpen(true);
                    setCloseoutOpen(true);
                  }}
                >
                  Revisar cierre
                </Button>
              </div>
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
                {/* Acciones secundarias */}
                <div className="flex flex-col gap-2">
                  {canValidate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-10 rounded-lg gap-1.5 text-xs font-medium"
                      onClick={() => setNotifyOpen(true)}
                    >
                      <Bell className="h-3.5 w-3.5" />
                      Notificar equipo
                    </Button>
                  )}
                  {/* Export Connecteam — admin-equivalent gate.
                      `canValidate` resolves via canManageShifts(): developer /
                      owner / founder OR canAccessAdminForCompany(selectedCompanyId).
                      Workers can never see this action. See module comment in
                      src/lib/integrations/connecteam-export.ts. */}
                  {canValidate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-10 rounded-lg gap-1.5 text-xs font-medium"
                      onClick={() => setConnecteamExportOpen(true)}
                      aria-label="Exportar este turno a Connecteam"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Exportar a Connecteam
                    </Button>
                  )}
                  <div className="flex items-center gap-2">
                    {draft ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="flex-1 h-10 rounded-lg gap-1.5 text-xs font-medium"
                        title="Publica el turno antes de compartir"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Compartir turno
                      </Button>
                    ) : (
                      <ShiftShareMenu
                        shiftId={shift.id}
                        token={(shift as Shift & { shift_link_token?: string | null }).shift_link_token ?? null}
                        title={shift.title || "Turno"}
                        date={shift.date}
                        startTime={shift.start_time}
                        endTime={shift.end_time}
                        clientName={clientName && clientName !== "—" ? clientName : null}
                        jobSite={locationName || null}
                        meetingPoint={shiftMeeting.point ?? meetingPoint ?? null}
                        meetingTime={shiftMeeting.time}
                        instructions={shift.notes ?? null}
                        variant="outline"
                        size="sm"
                        className="flex-1 h-10 rounded-lg text-xs font-medium"
                      />
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 rounded-lg gap-1.5 text-xs font-medium"
                      onClick={handleCopySummary}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar resumen
                    </Button>
                  </div>
                </div>

                {/* Acción del encargado — captain/admin next action (read-only) */}
                {shift ? (
                  <CaptainNextActionCard
                    shift={{
                      id: shift.id,
                      date: shift.date,
                      start_time: shift.start_time,
                      end_time: shift.end_time,
                    }}
                    onOpenCloseout={() => setCloseoutOpen(true)}
                  />
                ) : null}

                {/* Turno en vivo — live operational board (read-only) */}
                {shift && selectedCompanyId ? (
                  <LiveShiftBoard
                    shiftId={shift.id}
                    companyId={selectedCompanyId}
                    shiftDate={shift.date}
                    startTime={shift.start_time}
                    endTime={shift.end_time}
                    slots={(shift as any).slots ?? slots}
                    assignments={assignments}
                    employees={employees}
                    shiftAdminId={shiftAdminId}
                  />
                ) : null}

                {/* Ciclo del turno — operational lifecycle timeline */}
                {shift ? (
                  <ShiftLifecycleTimeline
                    shift={{
                      id: shift.id,
                      date: shift.date,
                      start_time: shift.start_time,
                      end_time: shift.end_time,
                      slots: (shift as any).slots ?? null,
                      status: shift.status ?? null,
                      publication_status: (shift as any).publication_status ?? null,
                    }}
                    assignments={assignments.filter(a => a.shift_id === shift.id).map(a => ({ shift_id: a.shift_id, status: a.status }))}
                  />
                ) : null}


                {/* Cierre diario (movido aquí) */}
                {shift && selectedCompanyId ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setCloseoutOpen(v => !v)}
                      className="w-full flex items-center justify-between gap-2 mb-2 px-0.5 text-left"
                      aria-expanded={closeoutOpen}
                    >
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
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
                        canFinalApprove={canValidate}
                        role={canValidate ? "admin" : "shift_admin"}
                      />
                    ) : (
                      <p className="px-0.5 text-xs text-muted-foreground">
                        Toca para revisar o registrar el cierre operativo del día.
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Detalles del turno */}
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
                    Detalles del turno
                  </p>
                  <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40">
                    <DetailRow icon={CalendarDays} label="Fecha" value={(() => {
                      try { return format(parseISO(shift.date), "EEEE, d 'de' MMMM, yyyy", { locale: es }); } catch { return shift.date; }
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
                          title={MOBILE_SHIFT_COPY.noLocationTitle}
                          helper={MOBILE_SHIFT_COPY.noLocationHelper}
                          compact
                        />
                      </div>
                    ) : (
                      <DetailRow icon={MapPin} label="Ubicación" value={locationName || "—"} muted={!locationName} />
                    )}
                    {mp ? (
                      <div className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-foreground leading-tight">
                              Punto de encuentro registrado
                            </p>
                            <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
                              Este es el lugar donde se reúnen antes de ir al trabajo.
                            </p>
                            <p className="text-[12px] text-foreground/85 mt-1">
                              {mp}{mt && <> · <span className="font-mono tabular-nums">{mt}</span></>}
                            </p>
                          </div>
                        </div>
                      </div>
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
                  <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
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
                      <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
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
                Acciones adicionales, cierre, detalles del turno, notas y origen.
              </p>
            )}
          </section>
        </div>

        {/* Sticky footer — OX-9.2: UNA sola acción principal. El resto vive en overflow. */}
        <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom,0px),12px)] border-t border-border/40 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Button
              className="flex-1 h-12 rounded-xl text-sm font-bold gap-2"
              onClick={primaryAction.onClick}
              aria-label={primaryAction.label}
            >
              <primaryAction.icon className="h-4 w-4" />
              {primaryAction.label}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl shrink-0"
                  aria-label="Más acciones del turno"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {canValidate && primaryAction.key !== "team" && (
                  <DropdownMenuItem className="gap-2 h-11 text-sm" onClick={() => setHubOpen(true)}>
                    <Users className="h-4 w-4" /> Gestionar equipo
                  </DropdownMenuItem>
                )}
                {primaryAction.key !== "operate" && (
                  <DropdownMenuItem className="gap-2 h-11 text-sm" onClick={handleViewAttendance}>
                    <ClipboardList className="h-4 w-4" /> Asistencia
                  </DropdownMenuItem>
                )}
                {canValidate && onEdit && !editLocked && (
                  <DropdownMenuItem
                    className="gap-2 h-11 text-sm"
                    onClick={() => { onOpenChange(false); onEdit(shift); }}
                  >
                    <FileEdit className="h-4 w-4" /> {ADMIN_LEX.edit}
                  </DropdownMenuItem>
                )}
                {/* P0 — Cancelar detiene la operación futura, nunca borra la historia. */}
                {canValidate && !editLocked && (
                  <DropdownMenuItem
                    className="gap-2 h-11 text-sm text-destructive focus:text-destructive"
                    onClick={() => setCancelOpen(true)}
                  >
                    <CalendarX2 className="h-4 w-4" /> {ADMIN_LEX.cancel}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>

            </DropdownMenu>
          </div>
        </div>

      </SheetContent>
    </Sheet>
    <CancelShiftDialog
      open={cancelOpen}
      onOpenChange={setCancelOpen}
      shiftId={shift?.id ?? null}
      companyId={(shift as any)?.company_id ?? selectedCompanyId ?? null}
      shiftRef={shift ? getShiftDisplayIdentity(shift).primaryRef : ""}
      clientLine={shift?.title ?? null}
      whenLine={shift ? `${shift.date} · ${String(shift.start_time).slice(0, 5)} – ${String(shift.end_time).slice(0, 5)}` : null}
      requiredWorkers={data?.slots ?? null}
      assignedActive={data?.assignedCount ?? null}
      expectedStatus={shift?.status ?? null}
      source="mobile_shift_operations"
      onCancelled={() => { setCancelOpen(false); onOpenChange(false); }}
    />

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
        import_batch_id: a.import_batch_id,
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
    <LocationReportDialog
      open={locationReportOpen}
      onOpenChange={setLocationReportOpen}
      shiftCode={getShiftDisplayIdentity(shift).primaryRefKind !== "none" ? getShiftDisplayIdentity(shift).primaryRef : null}
      clientName={clientName}
      jobSiteName={locationName}
      meetingPoint={shiftMeeting.point ?? meetingPoint ?? null}
      notes={shift.notes ?? null}
    />
    {/* Export Connecteam v1 — admin-only preview + CSV download.
        Pure frontend: no payroll / time_entries / RLS / schema writes. */}
    <ExportConnecteamPreviewDialog
      open={connecteamExportOpen}
      onOpenChange={setConnecteamExportOpen}
      shift={shift}
      assignments={assignments}
      employees={employees}
      clients={shift?.client_id ? [{ id: shift.client_id, name: clientName && clientName !== "—" ? clientName : "" }] : []}
      locations={shift?.location_id ? [{ id: shift.location_id, name: locationName || "" }] : []}
      selectedCompanyId={selectedCompanyId ?? null}
      shiftCompanyId={(shift as any)?.company_id ?? selectedCompanyId ?? null}
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
          <span className="ml-auto inline-flex items-center h-[18px] px-1.5 rounded-full bg-muted text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      {helper && (
        <p className="text-[12px] text-muted-foreground mt-1 leading-snug">
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
  const label = retryLabel ?? "Reintentar";
  const isRetrying = !!retryDisabled && label !== "Reintentar";
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
            <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{helper}</p>
          )}
          {isDev && devHint && (
            <p className="mt-1.5 text-[12px] font-mono text-rose-700/70 dark:text-rose-300/70 leading-snug break-words">
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
                  aria-label="Volver a turnos"
                >
                  Volver
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
              <span className="inline-flex items-center h-[18px] px-1.5 rounded-full bg-muted text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                {badge}
              </span>
            )}
          </div>
          {helper && (
            <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{helper}</p>
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
    good: { cls: FAMILY_CLASSES.positive, Icon: CheckCircle2 },
    warn: { cls: FAMILY_CLASSES.warning, Icon: AlertTriangle },
    bad:  { cls: FAMILY_CLASSES.critical, Icon: AlertTriangle },
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
}: { label: string; value: number | string; tone?: "default" | "good" | "warn" | "bad" | "muted" | "info" }) {
  const cls =
    tone === "good" ? FAMILY_CLASSES.positive :
    tone === "warn" ? FAMILY_CLASSES.warning :
    tone === "bad"  ? FAMILY_CLASSES.critical :
    tone === "info" ? FAMILY_CLASSES.progress :
    tone === "muted" ? "bg-muted/50 text-muted-foreground border-border/50" :
    "bg-card text-foreground border-border/60";
  return (
    <div className={cn("inline-flex items-center gap-1 h-7 px-2 rounded-full border text-[12px] font-medium", cls)}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-80">{label}</span>
    </div>
  );
}

function attendanceBadgeFor(
  attendanceStatus: string | null,
  clock: { clock_in: string | null; clock_out: string | null } | undefined,
): { label: string; cls: string } {
  if (clock?.clock_out) return { label: "Salió", cls: "bg-muted text-muted-foreground" };
  if (clock?.clock_in) return { label: "Registrado", cls: FAMILY_CLASSES.positive };
  switch ((attendanceStatus ?? "").toLowerCase()) {
    case "present": return { label: "Presente", cls: FAMILY_CLASSES.positive };
    case "late":    return { label: "Tarde", cls: FAMILY_CLASSES.warning };
    case "absent":  return { label: "Ausente", cls: FAMILY_CLASSES.critical };
    case "excused": return { label: "Justificado", cls: "bg-muted text-muted-foreground" };
    case "needs_review": return { label: "Por revisar", cls: "bg-primary/15 text-primary" };
    default: return { label: "Sin iniciar", cls: "bg-muted text-muted-foreground" };
  }
}

function roleBadgeFor(role: string | null, isShiftAdmin: boolean): { label: string; cls: string } | null {
  if (isShiftAdmin) return { label: "Admin del turno", cls: "bg-primary/15 text-primary border-primary/30" };
  if (!role) return null;
  const r = role.toLowerCase();
  if (r === "captain") return { label: "Capitán", cls: FAMILY_CLASSES.warning };
  if (r === "lead" || r === "admin") return { label: "Líder", cls: "bg-primary/15 text-primary border-primary/30" };
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
    acceptedAt: string | null;
    respondedAt: string | null;
    importBatchId: string | null;
    canManagePhone: boolean;
    onPhoneSaved: () => void;
  },
  next: {
    worker: Employee;
    assignmentStatus: string | null;
    attendanceStatus: string | null;
    role: string | null;
    clock: { clock_in: string | null; clock_out: string | null } | undefined;
    isShiftAdmin: boolean;
    acceptedAt: string | null;
    respondedAt: string | null;
    importBatchId: string | null;
    canManagePhone: boolean;
    onPhoneSaved: () => void;
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
  if (prev.acceptedAt !== next.acceptedAt) return false;
  if (prev.respondedAt !== next.respondedAt) return false;
  if (prev.importBatchId !== next.importBatchId) return false;
  if (prev.canManagePhone !== next.canManagePhone) return false;
  return true;
}

const WorkerRow = memo(function WorkerRow({
  worker, assignmentStatus, attendanceStatus, role, clock, isShiftAdmin,
  acceptedAt, respondedAt, importBatchId, canManagePhone, onPhoneSaved,
}: {
  worker: Employee;
  assignmentStatus: string | null;
  attendanceStatus: string | null;
  role: string | null;
  clock: { clock_in: string | null; clock_out: string | null } | undefined;
  isShiftAdmin: boolean;
  acceptedAt?: string | null;
  respondedAt?: string | null;
  importBatchId?: string | null;
  canManagePhone?: boolean;
  onPhoneSaved?: () => void;
}) {
  const phone = worker.phone_number?.trim();
  const normalized = normalizePhone(phone);
  const wa = phone ? buildWhatsAppTargets(phone, "") : null;
  const workerName = `${worker.first_name ?? ""} ${worker.last_name ?? ""}`.trim() || "trabajador";
  const initialsStr = (worker.first_name?.[0] ?? "").toUpperCase() + (worker.last_name?.[0] ?? "").toUpperCase();
  const att = attendanceBadgeFor(attendanceStatus, clock);
  const roleBadge = roleBadgeFor(role, isShiftAdmin);
  const statusLow = (assignmentStatus ?? "").toLowerCase();
  const isImportedNotResponded =
    !!importBatchId && !acceptedAt && !respondedAt &&
    (statusLow === "accepted" || statusLow === "assigned");
  const showAssignStatus = statusLow && !["accepted", "confirmed", "assigned"].includes(statusLow);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  const handleCopy = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Teléfono copiado");
    } catch {
      toast.error("No se pudo copiar el teléfono");
    }
  };

  const openPhoneDialog = () => {
    setPhoneInput("");
    setPhoneDialogOpen(true);
  };

  const submitPhone = async () => {
    const digits = normalizePhone(phoneInput);
    if (digits.length < 10) {
      toast.error("Número inválido. Debe tener 10 dígitos.");
      return;
    }
    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from("employees")
        .update({ phone_number: digits })
        .eq("id", worker.id);
      if (error) throw error;
      toast.success("Teléfono guardado");
      setPhoneDialogOpen(false);
      onPhoneSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar el teléfono");
    } finally {
      setSavingPhone(false);
    }
  };

  const [expanded, setExpanded] = useState(false);

  // Compact status chips. Tones: emerald=ok, amber=warn, rose=bad, sky=info, muted.
  type Chip = { label: string; tone: "good" | "warn" | "bad" | "info" | "muted"; title?: string };
  const chips: Chip[] = [];

  // Attendance / clock state
  if (clock?.clock_out) chips.push({ label: "Salió", tone: "muted" });
  else if (clock?.clock_in) chips.push({ label: "En sitio", tone: "good" });
  else {
    const aLow = (attendanceStatus ?? "").toLowerCase();
    if (aLow === "present") chips.push({ label: "Presente", tone: "good" });
    else if (aLow === "late") chips.push({ label: "Tarde", tone: "warn" });
    else if (aLow === "absent") chips.push({ label: "No-show", tone: "bad" });
    else if (aLow === "excused") chips.push({ label: "Justif.", tone: "muted" });
    else if (aLow === "needs_review") chips.push({ label: "Revisar", tone: "info" });
    else chips.push({ label: "Sin iniciar", tone: "muted" });
  }

  // Response / assignment state
  if (isImportedNotResponded) {
    chips.push({ label: "Importado", tone: "info", title: "Importado desde Connecteam. Aún no confirmado en Stafly." });
  } else if (statusLow === "rejected") chips.push({ label: "Rechazó", tone: "bad" });
  else if (statusLow === "removed") chips.push({ label: "Removido", tone: "bad" });
  else if (statusLow === "pending") chips.push({ label: "Pend.", tone: "warn" });
  else if (statusLow === "confirmed") chips.push({ label: "Confirmado", tone: "good" });
  else if (statusLow === "accepted" && acceptedAt) chips.push({ label: "Aceptó", tone: "good" });

  if (!phone) chips.push({ label: "Sin tel.", tone: "warn" });

  const chipToneCls = (tone: Chip["tone"]) =>
    tone === "good" ? FAMILY_CLASSES.positive :
    tone === "warn" ? FAMILY_CLASSES.warning :
    tone === "bad"  ? FAMILY_CLASSES.critical :
    tone === "info" ? FAMILY_CLASSES.progress :
                      "bg-muted text-muted-foreground";

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left active:bg-muted/40 transition"
        aria-expanded={expanded}
        aria-label={`${workerName} — detalles`}
      >
        <Avatar className="h-8 w-8 shrink-0">
          {worker.avatar_url ? <AvatarImage src={worker.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-[12px] font-semibold bg-muted">
            {initialsStr || "·"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-semibold leading-tight truncate">
              {worker.first_name} {worker.last_name}
            </span>
            {isShiftAdmin && <Crown className="h-3 w-3 text-primary shrink-0" />}
            {roleBadge && (
              <span className={cn("inline-flex items-center h-[15px] px-1 rounded-full border text-[12px] font-bold uppercase tracking-wider shrink-0", roleBadge.cls)}>
                {roleBadge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {chips.slice(0, 3).map((c, i) => (
              <span
                key={i}
                title={c.title}
                className={cn("inline-flex items-center h-[15px] px-1.5 rounded-full text-[12px] font-bold uppercase tracking-wide", chipToneCls(c.tone))}
              >
                {c.label}
              </span>
            ))}
            {chips.length > 3 && (
              <span className="text-[12px] text-muted-foreground font-medium">+{chips.length - 3}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary"
              aria-label={`Llamar a ${workerName}`}
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-border/40">
          {isImportedNotResponded && (
            <p className="text-[12px] text-muted-foreground mb-1.5">
              Importado desde Connecteam. Aún no confirmado en Stafly.
            </p>
          )}
          {phone ? (
            <div className="flex items-center gap-1.5">
              <a
                href={`tel:${phone}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary/10 text-primary text-[12px] font-semibold"
              >
                <Phone className="h-3 w-3" /> Llamar
              </a>
              <a
                href={`sms:${normalized || phone}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-muted text-foreground text-[12px] font-semibold"
              >
                <MessageSquare className="h-3 w-3" /> SMS
              </a>
              {wa?.waMeUrl && (
                <a
                  href={wa.waMeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-status-success-bg text-status-success text-[12px] font-semibold"
                >
                  <MessageCircle className="h-3 w-3" /> WA
                </a>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-muted text-muted-foreground"
                aria-label="Copiar teléfono"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-2.5 py-2 flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1 text-[12px] text-muted-foreground leading-snug">
                {MOBILE_SHIFT_COPY.noPhoneHelper}
              </div>
              {canManagePhone && (
                <button
                  type="button"
                  onClick={openPhoneDialog}
                  disabled={savingPhone}
                  className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-60"
                >
                  <Phone className="h-3 w-3" />
                  {savingPhone ? "…" : "Agregar"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar teléfono</DialogTitle>
            <DialogDescription>{workerName} · 10 dígitos. Solo actualiza este perfil.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`phone-${worker.id}`}>Número de teléfono</Label>
            <Input
              id={`phone-${worker.id}`}
              inputMode="tel"
              autoFocus
              placeholder="(555) 123-4567"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitPhone(); }}
            />
            <p className="text-[12px] text-muted-foreground">
              No se envían notificaciones. No se modifican registros duplicados.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setPhoneDialogOpen(false)} disabled={savingPhone}>Cancelar</Button>
            <Button onClick={submitPhone} disabled={savingPhone}>
              {savingPhone ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const base = "text-[12px] font-medium h-[22px] px-2 leading-none";
  if (draft) {
    return <Badge variant="outline" className={cn(base, FAMILY_CLASSES.warning)}>Draft</Badge>;
  }
  if (published && understaffed) {
    return <Badge variant="outline" className={cn(base, FAMILY_CLASSES.critical)}>Unstaffed</Badge>;
  }
  if (published) {
    return <Badge variant="outline" className={cn(base, FAMILY_CLASSES.positive)}>Published</Badge>;
  }
  return <Badge variant="outline" className={cn(base)}>Shift</Badge>;
}

function PublicationBadge({
  status, draft, published,
}: { status?: string | null; draft: boolean; published: boolean }) {
  const base = "h-[22px] px-2 text-[12px] font-semibold leading-none";
  const s = (status ?? "").toLowerCase();
  if (s === "cancelled" || s === "canceled") {
    return <Badge variant="outline" aria-label="Publication status: cancelled" className={cn(base, FAMILY_CLASSES.critical)}>Cancelled</Badge>;
  }
  if (s === "archived") {
    return <Badge variant="outline" aria-label="Publication status: archived" className={cn(base, FAMILY_CLASSES.neutral)}>Archived</Badge>;
  }
  if (draft) {
    return <Badge variant="outline" aria-label="Publication status: draft — workers cannot see this shift yet" className={cn(base, FAMILY_CLASSES.warning)}>Draft</Badge>;
  }
  if (published) {
    return <Badge variant="outline" aria-label="Publication status: published" className={cn(base, FAMILY_CLASSES.positive)}>Published</Badge>;
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
    { label: "Referencia", value: getShiftDisplayIdentity(shift).primaryRef },
    { label: "Referencia anterior", value: getShiftDisplayIdentity(shift).legacyRef },
    { label: "ID interno", value: shift.id.slice(0, 8) + "…", hint: shift.id },
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
    try { return format(parseISO(ts), "MMM d, yyyy · HH:mm", { locale: es }); }
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


/* ───── LocationReportDialog ─────
 * Non-destructive: does NOT update location_id / meeting_point / shift fields.
 * Builds a structured note and copies it to clipboard for admin review.
 * No DB write, no schema, no audit table dependency.
 */
function LocationReportDialog({
  open, onOpenChange, shiftCode, clientName, jobSiteName, meetingPoint, notes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shiftCode: string | null;
  clientName: string;
  jobSiteName: string;
  meetingPoint: string | null;
  notes: string | null;
}) {
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setCorrection(""); }, [open]);

  const handleSave = async () => {
    if (!correction.trim()) {
      toast.error("Agrega una nota de corrección.");
      return;
    }
    setSaving(true);
    const payload = [
      `Reporte de ubicación${shiftCode ? ` — Turno ${shiftCode}` : ""}`,
      `Cliente: ${clientName || "—"}`,
      `Trabajo: ${jobSiteName || "(falta)"}`,
      `Encuentro: ${meetingPoint || "(falta)"}`,
      notes ? `Notas: ${notes}` : null,
      `Corrección sugerida: ${correction.trim()}`,
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Reporte copiado para revisión", {
        description: "Pégalo en el chat de operaciones o pásalo a un administrador.",
      });
      onOpenChange(false);
    } catch {
      toast.error("No se pudo copiar el reporte. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reportar ubicación</DialogTitle>
          <DialogDescription>
            No cambia el turno. Solo prepara un reporte para revisión administrativa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-[12.5px]">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 space-y-1">
            {shiftCode && <div><span className="text-muted-foreground">Turno: </span><span className="font-semibold">{shiftCode}</span></div>}
            <div><span className="text-muted-foreground">Cliente: </span>{clientName || "—"}</div>
            <div><span className="text-muted-foreground">Trabajo: </span>{jobSiteName || <span className="text-amber-700 dark:text-amber-400">(falta)</span>}</div>
            <div><span className="text-muted-foreground">Encuentro: </span>{meetingPoint || <span className="text-muted-foreground">—</span>}</div>
            {notes && <div className="text-[12px] text-muted-foreground line-clamp-3">Notas: {notes}</div>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-correction">Nota de corrección</Label>
            <Textarea
              id="loc-correction"
              rows={3}
              placeholder="Ej.: La dirección real del trabajo es 123 Main St, NY. La actual es el punto de encuentro."
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Copiando…" : "Guardar reporte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
