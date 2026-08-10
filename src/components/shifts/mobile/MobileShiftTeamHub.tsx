/**
 * MobileShiftTeamHub — Phase 1 (read-first operational panel).
 *
 * Opened from MobileShiftOperationsSheet via a "Manage team" CTA.
 * READ-ONLY by design: no inserts, no updates, no deletes, no notifications.
 * The Hub re-organizes data already loaded by the parent sheet, plus a single
 * scoped read of `shift_requests` for the Claims tab. All mutations stay on
 * desktop; mobile shows safe deep links.
 *
 * Tabs:
 *   1. Overview   — operational counts (slots, accepted, pending, rejected,
 *                   removed, no-show/absent, claims pending, open spots)
 *   2. Assigned   — workers grouped by lifecycle bucket, with contact actions
 *                   and captain badge (employee_id == shift_admin_id)
 *   3. Claims     — pending shift_requests for this shift (read-only)
 *   4. Issues     — derived risks (missing phone, pending responses, no
 *                   location/client, absent, open spots)
 *   5. Recommended — Phase 2 placeholder + desktop deep link
 *
 * Safety contract:
 *  - Zero writes. Permission-gated by parent (canManageShifts).
 *  - Worker portal unaffected. Desktop unaffected. Payroll/RLS untouched.
 */

import { isAssignableWorker } from "@/lib/shifts/assignable-workers";
import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import { createContext, memo, useContext, useEffect, useMemo, useState } from "react";
import {
  X, Users, ShieldCheck, Clock, ExternalLink, Inbox,
  CheckCircle2, AlertCircle, UserMinus, UserX, Phone, MessageSquare,
  Copy, AlertTriangle, Sparkles, Star, MapPin, Briefcase,
  MoreVertical, Check, XCircle, UserCog, Search, UserPlus, ClipboardCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatShiftCode, type Shift, type Employee } from "@/components/shifts/types";
import { AssignWorkerCard } from "@/components/shifts/assign/AssignWorkerCard";
import { FAMILY_CLASSES } from "@/lib/status/status-registry";
import { MT } from "@/lib/mobile/mobile-scale";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone, buildWhatsAppTargets } from "@/lib/phone";
import { notifySuccess, notifyError, notifyWarning } from "@/lib/feedback/notify";
import { allowedNextStatusesFor, type AssignmentNextStatus, type ClaimDecision } from "@/lib/shifts/team-actions";
import { MobileTeamActionDialog } from "@/components/shifts/mobile/MobileTeamActionDialog";
import { RemoveWorkerFromShiftDialog } from "@/components/shifts/RemoveWorkerFromShiftDialog";
import {
  describeAssignmentStatus, optimisticStatus,
  type AssignmentStatus, type ReadinessState,
} from "@/lib/shifts/assignment-status";
import { useAssignmentStatuses } from "@/hooks/useAssignmentStatuses";
import { formatDistanceToNowStrict, format, parseISO, isToday, isTomorrow } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  rankCandidate, inferShiftRoleNeeds, EMPTY_SIGNALS,
  type RecommendationSignals, type ReviewSignal, type RankedCandidate,
  type WorkerPreferenceRow, type WorkerPreferenceType,
} from "@/lib/shifts/worker-recommendation";
import { TeamCard, KpiCard, InsightCard, ValidationCard, type TeamMemberSummary } from "@/components/ocs";
import { TeamHubWorkerCard } from "@/components/shifts/team/TeamHubWorkerCard";
import { TeamConversationCard } from "@/components/shifts/team/TeamConversationCard";
import {
  summarizeTeam, detectTeamRisks, teamSectionOf, teamPrimaryIntent,
  TEAM_SECTION_META, TEAM_SECTION_ORDER,
  type TeamSection, type TeamSummary, type TeamRisk,
} from "@/lib/shifts/team-hub-model";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

function formatRelative(iso: string): string {
  try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true }); }
  catch { return ""; }
}

function formatTimeShort(t?: string | null): string {
  if (!t) return "—";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function dateLabel(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return "Hoy";
    if (isTomorrow(d)) return "Mañana";
    return format(d, "EEE d MMM", { locale: enUS });
  } catch { return iso; }
}

/* ─── Phase 12: chip display polish for Recommended ─── */

type DisplayChip = { key: string; label: string; tone: "good" | "risk" | "neutral" };

/**
 * Build prioritized, deduplicated chips for a candidate. Replaces raw history
 * keys with count-aware labels ("Worked here 22x") and resolves the
 * "high reliability + reliability risk" collision into "Good rating" + "1 risk
 * flag". Caps to 4 chips total. Also returns a one-line operator summary.
 */
function buildRecommendedDisplay(c: RankedCandidate): {
  chips: DisplayChip[];
  summary: string | null;
} {
  const reasonSet = new Set<string>(c.reasons);
  const riskSet = new Set<string>(c.riskFlags);
  const hasGoodRating = reasonSet.has("high_reliability");
  const hasRatingRisk = riskSet.has("low_reliability");

  // Build candidate chips in priority order (Phase 12 spec).
  const candidates: DisplayChip[] = [];

  // 1. Preference signals (strongest)
  if (riskSet.has("blocked_here")) candidates.push({ key: "blocked_here", label: "Bloqueado aquí", tone: "risk" });
  if (riskSet.has("not_recommended")) candidates.push({ key: "not_recommended", label: "No recomendado", tone: "risk" });
  if (reasonSet.has("preferred")) candidates.push({ key: "preferred", label: "Preferido", tone: "good" });
  if (reasonSet.has("prequalified")) candidates.push({ key: "prequalified", label: "Precalificado", tone: "good" });
  if (reasonSet.has("captain_preferred")) candidates.push({ key: "captain_preferred", label: "Capitán preferido", tone: "good" });
  if (reasonSet.has("driver_preferred")) candidates.push({ key: "driver_preferred", label: "Conductor preferido", tone: "good" });

  // 2. Conflict / availability
  if (riskSet.has("conflict")) candidates.push({ key: "conflict", label: "Conflicto", tone: "risk" });
  if (riskSet.has("unavailable")) candidates.push({ key: "unavailable", label: "No disponible", tone: "risk" });

  // 3. Readiness
  if (reasonSet.has("ready")) candidates.push({ key: "ready", label: "Listo", tone: "good" });
  else if (reasonSet.has("compliance_warning")) candidates.push({ key: "compliance_warning", label: "Compliance pendiente", tone: "good" });
  else if (reasonSet.has("override_required")) candidates.push({ key: "override_required", label: "Requiere autorización", tone: "risk" });

  // 4. Venue / client history (count-aware)
  if (c.locationHistoryCount > 0) {
    candidates.push({ key: "worked_location", label: `Trabajó aquí ${c.locationHistoryCount}x`, tone: "good" });
  }
  if (c.clientHistoryCount > 0) {
    candidates.push({ key: "worked_client", label: `Trabajó cliente ${c.clientHistoryCount}x`, tone: "good" });
  }

  // 5. Reliability (collision-aware)
  if (hasGoodRating && hasRatingRisk) {
    candidates.push({ key: "good_rating", label: "Buena calificación", tone: "good" });
    candidates.push({ key: "risk_flag", label: "1 alerta", tone: "risk" });
  } else if (hasGoodRating) {
    candidates.push({ key: "high_reliability", label: "Alta confiabilidad", tone: "good" });
  } else if (hasRatingRisk) {
    candidates.push({ key: "low_reliability", label: "Alerta de confiabilidad", tone: "risk" });
  }

  // 6. Role / driver / captain (lowest priority)
  if (reasonSet.has("captain")) candidates.push({ key: "captain", label: "Capitán", tone: "good" });
  if (reasonSet.has("driver")) candidates.push({ key: "driver", label: "Conductor", tone: "good" });
  if (reasonSet.has("role_match")) candidates.push({ key: "role_match", label: "Rol coincide", tone: "good" });

  // Dedupe by key, cap to 4
  const seen = new Set<string>();
  const chips: DisplayChip[] = [];
  for (const ch of candidates) {
    if (seen.has(ch.key)) continue;
    seen.add(ch.key);
    chips.push(ch);
    if (chips.length >= 4) break;
  }

  // One-line summary: lead with strongest positive signal + reliability if present.
  const parts: string[] = [];
  const lead =
    reasonSet.has("preferred") ? "Trabajador preferido"
    : reasonSet.has("prequalified") ? "Precalificado"
    : c.locationHistoryCount >= 5 ? `Buen perfil: trabajó aquí ${c.locationHistoryCount} veces`
    : c.locationHistoryCount > 0 ? `Trabajó aquí ${c.locationHistoryCount}x`
    : c.clientHistoryCount > 0 ? `Trabajó cliente ${c.clientHistoryCount}x`
    : null;
  if (lead) parts.push(lead);
  if (hasGoodRating && !hasRatingRisk) parts.push("alta confiabilidad");
  else if (hasGoodRating && hasRatingRisk) parts.push("buena calificación · 1 alerta");

  const summary = parts.length > 0 ? parts.join(" · ") : null;
  return { chips, summary };
}

/* ─── Worker readiness — presentation only ───────────────────────────────
 * All rules live in Postgres (`get_employee_assignment_status`). This file
 * never decides who can be assigned; it only renders the backend verdict.
 * `missing_phone` is a contactability hint and never blocks.
 * ---------------------------------------------------------------------- */

type HubReadinessState = ReadinessState | "missing_phone";

interface Readiness {
  state: HubReadinessState;
  canBeApproved: boolean;
  requiresOverride: boolean;
  label: string;
  helper: string;
}

/** Context so every subtree reads the same batched backend verdict. */
const AssignmentStatusContext = createContext<Map<string, AssignmentStatus>>(new Map());
const useStatusMap = () => useContext(AssignmentStatusContext);

function readinessFor(
  e: Employee | undefined,
  statuses: Map<string, AssignmentStatus>,
): Readiness {
  if (!e) {
    return {
      state: "needs_review", canBeApproved: false, requiresOverride: false,
      label: "Requiere revisión", helper: "No se pudo cargar el registro del trabajador.",
    };
  }
  const status = statuses.get(e.id) ?? optimisticStatus(e.id);
  const p = describeAssignmentStatus(status);

  if (status.readiness === "ready" && !normalizePhone(e.phone_number)) {
    return {
      state: "missing_phone", canBeApproved: true, requiresOverride: false,
      label: "Sin teléfono",
      helper: "Agrega un teléfono — sin él no se puede contactar al trabajador.",
    };
  }

  return {
    state: status.readiness,
    canBeApproved: p.canAssign,
    requiresOverride: p.requiresOverride,
    label: p.label,
    helper: `${p.reason} ${p.action}`.trim(),
  };
}

const READINESS_TONE: Record<HubReadinessState, "good" | "info" | "warn" | "bad" | "muted"> = {
  ready: "good",
  compliance_warning: "warn",
  override_required: "warn",
  compliance_blocked: "bad",
  missing_phone: "warn",
  inactive: "bad",
  needs_review: "muted",
};

function ReadinessChip({ readiness, className }: { readiness: Readiness; className?: string }) {
  if (readiness.state === "ready") return null;
  return (
    <Badge
      variant="outline"
      className={cn("h-[18px] px-1.5 text-[12px] font-semibold whitespace-nowrap inline-flex items-center", toneToClass(READINESS_TONE[readiness.state]), className)}
      title={readiness.helper}
    >
      <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
      {readiness.label}
    </Badge>
  );
}

function buildReminderText(workerName: string): string {
  return `Hola ${workerName}, por favor termina tu perfil de trabajador en el portal de Stafly para poder confirmar tus turnos. ¡Gracias!`;
}

const HUB_COPY = {
  intro: "Operación móvil. Puedes revisar, contactar y gestionar el equipo.",
  safetyNote: "Puedes revisar, contactar y gestionar el equipo desde móvil. Cambios avanzados siguen en escritorio.",
  loadError: "No se pudieron cargar los datos del equipo. Revisa tu conexión e inténtalo de nuevo.",
  tabsAria: "Secciones de gestión del equipo",
  // Resumen
  overviewHelper: "Resumen rápido de cobertura para este turno.",
  // Asignados
  assignedHelper: "Lista rápida del equipo y estado operativo.",
  emptyAssignedTitle: "Aún no hay trabajadores asignados",
  emptyAssignedHelper: "Usa Recomendados para asignar trabajadores rápidamente.",
  noPhone: "Sin teléfono registrado",
  // Solicitudes
  claimsHelper: "Revisa y decide las solicitudes pendientes.",
  claimsManagedDesktop: "Aprobar agrega al trabajador al turno; todavía deberá confirmar si aplica.",
  emptyClaimsTitle: "Sin solicitudes",
  emptyClaimsHelper: "Las solicitudes de trabajadores aparecerán aquí.",
  // Alertas
  issuesHelper: "Puntos que debes revisar antes del turno.",
  emptyIssuesTitle: "Sin alertas",
  emptyIssuesHelper: "La cobertura se ve bien y los datos de contacto están completos.",
  // Recomendados
  recommendedHelper: "Recomendaciones inteligentes según disponibilidad, historial y perfil.",
  recommendedPlaceholder:
    "Los trabajadores recomendados combinan disponibilidad, calificación, rol e historial.",
  openDesktopStaffing: "Más opciones en escritorio",
  permissionGate: "No tienes permiso para gestionar este turno.",
} as const;

export type HubAssignment = {
  id: string;
  employee_id: string;
  /** shift_assignments.status — accepted | confirmed | pending | removed | rejected */
  status: string;
  /** shift_assignments.response_status — accepted | pending | rejected */
  response_status?: string | null;
  attendance_status?: string | null;
  assignment_role?: string | null;
  /** Phase 5B — surfaced timestamps for worker response visibility. */
  accepted_at?: string | null;
  rejected_at?: string | null;
  responded_at?: string | null;
  /** DS5 — distinguish imported assignments from real Stafly responses (UI only). */
  import_batch_id?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shift: Shift;
  /** Already-loaded assignments for this shift (parent owns the query). */
  assignments: HubAssignment[];
  /** Employees catalog used to resolve names/avatars/phones. */
  employees: Employee[];
  /** Permission flag from parent (canManageShifts result). */
  canManage: boolean;
  /** Optional UI labels passed from parent for header context. */
  clientName?: string | null;
  locationName?: string | null;
  /** Optional meeting-point text — used to clarify "missing job site" issues. */
  meetingPoint?: string | null;
  /** Optional meeting time (HH:mm or HH:mm:ss). Presentational only. */
  meetingTime?: string | null;
  /** Whether a meeting_point_location_id is linked (separate from job site). */
  hasMeetingPointLocation?: boolean;
  /** scheduled_shifts.shift_admin_id, used for Captain badge. */
  shiftAdminId?: string | null;
  /** Tenant the shift/employees belong to (drives the grace-period decision). */
  companyId?: string | null;
  /** Optional callback so the parent sheet can refetch after a safe mutation. */
  onMutated?: () => void;
}

function toneToClass(tone: "good" | "info" | "warn" | "muted" | "bad"): string {
  switch (tone) {
    case "good": return FAMILY_CLASSES.positive;
    case "info": return FAMILY_CLASSES.progress;
    case "warn": return FAMILY_CLASSES.warning;
    case "bad": return FAMILY_CLASSES.critical;
    default: return FAMILY_CLASSES.neutral;
  }
}

function initialsOf(e: Employee | undefined): string {
  if (!e) return "·";
  const a = e.first_name?.[0] ?? "";
  const b = e.last_name?.[0] ?? "";
  return (a + b).toUpperCase() || "·";
}

function fullName(e: Employee | undefined): string {
  if (!e) return "Unknown worker";
  return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Unknown worker";
}

type ShiftRequestRow = {
  id: string;
  employee_id: string;
  status: string;
  message: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type TabKey = "overview" | "assigned" | "claims" | "issues" | "recommended";

function MobileShiftTeamHubImpl({
  open, onOpenChange, shift, assignments, employees, canManage,
  clientName, locationName, meetingPoint, meetingTime, hasMeetingPointLocation,
  shiftAdminId, companyId, onMutated,
}: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("overview");

  // ── Phase 2 + Phase 3: safe action dialog state.
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionMode, setActionMode] = useState<
    | { kind: "assignment_state"; assignmentId: string; nextStatus: AssignmentNextStatus; workerName: string }
    | { kind: "claim_decision"; requestId: string; decision: ClaimDecision; workerName: string }
    | { kind: "assign_worker"; shiftId: string; employeeId: string; workerName: string; graceWarning?: string | null }
    | null
  >(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // P0 — "Retirar del turno" tiene su propia operación canónica.
  const [removeTarget, setRemoveTarget] = useState<
    { assignmentId: string; workerName: string; roleLabel: string | null; statusLine: string | null } | null
  >(null);

  const openAssignmentAction = (assignmentId: string, nextStatus: AssignmentNextStatus, workerName: string) => {
    if (nextStatus === "removed") {
      const a = assignments.find(x => x.id === assignmentId);
      setRemoveTarget({
        assignmentId,
        workerName,
        roleLabel: a?.assignment_role === "driver" ? "Conductor" : null,
        statusLine: a?.status === "confirmed"
          ? "Esta persona ya confirmó el turno. Se le notificará."
          : "Esta persona está asignada pero aún no ha fichado.",
      });
      return;
    }
    setActionMode({ kind: "assignment_state", assignmentId, nextStatus, workerName });
    setActionDialogOpen(true);
  };
  const openClaimAction = (requestId: string, decision: ClaimDecision, workerName: string, employeeId?: string) => {
    if (decision === "approved" && employeeId) {
      const r = readinessFor(empById.get(employeeId), statusById);
      if (!r.canBeApproved) {
        notifyWarning({
          title: "Este worker aún no puede aprobarse",
          fact: r.helper,
          consequence: "La aprobación queda bloqueada hasta resolverlo.",
          key: "team-hub:claim-not-ready",
        });
        return;
      }
    }
    setActionMode({ kind: "claim_decision", requestId, decision, workerName });
    setActionDialogOpen(true);
  };
  const openAssignWorkerAction = (employeeId: string, workerName: string) => {
    const r = readinessFor(empById.get(employeeId), statusById);
    if (!r.canBeApproved) {
      notifyWarning({
        title: "Este worker aún no puede asignarse",
        fact: r.helper,
        consequence: "El turno sigue sin cubrir esa plaza.",
        key: "team-hub:assign-not-ready",
      });
      return;
    }
    setActionMode({
      kind: "assign_worker",
      shiftId: shift.id,
      employeeId,
      workerName,
      graceWarning: r.state === "compliance_warning" ? r.helper : null,
    });
    setActionDialogOpen(true);
  };
  const handleMutated = () => {
    setRefreshKey((k) => k + 1);
    onMutated?.();
  };

  // ── Claims (shift_requests) — single scoped read.
  const [claims, setClaims] = useState<ShiftRequestRow[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!open || !shift?.id) return;
    setClaimsLoading(true);
    setClaimsError(null);
    (async () => {
      const { data, error } = await supabase
        .from("shift_requests")
        .select("id, employee_id, status, message, created_at, reviewed_at, reviewed_by")
        .eq("shift_id", shift.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setClaimsError(HUB_COPY.loadError);
        setClaims([]);
      } else {
        setClaims((data ?? []) as ShiftRequestRow[]);
      }
      setClaimsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, shift?.id, refreshKey]);

  // ── Daily close (Phase 17C) — surfaces closeout state in Issues tab.
  const [closeout, setCloseout] = useState<import("@/lib/shifts/closeout").ShiftCloseout | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!open || !shift?.id) return;
    import("@/lib/shifts/closeout").then(({ getShiftCloseout }) =>
      getShiftCloseout(shift.id).then((r) => {
        if (!cancelled) setCloseout(r);
      })
    );
    return () => { cancelled = true; };
  }, [open, shift?.id, refreshKey]);

  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  // Single source of truth: backend assignment verdict for the whole roster.
  const employeeIds = useMemo(() => employees.map(e => e.id), [employees]);
  const { statusById } = useAssignmentStatuses(employeeIds, companyId);

  const hasPhoneOf = useMemo(() => {
    return (employeeId: string) => normalizePhone(empById.get(employeeId)?.phone_number).length >= 10;
  }, [empById]);

  /** OX-4.2 — secciones operativas (Listo, Pendiente, Atención, Reemplazos, Removidos). */
  const sections = useMemo(() => {
    const acc: Record<TeamSection, HubAssignment[]> = {
      ready: [], pending: [], attention: [], replacement: [], removed: [],
    };
    for (const a of assignments) {
      acc[teamSectionOf(a, { hasPhone: hasPhoneOf(a.employee_id) })].push(a);
    }
    return acc;
  }, [assignments, hasPhoneOf]);

  const slots = shift.slots ?? 0;
  const claimsPending = claims.filter(c => c.status === "pending").length;

  const summary = useMemo(
    () => summarizeTeam(assignments, slots, hasPhoneOf),
    [assignments, slots, hasPhoneOf],
  );

  const teamMembers = useMemo<TeamMemberSummary[]>(() => {
    return [...sections.ready, ...sections.pending, ...sections.attention]
      .map((a) => empById.get(a.employee_id))
      .filter((e): e is Employee => !!e)
      .map((e) => ({
        firstName: e.first_name ?? "",
        lastName: e.last_name ?? "",
        avatarUrl: e.avatar_url ?? null,
        gender: (e as { gender?: string | null }).gender ?? null,
      }));
  }, [sections, empById]);

  const risks = useMemo(
    () => detectTeamRisks({
      summary,
      claimsPending,
      hasLocation: !!shift.location_id,
      hasMeetingPoint: !!hasMeetingPointLocation || !!(meetingPoint && meetingPoint.trim()),
    }),
    [summary, claimsPending, shift.location_id, hasMeetingPointLocation, meetingPoint],
  );

  const TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: "overview", label: "Resumen" },
    { key: "assigned", label: "Asignados", badge: assignments.length || undefined },
    { key: "claims", label: "Solicitudes", badge: claimsPending || undefined },
    { key: "issues", label: "Alertas", badge: risks.length || undefined },
    { key: "recommended", label: "Recomendados" },
  ];

  return (
    <AssignmentStatusContext.Provider value={statusById}>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="h-[92vh] p-0 rounded-t-3xl flex flex-col overflow-hidden bg-background"
      >
        {/* Sticky header — compact operational summary */}
        <div className="px-4 pt-2.5 pb-1.5 border-b border-border/40 bg-background/95 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Gestionar equipo
                </span>
                {getShiftDisplayIdentity(shift).primaryRefKind !== "none" && (
                  <span className="text-[12px] font-mono font-semibold text-muted-foreground/80 truncate">
                    {getShiftDisplayIdentity(shift).primaryRef}
                  </span>
                )}
                {shift.publication_status && shift.publication_status !== "published" && (
                  <Badge variant="outline" className="h-[16px] px-1 text-[12px] uppercase tracking-wider">
                    {shift.publication_status}
                  </Badge>
                )}
              </div>
              <h2 className="text-[15px] font-semibold tracking-tight leading-snug line-clamp-1 mt-0.5">
                {clientName && clientName !== "—" ? clientName : (shift.title || "Turno")}
              </h2>
              <p className="text-[12px] text-muted-foreground truncate">
                {dateLabel(shift.date)} · <span className="text-foreground/85 font-semibold">{locationName || "Falta ubicación"}</span>
              </p>
              {/* Stafly Work Route — horario. OX-9.2: la cobertura vive sólo en TeamCard. */}
              <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">Entrada</span>
                <span className="text-[15px] font-bold font-mono tabular-nums text-foreground leading-none">{formatTimeShort(shift.start_time)}</span>
                <span className="text-[12px] text-muted-foreground/80">· termina aprox. <span className="font-mono tabular-nums">{formatTimeShort(shift.end_time)}</span></span>
              </div>

              {(meetingPoint || hasMeetingPointLocation) && (
                <p className="text-[12px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0 opacity-70" />
                  <span className="truncate">
                    Encuentro: <span className="text-foreground/90 font-medium">{meetingPoint || "—"}</span>
                    {meetingTime && <> · <span className="font-mono tabular-nums">{formatTimeShort(meetingTime)}</span></>}
                  </span>
                </p>
              )}
            </div>
            <Button
              variant="ghost" size="sm"
              className="h-8 px-2 rounded-full shrink-0 -mt-0.5 -mr-1 text-[12px] gap-1"
              onClick={() => onOpenChange(false)}
              aria-label="Volver al turno"
            >
              <X className="h-3.5 w-3.5" />
              Volver
            </Button>
          </div>

          {/* Tabs — horizontal scroll with edge fade; compact pills. */}
          <div
            role="tablist"
            aria-label={HUB_COPY.tabsAria}
            className="mt-2 -mx-4 px-4 pb-0.5 flex gap-1.5 overflow-x-auto scrollbar-hide snap-x"
          >
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "shrink-0 snap-start px-2.5 h-7 rounded-full text-[12px] font-semibold transition-colors flex items-center gap-1 whitespace-nowrap",
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t.label}
                  {typeof t.badge === "number" && t.badge > 0 && (
                    <span className={cn(
                      "min-w-[16px] h-[16px] px-1 rounded-full text-[12px] font-bold flex items-center justify-center tabular-nums",
                      active ? "bg-background/20 text-background" : "bg-foreground/10 text-foreground",
                    )}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 space-y-5">
          {!canManage && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-800 dark:text-amber-300"
            >
              {HUB_COPY.permissionGate}
            </div>
          )}

          {tab === "overview" && (
            <OverviewTab
              shift={shift}
              summary={summary}
              risks={risks}
              members={teamMembers}
              claimsPending={claimsPending}
              canManage={canManage}
              onGoTo={setTab}
              onOpenChannel={() => {
                onOpenChange(false);
                navigate("/app/chat");
              }}
              onBroadcast={() => setTab("assigned")}
            />
          )}

          {tab === "assigned" && (
            <AssignedTab
              assignments={assignments}
              sections={sections}
              empById={empById}
              shiftAdminId={shiftAdminId ?? null}
              canManage={canManage}
              onReplace={() => setTab("recommended")}
              onOpenWorker={(employeeId) => {
                onOpenChange(false);
                navigate(`/app/workers/${employeeId}`);
              }}
              onCopyPhone={(p) => {
                navigator.clipboard?.writeText(p).catch(() => {});
                notifySuccess({
                  title: "Teléfono copiado",
                  fact: "Ya puedes pegarlo donde lo necesites.",
                  key: "team-hub:copy-phone",
                });
              }}
              onAssignmentAction={openAssignmentAction}
              onPhoneSaved={handleMutated}
            />
          )}

          {tab === "claims" && (
            <ClaimsTab
              loading={claimsLoading}
              error={claimsError}
              claims={claims}
              empById={empById}
              canManage={canManage}
              companyId={companyId ?? null}
              onClaimAction={openClaimAction}
              onOpenDesktop={() => {
                onOpenChange(false);
                navigate("/app/shifts/requests");
              }}
              onViewWorker={(employeeId) => {
                onOpenChange(false);
                navigate(`/app/workers/${employeeId}`);
              }}
              onCopyReminder={(workerName) => {
                navigator.clipboard?.writeText(buildReminderText(workerName)).catch(() => {});
                notifySuccess({
                  title: "Recordatorio copiado",
                  fact: "Pégalo en WhatsApp o SMS para enviarlo.",
                  key: "team-hub:copy-reminder",
                });
              }}
            />
          )}

          {tab === "issues" && (
            <IssuesTab risks={risks} canManage={canManage} onGoTo={setTab} />
          )}

          {tab === "recommended" && (
            <RecommendedTab
              shift={shift}
              employees={employees}
              assignments={assignments}
              companyId={companyId}
              onAssign={openAssignWorkerAction}
              onViewWorker={(employeeId) => {
                onOpenChange(false);
                navigate(`/app/workers/${employeeId}`);
              }}
              onOpenDesktop={() => {
                onOpenChange(false);
                navigate("/app/shifts");
              }}
            />
          )}

          <p className="px-0.5 pt-1 text-[12px] text-muted-foreground leading-snug">
            {HUB_COPY.safetyNote}
          </p>
        </div>

        <MobileTeamActionDialog
          open={actionDialogOpen}
          onOpenChange={setActionDialogOpen}
          workerName={actionMode?.workerName ?? ""}
          mode={
            actionMode?.kind === "assignment_state"
              ? { kind: "assignment_state", assignmentId: actionMode.assignmentId, nextStatus: actionMode.nextStatus }
              : actionMode?.kind === "claim_decision"
                ? { kind: "claim_decision", requestId: actionMode.requestId, decision: actionMode.decision }
                : actionMode?.kind === "assign_worker"
                  ? { kind: "assign_worker", shiftId: actionMode.shiftId, employeeId: actionMode.employeeId, graceWarning: actionMode.graceWarning }
                  : null
          }
          onSuccess={handleMutated}
        />

        <RemoveWorkerFromShiftDialog
          open={!!removeTarget}
          onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
          assignmentId={removeTarget?.assignmentId ?? null}
          workerName={removeTarget?.workerName ?? ""}
          contextLine={[removeTarget?.roleLabel, (shift as any)?.shift_ref ?? (shift as any)?.shift_code]
            .filter(Boolean).join(" · ") || null}
          statusLine={removeTarget?.statusLine ?? null}
          source="mobile_team_hub"
          onRemoved={() => { setRemoveTarget(null); handleMutated(); }}
        />

      </SheetContent>
    </Sheet>
    </AssignmentStatusContext.Provider>
  );

}

export const MobileShiftTeamHub = memo(MobileShiftTeamHubImpl);

/* ─── Tabs ─── */

function OverviewTab({
  shift, summary, risks, members, claimsPending, canManage,
  onGoTo, onOpenChannel, onBroadcast,
}: {
  shift: Shift;
  summary: TeamSummary;
  risks: TeamRisk[];
  members: TeamMemberSummary[];
  claimsPending: number;
  canManage: boolean;
  onGoTo: (tab: TabKey) => void;
  onOpenChannel: () => void;
  onBroadcast?: () => void;
}) {
  const intent = teamPrimaryIntent(summary);
  const topRisks = risks.slice(0, 3);

  return (
    <section aria-label="Estado del equipo" className="space-y-3">
      <TeamCard
        title="Equipo"
        assigned={summary.assigned}

        slots={summary.slots}
        confirmed={summary.confirmed}
        present={summary.present}
        members={members}
        mode="readonly"
        action={
          canManage
            ? {
                label: intent.label,
                icon: intent.kind === "operate" ? ShieldCheck : UserPlus,
                onClick: () =>
                  onGoTo(
                    intent.kind === "complete"
                      ? "recommended"
                      : intent.kind === "confirm"
                        ? "assigned"
                        : "assigned",
                  ),
              }
            : undefined
        }
      />

      {/*
        OX-9.2 — cada card consume su propio estado real.
        Nunca se hereda el estado del turno padre, y una card en cero no se
        pinta de verde: sólo aparece cuando tiene algo que decir.
      */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          variant="compact"
          label="Confirmados"
          value={`${summary.confirmed}/${summary.assigned || 0}`}
          meaning={
            summary.pending > 0
              ? `${summary.pending} sin responder todavía.`
              : summary.confirmed > 0
                ? "Todo el equipo asignado ya respondió."
                : "Nadie ha confirmado todavía."
          }
          status={
            summary.pending > 0
              ? "pending"
              : summary.confirmed > 0
                ? "confirmed"
                : "not_started"
          }
          isEmpty={summary.assigned === 0}
          emptyLabel="Aún no hay nadie asignado"
          mode="readonly"
        />
        <KpiCard
          variant="compact"
          label="En sitio"
          value={summary.present}
          meaning={
            summary.late > 0
              ? `${summary.late} ${summary.late === 1 ? "llegó" : "llegaron"} tarde.`
              : "Llegadas registradas por reloj."
          }
          status={summary.late > 0 ? "late" : summary.present > 0 ? "in_progress" : "not_started"}
          isEmpty={summary.assigned === 0}
          emptyLabel="Sin equipo asignado"
          mode="readonly"
        />
        {summary.noShow > 0 && (
          <KpiCard
            variant="compact"
            label="No-show"
            value={summary.noShow}
            meaning="Cupos que hay que cubrir ahora."
            status="no_show"
            mode="readonly"
          />
        )}
        {claimsPending > 0 && (
          <KpiCard
            variant="compact"
            label="Solicitudes"
            value={claimsPending}
            meaning="Trabajadores esperando tu decisión."
            status="needs_review"
            action={{ label: "Decidir", icon: Inbox, onClick: () => onGoTo("claims") }}
            mode="readonly"
          />
        )}
      </div>


      {topRisks.length > 0 && (
        <div className="space-y-2">
          <SectionTitle icon={AlertTriangle} helper={HUB_COPY.issuesHelper}>
            Riesgos
          </SectionTitle>
          {topRisks.map((r) => (
            <TeamRiskCard key={r.key} risk={r} canManage={canManage} onGoTo={onGoTo} />
          ))}
          {risks.length > topRisks.length && (
            <button
              type="button"
              onClick={() => onGoTo("issues")}
              className={cn(MT.caption, "font-semibold text-primary px-1")}
            >
              Ver las {risks.length} alertas
            </button>
          )}
        </div>
      )}

      <TeamConversationCard
        reachable={Math.max(0, summary.assigned - summary.withoutPhone)}
        unreachable={summary.withoutPhone}
        onOpenChannel={onOpenChannel}
        onBroadcast={onBroadcast}
      />
    </section>
  );
}

const RISK_TARGET: Record<string, TabKey> = {
  open_spots: "recommended",
  no_show: "recommended",
  rejected: "recommended",
  unconfirmed: "assigned",
  missing_phone: "assigned",
  claims_pending: "claims",
  no_location: "issues",
};

function TeamRiskCard({
  risk, canManage, onGoTo,
}: {
  risk: TeamRisk;
  canManage: boolean;
  onGoTo: (tab: TabKey) => void;
}) {
  return (
    <InsightCard
      recommendation={risk.recommendation}
      because={risk.because}
      impact={risk.impact}
      status={
        risk.severity === "critical"
          ? "blocked"
          : risk.severity === "warning"
            ? "warning"
            : "informational"
      }
      statusLabel={
        risk.severity === "critical"
          ? "Riesgo crítico"
          : risk.severity === "warning"
            ? "Riesgo"
            : "Aviso"
      }
      mode="readonly"
      action={
        canManage && risk.actionLabel && RISK_TARGET[risk.key]
          ? { label: risk.actionLabel, onClick: () => onGoTo(RISK_TARGET[risk.key]) }
          : undefined
      }
    />
  );
}

function AssignedTab({
  assignments, sections, empById, shiftAdminId, canManage,
  onCopyPhone, onAssignmentAction, onPhoneSaved, onReplace, onOpenWorker,
}: {
  assignments: HubAssignment[];
  sections: Record<TeamSection, HubAssignment[]>;
  empById: Map<string, Employee>;
  shiftAdminId: string | null;
  canManage: boolean;
  onCopyPhone: (p: string) => void;
  onAssignmentAction: (assignmentId: string, nextStatus: AssignmentNextStatus, workerName: string) => void;
  onPhoneSaved?: () => void;
  onReplace: () => void;
  onOpenWorker: (employeeId: string) => void;
}) {
  return (
    <section aria-label={ADMIN_LEX.team} className="space-y-4">
      <SectionTitle icon={ShieldCheck} helper={HUB_COPY.assignedHelper}>
        Equipo
        <span className="ml-1.5 text-xs font-normal text-muted-foreground normal-case tracking-normal">
          ({assignments.length})
        </span>
      </SectionTitle>

      {assignments.length === 0 ? (
        <EmptyBlock title={HUB_COPY.emptyAssignedTitle} helper={HUB_COPY.emptyAssignedHelper} />
      ) : (
        TEAM_SECTION_ORDER.map((key) => {
          const list = sections[key];
          if (!list || list.length === 0) return null;
          const meta = TEAM_SECTION_META[key];
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <h4 className={cn(MT.body, "font-semibold")}>
                  {meta.label}
                  <span className="ml-1.5 text-muted-foreground tabular-nums font-normal">
                    {list.length}
                  </span>
                </h4>
              </div>
              <p className={cn(MT.caption, "text-muted-foreground px-0.5 -mt-1")}>{meta.helper}</p>
              <div className="space-y-2">
                {list.map((a) => {
                  const e = empById.get(a.employee_id);
                  const responseTs = a.accepted_at || a.rejected_at || a.responded_at || null;
                  const responseLabel = responseTs
                    ? (a.accepted_at ? "Aceptó " : a.rejected_at ? "Rechazó " : "Respondió ") + formatRelative(responseTs)
                    : null;
                  return (
                    <TeamHubWorkerCard
                      key={a.id}
                      assignment={a}
                      employee={e}
                      isCaptain={!!shiftAdminId && a.employee_id === shiftAdminId}
                      canManage={canManage}
                      responseLabel={responseLabel}
                      onAssignmentAction={onAssignmentAction}
                      onReplace={onReplace}
                      onCopyPhone={onCopyPhone}
                      onPhoneSaved={onPhoneSaved}
                      onOpenWorker={onOpenWorker}
                    />
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}


function ClaimsTab({
  loading, error, claims, empById, canManage, companyId, onClaimAction, onOpenDesktop,
  onViewWorker, onCopyReminder,
}: {
  loading: boolean;
  error: string | null;
  claims: ShiftRequestRow[];
  empById: Map<string, Employee>;
  canManage: boolean;
  companyId: string | null;
  onClaimAction: (requestId: string, decision: ClaimDecision, workerName: string, employeeId?: string) => void;
  onOpenDesktop: () => void;
  onViewWorker: (employeeId: string) => void;
  onCopyReminder: (workerName: string) => void;
}) {
  const statusMap = useStatusMap();
  return (
    <section aria-label="Solicitudes de trabajadores">
      <SectionTitle icon={Inbox} helper={HUB_COPY.claimsHelper}>
        Solicitudes
        {claims.length > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground normal-case tracking-normal">
            ({claims.length})
          </span>
        )}
      </SectionTitle>

      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-[12px] text-rose-800 dark:text-rose-300">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-5 text-center text-[12px] text-muted-foreground">
          Cargando solicitudes…
        </div>
      ) : claims.length === 0 ? (
        <EmptyBlock title={HUB_COPY.emptyClaimsTitle} helper={HUB_COPY.emptyClaimsHelper} />
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => {
            const e = empById.get(c.employee_id);
            const workerName = e ? fullName(e) : "este trabajador";
            const isPending = c.status === "pending";
            const readiness = readinessFor(e, statusMap);
            const blocked = isPending && !readiness.canBeApproved;
            const decidedLabel =
              c.status === "approved" ? "Aprobada" :
              c.status === "rejected" ? "Rechazada" : "Pendiente";
            return (
              <li key={c.id}>
                <ValidationCard
                  title={e ? fullName(e) : "Solicitud pendiente"}
                  subtitle={c.message ? `"${c.message}"` : "Solicita entrar a este turno"}
                  status={
                    c.status === "approved" ? "approved" :
                    c.status === "rejected" ? "rejected" : "needs_review"
                  }
                  statusLabel={decidedLabel}
                  evidence={[
                    { label: "Solicitó", value: c.created_at ? formatRelative(c.created_at) : "—" },
                    {
                      label: "Estado del perfil",
                      value: readiness.label,
                      attention: readiness.state !== "ready",
                    },
                    ...(c.reviewed_at
                      ? [{ label: "Revisada", value: formatRelative(c.reviewed_at) }]
                      : []),
                  ]}
                  consequence={
                    blocked
                      ? readiness.helper
                      : isPending
                        ? "Aprobar agrega a la persona al turno. No afecta nómina ni tiempo trabajado."
                        : "Esta solicitud ya fue decidida. No afecta nómina."
                  }
                  decision={{
                    label: "Aprobar",
                    icon: Check,
                    disabled: !isPending || !canManage || blocked,
                    onClick: () => onClaimAction(c.id, "approved", workerName, c.employee_id),
                    "aria-label": `Aprobar la solicitud de ${workerName}`,
                  }}
                  alternatives={
                    isPending && canManage
                      ? [
                          {
                            label: "Rechazar",
                            icon: XCircle,
                            tone: "danger" as const,
                            onClick: () => onClaimAction(c.id, "rejected", workerName, c.employee_id),
                          },
                          ...(blocked && e
                            ? [
                                {
                                  label: "Ver perfil",
                                  icon: UserCog,
                                  tone: "quiet" as const,
                                  onClick: () => onViewWorker(e.id),
                                },
                                {
                                  label: "Copiar recordatorio",
                                  icon: Copy,
                                  tone: "quiet" as const,
                                  onClick: () => onCopyReminder(workerName),
                                },
                              ]
                            : []),
                        ]
                      : undefined
                  }
                  mode="readonly"
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-3">
        <p className="text-[12px] text-muted-foreground">
          {canManage
            ? "Aprueba o rechaza arriba. Las acciones registradas no afectan nómina ni tiempo trabajado."
            : HUB_COPY.claimsManagedDesktop}
        </p>
        <button
          type="button"
          onClick={onOpenDesktop}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary"
        >
          Revisar solicitudes en escritorio <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}

function IssuesTab({
  risks, canManage, onGoTo,
}: {
  risks: TeamRisk[];
  canManage: boolean;
  onGoTo: (tab: TabKey) => void;
}) {
  return (
    <section aria-label="Alertas que requieren atención" className="space-y-2">
      <SectionTitle icon={AlertTriangle} helper={HUB_COPY.issuesHelper}>
        Alertas
        {risks.length > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground normal-case tracking-normal">
            ({risks.length})
          </span>
        )}
      </SectionTitle>
      {risks.length === 0 ? (
        <EmptyBlock title={HUB_COPY.emptyIssuesTitle} helper={HUB_COPY.emptyIssuesHelper} />
      ) : (
        risks.map((r) => (
          <TeamRiskCard key={r.key} risk={r} canManage={canManage} onGoTo={onGoTo} />
        ))
      )}
    </section>
  );
}

type RecFilter =
  | "all"
  | "best"
  | "strong_history"
  | "no_risk"
  | "ready"
  | "grace"
  | "phone"
  | "history"
  | "drivers"
  | "captains"
  | "available";

/* ─── Phase 13A: group classification (UI only, does not change ranking) ─── */
type RecGroup = "best" | "good" | "caution";

function classifyGroup(c: RankedCandidate): RecGroup {
  // Anything we can't assign or that has hard risks → caution.
  if (!c.canAssign) return "caution";
  if (c.conflictDetected) return "caution";
  if (c.riskFlags && c.riskFlags.length > 0) return "caution";
  if (c.readinessState !== "ready" && c.readinessState !== "compliance_warning") return "caution";

  // Best match: assignable, ready, no risk, strong score.
  if (c.score >= 150 && c.readinessState === "ready") return "best";

  // Good options: decent score, or grace, or has history.
  if (c.score >= 80) return "good";
  if (c.readinessState === "compliance_warning") return "good";
  if ((c.locationHistoryCount ?? 0) > 0 || (c.clientHistoryCount ?? 0) > 0) return "good";

  return "caution";
}

const GROUP_META: Record<RecGroup, { label: string; helper: string; tone: string }> = {
  best: {
    label: "Mejor opción",
    helper: "Asignables, listos, sin alertas y con buen puntaje.",
    tone: FAMILY_CLASSES.positive,
  },
  good: {
    label: "Buenas opciones",
    helper: "Candidatos sólidos con período de gracia o historial aquí.",
    tone: FAMILY_CLASSES.progress,
  },
  caution: {
    label: "Usar con precaución",
    helper: "Puntaje bajo, alertas, conflicto u otro bloqueo.",
    tone: FAMILY_CLASSES.warning,
  },
};

/* ─── Phase 13B: qualitative "Why?" reasons (no point breakdown leak) ─── */
function buildWhyReasons(c: RankedCandidate): string[] {
  const reasons = new Set(c.reasons ?? []);
  const risks = new Set(c.riskFlags ?? []);
  const lines: string[] = [];

  // Readiness
  if (c.readinessState === "ready") lines.push("Perfil listo para turnos.");
  else if (c.readinessState === "compliance_warning") lines.push("Compliance pendiente — no bloquea la asignación.");
  else lines.push("Perfil no está listo (bloqueado).");

  // Contact / availability
  if (c.phone) lines.push("Tiene teléfono registrado.");
  else lines.push("Sin teléfono registrado — no se puede contactar.");
  if (c.availabilitySignal === "available") lines.push("Marcado como disponible esta fecha.");
  else if (c.availabilitySignal === "unavailable") lines.push("Marcado como no disponible esta fecha.");

  // Venue / client history
  if ((c.locationHistoryCount ?? 0) > 0) lines.push(`Ha trabajado este lugar ${c.locationHistoryCount} ${c.locationHistoryCount === 1 ? "vez" : "veces"}.`);
  if ((c.clientHistoryCount ?? 0) > 0) lines.push(`Ha trabajado con este cliente ${c.clientHistoryCount} ${c.clientHistoryCount === 1 ? "vez" : "veces"}.`);

  // Reliability (qualitative only — no reviewer names / scores)
  if (reasons.has("high_reliability") && risks.has("low_reliability")) lines.push("Buena calificación, pero con 1 alerta de confiabilidad.");
  else if (reasons.has("high_reliability")) lines.push("Buena calificación de confiabilidad.");
  else if (risks.has("low_reliability")) lines.push("Alerta de confiabilidad.");

  // Preferences
  if (reasons.has("preferred")) lines.push("Marcado como preferido para este cliente/lugar.");
  if (reasons.has("prequalified")) lines.push("Precalificado para este cliente/lugar.");
  if (reasons.has("captain_preferred")) lines.push("Capitán preferido aquí.");
  if (reasons.has("driver_preferred")) lines.push("Conductor preferido aquí.");
  if (risks.has("blocked_here")) lines.push("Bloqueado para este cliente/lugar.");
  if (risks.has("not_recommended")) lines.push("Marcado como no recomendado aquí.");

  // Conflicts
  if (c.conflictDetected) lines.push("Tiene un turno superpuesto esta fecha.");

  // Role
  if (reasons.has("captain")) lines.push("Capitán.");
  if (reasons.has("driver")) lines.push("Conductor.");
  if (reasons.has("role_match")) lines.push("Coincide con el rol requerido.");

  return lines;
}

function RecommendedTab({
  shift, employees, assignments, companyId, onAssign, onViewWorker, onOpenDesktop,
}: {
  shift: Shift;
  employees: Employee[];
  assignments: HubAssignment[];
  companyId: string | null | undefined;
  onAssign: (employeeId: string, workerName: string) => void;
  onViewWorker: (employeeId: string) => void;
  onOpenDesktop: () => void;
}) {
  const statusMap = useStatusMap();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RecFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [signals, setSignals] = useState<RecommendationSignals>(EMPTY_SIGNALS);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [prefRefreshKey, setPrefRefreshKey] = useState(0);

  const handleSetPreference = async (
    employeeId: string,
    workerName: string,
    preferenceType: WorkerPreferenceType,
  ) => {
    if (!shift.client_id && !shift.location_id) {
      notifyWarning({
        title: "No se puede guardar la preferencia",
        fact: "Este turno no tiene cliente ni sede asignada.",
        consequence: "La preferencia no quedaría vinculada a nada.",
        key: "team-hub:pref-no-context",
      });
      return;
    }
    try {
      const { error } = await supabase.rpc("set_worker_client_preference", {
        p_employee_id: employeeId,
        p_client_id: shift.client_id ?? null,
        p_location_id: shift.client_id ? null : shift.location_id ?? null,
        p_preference_type: preferenceType,
        p_reason: null,
        p_notes: null,
      });
      if (error) throw error;
      notifySuccess({
        title: "Preferencia guardada",
        fact: `${workerName} quedó marcado para este ${shift.client_id ? "cliente" : "lugar"}.`,
        consequence: "Se tendrá en cuenta en las próximas recomendaciones.",
        key: "team-hub:pref-saved",
      });
      setPrefRefreshKey(k => k + 1);
    } catch (e: any) {
      notifyError({
        title: "No pudimos guardar la preferencia",
        fact: "El cambio no se registró.",
        consequence: "Las recomendaciones siguen igual que antes.",
        key: "team-hub:pref-save-failed",
        cause: e,
      });
    }
  };

  const handleClearPreferences = async (employeeId: string, workerName: string) => {
    const list = signals.preferencesByEmp.get(employeeId) ?? [];
    if (list.length === 0) return;
    try {
      const results = await Promise.all(
        list.map(p => supabase.rpc("archive_worker_client_preference", {
          p_preference_id: p.id,
          p_reason: null,
        })),
      );
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
      notifySuccess({
        title: "Preferencia eliminada",
        fact: `Se quitaron las preferencias de ${workerName} para este ${shift.client_id ? "cliente" : "lugar"}.`,
        consequence: "Volverá a aparecer con las reglas generales.",
        key: "team-hub:pref-cleared",
      });
      setPrefRefreshKey(k => k + 1);
    } catch (e: any) {
      notifyError({
        title: "No pudimos eliminar la preferencia",
        fact: "El cambio no se registró.",
        consequence: "La preferencia anterior sigue activa.",
        key: "team-hub:pref-clear-failed",
        cause: e,
      });
    }
  };

  // Active assignment ids (anything except rejected/removed counts as taken).
  const takenIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of assignments) {
      const st = (a.status ?? "").toLowerCase();
      if (st !== "rejected" && st !== "removed") s.add(a.employee_id);
    }
    return s;
  }, [assignments]);

  // Build the eligible base list (active + not already assigned + not hard-blocked).
  const eligible = useMemo(() => {
    return employees
      .filter(e => isAssignableWorker(e))
      .filter(e => !takenIds.has(e.id))
      .map(e => ({ e, r: readinessFor(e, statusMap) }))
      .filter(x => x.r.state !== "inactive" && x.r.state !== "needs_review");
  }, [employees, takenIds, statusMap]);

  // Batch-fetch signals once per (shift, eligible) change.
  useEffect(() => {
    let cancelled = false;
    const empIds = eligible.map(x => x.e.id);
    if (!companyId || empIds.length === 0 || !shift?.id) {
      setSignals(EMPTY_SIGNALS);
      return;
    }
    setSignalsLoading(true);

    (async () => {
      // Window: last 12 months of history.
      const since = new Date();
      since.setFullYear(since.getFullYear() - 1);
      const sinceStr = since.toISOString().slice(0, 10);

      const overrideByEmp = new Map<string, boolean>();
      const configByEmp = new Map<string, { default_available: boolean; blocked_weekdays: number[] | null }>();
      const clientHistoryByEmp = new Map<string, number>();
      const locationHistoryByEmp = new Map<string, number>();
      const reviewByEmp = new Map<string, ReviewSignal>();
      const conflictEmpIds = new Set<string>();
      const preferencesByEmp = new Map<string, WorkerPreferenceRow[]>();

      // Fire all queries in parallel; ignore individual failures gracefully.
      const queries = [
        // 1) Availability override for shift date.
        supabase
          .from("employee_availability_overrides")
          .select("employee_id, is_available")
          .eq("company_id", companyId)
          .eq("date", shift.date)
          .in("employee_id", empIds),
        // 2) Availability config (default + blocked weekdays).
        supabase
          .from("employee_availability_config")
          .select("employee_id, default_available, blocked_weekdays")
          .eq("company_id", companyId)
          .in("employee_id", empIds),
        // 3) Review stats (company-scoped reliability).
        supabase
          .from("employee_review_stats")
          .select("employee_id, avg_overall_score, no_show_flags_90d, low_score_count_30d, total_reviews")
          .eq("company_id", companyId)
          .in("employee_id", empIds),
        // 4) Client/location history — recent assignments via shift join.
        supabase
          .from("shift_assignments")
          .select("employee_id, scheduled_shifts!inner(client_id, location_id, date)")
          .eq("company_id", companyId)
          .in("employee_id", empIds)
          .neq("status", "rejected")
          .neq("status", "removed")
          .gte("scheduled_shifts.date", sinceStr)
          .lte("scheduled_shifts.date", shift.date)
          .limit(2000),
        // 5) Same-date assignments (for overlap conflict detection).
        supabase
          .from("shift_assignments")
          .select("employee_id, shift_id, scheduled_shifts!inner(date, start_time, end_time)")
          .eq("company_id", companyId)
          .in("employee_id", empIds)
          .neq("status", "rejected")
          .neq("status", "removed")
          .eq("scheduled_shifts.date", shift.date)
          .neq("shift_id", shift.id)
          .limit(1000),
        // 6) Active worker preferences for this client/location.
        (() => {
          let q = supabase
            .from("worker_client_preferences")
            .select("id, employee_id, preference_type, client_id, location_id")
            .eq("company_id", companyId)
            .in("employee_id", empIds)
            .is("archived_at", null);
          const orParts: string[] = [];
          if (shift.client_id) orParts.push(`client_id.eq.${shift.client_id}`);
          if (shift.location_id) orParts.push(`location_id.eq.${shift.location_id}`);
          if (orParts.length === 0) {
            // No client/location → no rows can match; short-circuit with impossible filter.
            return q.eq("id", "00000000-0000-0000-0000-000000000000");
          }
          return q.or(orParts.join(","));
        })(),
      ];

      const [ovRes, cfgRes, revRes, histRes, sameDayRes, prefRes] = await Promise.allSettled(queries);

      if (cancelled) return;

      if (ovRes.status === "fulfilled" && !ovRes.value.error) {
        for (const row of (ovRes.value.data ?? []) as any[]) {
          overrideByEmp.set(`${shift.date}:${row.employee_id}`, row.is_available !== false);
        }
      }
      if (cfgRes.status === "fulfilled" && !cfgRes.value.error) {
        for (const row of (cfgRes.value.data ?? []) as any[]) {
          configByEmp.set(row.employee_id, {
            default_available: row.default_available !== false,
            blocked_weekdays: Array.isArray(row.blocked_weekdays) ? row.blocked_weekdays : null,
          });
        }
      }
      if (revRes.status === "fulfilled" && !revRes.value.error) {
        for (const row of (revRes.value.data ?? []) as any[]) {
          reviewByEmp.set(row.employee_id, {
            avg_overall_score: row.avg_overall_score,
            no_show_flags_90d: row.no_show_flags_90d,
            low_score_count_30d: row.low_score_count_30d,
            total_reviews: row.total_reviews,
          });
        }
      }
      if (histRes.status === "fulfilled" && !histRes.value.error) {
        for (const row of (histRes.value.data ?? []) as any[]) {
          const ss = row.scheduled_shifts;
          if (!ss) continue;
          if (shift.client_id && ss.client_id === shift.client_id) {
            clientHistoryByEmp.set(row.employee_id, (clientHistoryByEmp.get(row.employee_id) ?? 0) + 1);
          }
          if (shift.location_id && ss.location_id === shift.location_id) {
            locationHistoryByEmp.set(row.employee_id, (locationHistoryByEmp.get(row.employee_id) ?? 0) + 1);
          }
        }
      }
      if (sameDayRes.status === "fulfilled" && !sameDayRes.value.error) {
        const toMin = (t: string | null | undefined) => {
          if (!t) return null;
          const [h, m] = t.split(":").map(Number);
          return h * 60 + (m || 0);
        };
        const sStart = toMin(shift.start_time);
        const sEndRaw = toMin(shift.end_time);
        const sEnd = sStart != null && sEndRaw != null && sEndRaw <= sStart ? sEndRaw + 24 * 60 : sEndRaw;
        for (const row of (sameDayRes.value.data ?? []) as any[]) {
          const ss = row.scheduled_shifts;
          if (!ss) continue;
          const oStart = toMin(ss.start_time);
          const oEndRaw = toMin(ss.end_time);
          if (oStart == null || oEndRaw == null || sStart == null || sEnd == null) {
            // Unknown times → treat as conflict (same date assignment).
            conflictEmpIds.add(row.employee_id);
            continue;
          }
          const oEnd = oEndRaw <= oStart ? oEndRaw + 24 * 60 : oEndRaw;
          const overlaps = oStart < sEnd && sStart < oEnd;
          if (overlaps) conflictEmpIds.add(row.employee_id);
        }
      }
      if (prefRes.status === "fulfilled" && !prefRes.value.error) {
        for (const row of (prefRes.value.data ?? []) as any[]) {
          const list = preferencesByEmp.get(row.employee_id) ?? [];
          list.push({
            id: row.id,
            preference_type: row.preference_type as WorkerPreferenceType,
            client_id: row.client_id,
            location_id: row.location_id,
          });
          preferencesByEmp.set(row.employee_id, list);
        }
      }

      setSignals({
        overrideByEmp, configByEmp, clientHistoryByEmp, locationHistoryByEmp,
        reviewByEmp, conflictEmpIds, preferencesByEmp,
      });
      setSignalsLoading(false);
    })().catch(() => {
      if (!cancelled) setSignalsLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, shift?.id, shift?.date, eligible.length, prefRefreshKey]);

  const roleNeeds = useMemo(() => inferShiftRoleNeeds(shift), [shift?.id]);

  // Rank.
  const ranked = useMemo<RankedCandidate[]>(() => {
    return eligible.map(({ e, r }) =>
      rankCandidate({
        employee: e,
        shift,
        readinessState: r.state as RankedCandidate["readinessState"],
        canBeApproved: r.canBeApproved,
        alreadyAssigned: false,
        signals,
        needsDriver: roleNeeds.needsDriver,
        needsCaptain: roleNeeds.needsCaptain,
      }),
    );
  }, [eligible, signals, shift, roleNeeds]);

  // Search + filter.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = ranked.filter(c => {
      if (filter === "best" && classifyGroup(c) !== "best") return false;
      if (filter === "strong_history" && (c.locationHistoryCount ?? 0) < 5) return false;
      if (filter === "no_risk" && ((c.riskFlags?.length ?? 0) > 0 || c.conflictDetected)) return false;
      if (filter === "ready" && c.readinessState !== "ready") return false;
      if (filter === "grace" && c.readinessState !== "compliance_warning") return false;
      if (filter === "phone" && !c.phone) return false;
      if (filter === "history" && c.clientHistoryCount === 0 && c.locationHistoryCount === 0) return false;
      if (filter === "drivers" && !c.driver) return false;
      if (filter === "captains" && !c.reasons.includes("captain")) return false;
      if (filter === "available" && c.availabilitySignal !== "available") return false;
      if (q) {
        const e = c.employee;
        const hay = `${c.name} ${c.phone} ${e.email ?? ""} ${e.employer_identification ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      const s = b.score - a.score;
      if (s !== 0) return s;
      return a.name.localeCompare(b.name);
    });
    return filtered.slice(0, 60);
  }, [ranked, search, filter]);

  // Phase 13A: split visible candidates into 3 visual groups, preserving sort.
  const grouped = useMemo(() => {
    const out: Record<RecGroup, RankedCandidate[]> = { best: [], good: [], caution: [] };
    for (const c of visible) out[classifyGroup(c)].push(c);
    return out;
  }, [visible]);

  const FILTERS: { key: RecFilter; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "best", label: "Mejor opción" },
    ...(shift.location_id ? [{ key: "strong_history" as const, label: "Historial sólido aquí" }] : []),
    { key: "no_risk", label: "Sin alertas" },
    { key: "ready", label: "Listos" },
    { key: "grace", label: "Período de gracia" },
    { key: "phone", label: "Con teléfono" },
    { key: "history", label: "Ha trabajado aquí" },
    { key: "available", label: "Disponibles" },
    { key: "drivers", label: "Conductores" },
    { key: "captains", label: "Capitanes" },
  ];

  return (
    <section aria-label="Trabajadores recomendados" className="space-y-3">
      <SectionTitle icon={Sparkles} helper="Ordenados por preparación, disponibilidad, historial, contacto y confiabilidad.">
        Agregar trabajadores
      </SectionTitle>

      {!shift.location_id && (
        <p className="text-[12px] text-muted-foreground rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 leading-snug">
          Agrega una ubicación de trabajo para usar el historial. El punto de encuentro no cuenta como lugar trabajado.
        </p>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono, email o ID…"
          className="pl-9 h-10 text-sm"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={cn(
              "h-7 rounded-full px-2.5 text-[12px] font-semibold border",
              filter === c.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/40 text-muted-foreground border-border/50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {signalsLoading && (
        <p className="text-[12px] text-muted-foreground px-1">Afinando recomendaciones…</p>
      )}

      {(() => {
        // Phase 13D: smarter empty states.
        if (visible.length > 0) return null;
        const hasSearch = search.trim().length > 0;
        const hasFilter = filter !== "all";
        if (ranked.length === 0) {
          return (
            <EmptyBlock
              title="Sin candidatos"
              helper="Todos los elegibles ya están asignados o bloqueados por filtros."
            />
          );
        }
        if (hasSearch) {
          return (
            <EmptyBlock
              title="Ningún trabajador coincide con la búsqueda"
              helper="Prueba otro nombre, teléfono, email o ID."
            />
          );
        }
        if (hasFilter) {
          return (
            <EmptyBlock
              title="Ningún trabajador coincide con el filtro"
              helper="Prueba 'Mejor opción' o quita el filtro."
            />
          );
        }
        return (
          <EmptyBlock
            title="Sin coincidencias"
            helper="Los trabajadores ya asignados a este turno están ocultos."
          />
        );
      })()}

      {visible.length > 0 && (
        <div className="space-y-4">
          {(["best", "good", "caution"] as RecGroup[]).map(g => {
            const list = grouped[g];
            if (list.length === 0) return null;
            const meta = GROUP_META[g];
            return (
              <div key={g} className="space-y-2">
                <div className="flex items-center gap-2 px-0.5">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider", meta.tone)}>
                    {meta.label}
                  </span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">{list.length}</span>
                </div>
                <p className="text-[12px] text-muted-foreground px-1 leading-snug">{meta.helper}</p>
                <ul className="space-y-2">
                  {list.map((c) => {
            const display = buildRecommendedDisplay(c);
            const isExpanded = expanded.has(c.employee.id);
            const whyLines = isExpanded ? buildWhyReasons(c) : [];
            const visibleChips = (isExpanded ? display.chips : display.chips.slice(0, 3)).map(ch => ({
              key: ch.key,
              label: ch.label,
              tone: ch.tone === "good" ? "good" as const : ch.tone === "risk" ? "risk" as const : "muted" as const,
            }));
            if (!isExpanded && display.chips.length > 3) {
              visibleChips.push({ key: "more", label: `+${display.chips.length - 3}`, tone: "muted" as const });
            }
            return (
              <li key={c.employee.id}>
                <AssignWorkerCard
                  candidate={c}
                  chips={visibleChips}
                  recommendation={display.summary || undefined}
                  onAssign={onAssign}
                  onViewProfile={onViewWorker}
                  onContact={c.phone ? () => {
                    window.open(`https://wa.me/${c.phone.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer");
                  } : undefined}
                  aside={(shift.client_id || shift.location_id) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="h-7 px-2 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-muted/60 inline-flex items-center gap-0.5"
                          aria-label={`Marcar afinidad para ${c.name}`}
                        >
                          <MoreVertical className="h-3 w-3" /> Afinidad
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Marcar para este {shift.client_id ? "cliente" : "lugar"}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "preferred")}>
                          Marcar como preferido
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "prequalified")}>
                          Marcar como precalificado
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "captain_preferred")}>
                          Capitán preferido
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "driver_preferred")}>
                          Conductor preferido
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "not_recommended")}>
                          Marcar no recomendado
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-status-danger focus:text-status-danger"
                          onClick={() => handleSetPreference(c.employee.id, c.name, "blocked")}
                        >
                          Bloquear aquí
                        </DropdownMenuItem>
                        {(signals.preferencesByEmp.get(c.employee.id) ?? []).length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleClearPreferences(c.employee.id, c.name)}>
                              Limpiar preferencias
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : undefined}
                  footer={
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(c.employee.id)}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? "Ocultar" : "¿Por qué?"}
                      </button>
                      {isExpanded && whyLines.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 rounded-lg bg-muted/30 px-2 py-1.5">
                          {whyLines.map((w, i) => (
                            <li key={i} className="text-[12px] text-foreground/80 leading-snug">• {w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  }
                />
              </li>
            );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onOpenDesktop}
        className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary"
      >
        Abrir herramientas de escritorio <ExternalLink className="h-3 w-3" />
      </button>
    </section>
  );
}

/* ─── Local presentational helpers ─── */

function SectionTitle({
  icon: Icon, helper, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 px-0.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {children}
        </h3>
      </div>
      {helper ? (
        <p className="mt-1 text-[12px] text-muted-foreground leading-snug">{helper}</p>
      ) : null}
    </div>
  );
}

function EmptyBlock({ title, helper }: { title: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{helper}</p>
    </div>
  );
}
