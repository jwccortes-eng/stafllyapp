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

import { memo, useEffect, useMemo, useState } from "react";
import {
  X, Users, ShieldCheck, Clock, ExternalLink, Inbox,
  CheckCircle2, AlertCircle, UserMinus, UserX, Phone, MessageSquare,
  Copy, AlertTriangle, Sparkles, Star, MapPin, Briefcase,
  MoreVertical, Check, XCircle, UserCog, Search, UserPlus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone, buildWhatsAppTargets } from "@/lib/phone";
import { useToast } from "@/hooks/use-toast";
import { allowedNextStatusesFor, type AssignmentNextStatus, type ClaimDecision } from "@/lib/shifts/team-actions";
import { MobileTeamActionDialog } from "@/components/shifts/mobile/MobileTeamActionDialog";
import { isOnboardingComplete } from "@/lib/onboarding";
import { isGraceEligibleCompany, isWithinGraceWindow, GRACE_POLICY_DAYS } from "@/lib/shifts/readiness-grace";
import { formatDistanceToNowStrict } from "date-fns";
import {
  rankCandidate, inferShiftRoleNeeds, EMPTY_SIGNALS,
  type RecommendationSignals, type ReviewSignal, type RankedCandidate,
  type WorkerPreferenceRow, type WorkerPreferenceType,
} from "@/lib/shifts/worker-recommendation";

function formatRelative(iso: string): string {
  try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true }); }
  catch { return ""; }
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
  if (riskSet.has("blocked_here")) candidates.push({ key: "blocked_here", label: "Blocked here", tone: "risk" });
  if (riskSet.has("not_recommended")) candidates.push({ key: "not_recommended", label: "Not recommended", tone: "risk" });
  if (reasonSet.has("preferred")) candidates.push({ key: "preferred", label: "Preferred", tone: "good" });
  if (reasonSet.has("prequalified")) candidates.push({ key: "prequalified", label: "Prequalified", tone: "good" });
  if (reasonSet.has("captain_preferred")) candidates.push({ key: "captain_preferred", label: "Captain preferred", tone: "good" });
  if (reasonSet.has("driver_preferred")) candidates.push({ key: "driver_preferred", label: "Driver preferred", tone: "good" });

  // 2. Conflict / availability
  if (riskSet.has("conflict")) candidates.push({ key: "conflict", label: "Conflict", tone: "risk" });
  if (riskSet.has("unavailable")) candidates.push({ key: "unavailable", label: "Unavailable", tone: "risk" });

  // 3. Readiness
  if (reasonSet.has("ready")) candidates.push({ key: "ready", label: "Ready", tone: "good" });
  else if (reasonSet.has("grace_period")) candidates.push({ key: "grace_period", label: "Grace period", tone: "good" });

  // 4. Venue / client history (count-aware)
  if (c.locationHistoryCount > 0) {
    candidates.push({ key: "worked_location", label: `Worked here ${c.locationHistoryCount}x`, tone: "good" });
  }
  if (c.clientHistoryCount > 0) {
    candidates.push({ key: "worked_client", label: `Worked client ${c.clientHistoryCount}x`, tone: "good" });
  }

  // 5. Reliability (collision-aware)
  if (hasGoodRating && hasRatingRisk) {
    candidates.push({ key: "good_rating", label: "Good rating", tone: "good" });
    candidates.push({ key: "risk_flag", label: "1 risk flag", tone: "risk" });
  } else if (hasGoodRating) {
    candidates.push({ key: "high_reliability", label: "High reliability", tone: "good" });
  } else if (hasRatingRisk) {
    candidates.push({ key: "low_reliability", label: "Reliability risk", tone: "risk" });
  }

  // 6. Role / driver / captain (lowest priority)
  if (reasonSet.has("captain")) candidates.push({ key: "captain", label: "Captain", tone: "good" });
  if (reasonSet.has("driver")) candidates.push({ key: "driver", label: "Driver", tone: "good" });
  if (reasonSet.has("role_match")) candidates.push({ key: "role_match", label: "Role match", tone: "good" });

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
    reasonSet.has("preferred") ? "Preferred worker"
    : reasonSet.has("prequalified") ? "Prequalified"
    : c.locationHistoryCount >= 5 ? `Strong fit: worked here ${c.locationHistoryCount} times`
    : c.locationHistoryCount > 0 ? `Worked here ${c.locationHistoryCount}x`
    : c.clientHistoryCount > 0 ? `Worked client ${c.clientHistoryCount}x`
    : null;
  if (lead) parts.push(lead);
  if (hasGoodRating && !hasRatingRisk) parts.push("high reliability");
  else if (hasGoodRating && hasRatingRisk) parts.push("good rating · 1 risk flag");

  const summary = parts.length > 0 ? parts.join(" · ") : null;
  return { chips, summary };
}

/* ─── Worker readiness (read-only, mirrors backend EMPLOYEE_NOT_READY guard) ─── */

type ReadinessState =
  | "ready" | "grace_period"
  | "incomplete_blocked" | "pending_documents_blocked"
  | "onboarding_pending" | "missing_phone"
  | "inactive" | "unknown";

interface Readiness {
  state: ReadinessState;
  canBeApproved: boolean;
  label: string;
  helper: string;
}

const GRACE_HELPER = `Worker can be approved during the ${GRACE_POLICY_DAYS}-day grace period. Profile still needs completion.`;

function computeReadiness(e: Employee | undefined, companyId?: string | null): Readiness {
  if (!e) return { state: "unknown", canBeApproved: false, label: "Needs review", helper: "Worker record not loaded." };
  if (e.is_active === false) return { state: "inactive", canBeApproved: false, label: "Inactive", helper: "Reactivate the worker before approving." };

  const profileIncomplete = e.profile_status === "incomplete" || e.profile_status === "pending_documents";
  const inGrace = profileIncomplete && isGraceEligibleCompany(companyId) && isWithinGraceWindow();

  if (e.profile_status === "incomplete") {
    if (inGrace) return { state: "grace_period", canBeApproved: true, label: "Profile incomplete · grace period", helper: GRACE_HELPER };
    return { state: "incomplete_blocked", canBeApproved: false, label: "Profile incomplete · blocked", helper: "Complete worker profile before approving this claim." };
  }
  if (e.profile_status === "pending_documents") {
    if (inGrace) return { state: "grace_period", canBeApproved: true, label: "Missing documents · grace period", helper: GRACE_HELPER };
    return { state: "pending_documents_blocked", canBeApproved: false, label: "Missing documents · blocked", helper: "Worker needs to upload required documents." };
  }
  if (!normalizePhone(e.phone_number)) {
    // Soft warning — backend doesn't block on phone alone, but operators need contact info.
    return { state: "missing_phone", canBeApproved: true, label: "Missing phone", helper: "Add a phone number — workers can't be contacted without it." };
  }
  if (e.onboarding_status && !isOnboardingComplete(e.onboarding_status) && e.profile_status !== "active") {
    // Soft warning — backend allows ready/active to confirm regardless of onboarding text.
    return { state: "onboarding_pending", canBeApproved: true, label: "Onboarding pending", helper: "Worker hasn't finished onboarding yet." };
  }
  return { state: "ready", canBeApproved: true, label: "Ready", helper: "Worker is ready for shifts." };
}

const READINESS_TONE: Record<ReadinessState, "good" | "info" | "warn" | "bad" | "muted"> = {
  ready: "good",
  grace_period: "warn",
  incomplete_blocked: "bad",
  pending_documents_blocked: "bad",
  onboarding_pending: "warn",
  missing_phone: "warn",
  inactive: "bad",
  unknown: "muted",
};

function ReadinessChip({ readiness, className }: { readiness: Readiness; className?: string }) {
  if (readiness.state === "ready") return null;
  return (
    <Badge
      variant="outline"
      className={cn("h-[18px] px-1.5 text-[10px] font-semibold whitespace-nowrap inline-flex items-center", toneToClass(READINESS_TONE[readiness.state]), className)}
      title={readiness.helper}
    >
      <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
      {readiness.label}
    </Badge>
  );
}

function buildReminderText(workerName: string): string {
  return `Hi ${workerName}, please finish your worker profile in the Stafly portal so we can confirm your shifts. Thanks!`;
}

const HUB_COPY = {
  intro: "Read-only team view. Staffing changes still happen on desktop.",
  safetyNote: "Staffing changes are available from desktop for now. This mobile view is read-only.",
  loadError: "Couldn't load team data. Check your connection and try again.",
  tabsAria: "Team management sections",
  // Overview
  overviewHelper: "Live snapshot of staffing for this shift.",
  // Assigned
  assignedHelper: "Grouped by lifecycle status. Tap to contact workers.",
  emptyAssignedTitle: "No workers assigned yet",
  emptyAssignedHelper: "Use desktop staffing tools to add workers.",
  noPhone: "No phone on file",
  // Claims
  claimsHelper: "Workers who claimed or requested this shift.",
  claimsManagedDesktop: "Approving claims is still done on desktop.",
  emptyClaimsTitle: "No open requests",
  emptyClaimsHelper: "Worker claims for this shift will show here.",
  // Issues
  issuesHelper: "Items that may need attention before the shift starts.",
  emptyIssuesTitle: "No issues detected",
  emptyIssuesHelper: "Coverage looks healthy and worker contact data is complete.",
  // Recommended
  recommendedHelper: "Smart recommendations are coming in a later phase.",
  recommendedPlaceholder:
    "Recommended workers will combine availability, rating, role fit, and history. Available in a later phase.",
  openDesktopStaffing: "Open desktop staffing tools",
  permissionGate: "You don't have permission to manage this shift.",
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
  /** scheduled_shifts.shift_admin_id, used for Captain badge. */
  shiftAdminId?: string | null;
  /** Tenant the shift/employees belong to (drives the grace-period decision). */
  companyId?: string | null;
  /** Optional callback so the parent sheet can refetch after a safe mutation. */
  onMutated?: () => void;
}

type Bucket =
  | "confirmed"
  | "accepted"
  | "pending"
  | "rejected_by_worker"
  | "removed"
  | "no_show"
  | "other";

function bucketize(a: HubAssignment): Bucket {
  // Attendance signal takes precedence for past/in-progress shifts.
  if (a.attendance_status === "absent") return "no_show";
  if (a.status === "removed") return "removed";
  if (a.response_status === "rejected" || a.status === "rejected") return "rejected_by_worker";
  if (a.status === "confirmed") return "confirmed";
  if (a.status === "accepted") return "accepted";
  if (a.status === "pending" || a.response_status === "pending") return "pending";
  return "other";
}

const BUCKET_META: Record<Bucket, {
  label: string; icon: React.ComponentType<{ className?: string }>;
  tone: "good" | "info" | "warn" | "muted" | "bad";
}> = {
  confirmed: { label: "Confirmed", icon: ShieldCheck, tone: "good" },
  accepted: { label: "Accepted", icon: CheckCircle2, tone: "info" },
  pending: { label: "Pending", icon: Clock, tone: "warn" },
  rejected_by_worker: { label: "Rejected", icon: UserX, tone: "bad" },
  removed: { label: "Removed", icon: UserMinus, tone: "muted" },
  no_show: { label: "No-show / Absent", icon: AlertTriangle, tone: "bad" },
  other: { label: "Other", icon: AlertCircle, tone: "muted" },
};

function toneToClass(tone: "good" | "info" | "warn" | "muted" | "bad"): string {
  switch (tone) {
    case "good": return "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10";
    case "info": return "border-sky-500/40 text-sky-700 dark:text-sky-400 bg-sky-500/10";
    case "warn": return "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10";
    case "bad": return "border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10";
    default: return "border-border/60 text-muted-foreground bg-muted/40";
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
  clientName, locationName, shiftAdminId, companyId, onMutated,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
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

  const openAssignmentAction = (assignmentId: string, nextStatus: AssignmentNextStatus, workerName: string) => {
    setActionMode({ kind: "assignment_state", assignmentId, nextStatus, workerName });
    setActionDialogOpen(true);
  };
  const openClaimAction = (requestId: string, decision: ClaimDecision, workerName: string, employeeId?: string) => {
    if (decision === "approved" && employeeId) {
      const r = computeReadiness(empById.get(employeeId), companyId);
      if (!r.canBeApproved) {
        toast({
          title: "Worker not ready to be approved",
          description: r.helper,
          variant: "destructive",
        });
        return;
      }
    }
    setActionMode({ kind: "claim_decision", requestId, decision, workerName });
    setActionDialogOpen(true);
  };
  const openAssignWorkerAction = (employeeId: string, workerName: string) => {
    const r = computeReadiness(empById.get(employeeId), companyId);
    if (!r.canBeApproved) {
      toast({
        title: "Worker not ready to be assigned",
        description: r.helper,
        variant: "destructive",
      });
      return;
    }
    setActionMode({
      kind: "assign_worker",
      shiftId: shift.id,
      employeeId,
      workerName,
      graceWarning: r.state === "grace_period" ? r.helper : null,
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

  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const grouped = useMemo(() => {
    const buckets: Record<Bucket, HubAssignment[]> = {
      confirmed: [], accepted: [], pending: [],
      rejected_by_worker: [], removed: [], no_show: [], other: [],
    };
    for (const a of assignments) buckets[bucketize(a)].push(a);
    return buckets;
  }, [assignments]);

  const slots = shift.slots ?? 0;
  // Staffed = anything not rejected/removed (matches assignment-coverage).
  const staffedCount =
    grouped.confirmed.length + grouped.accepted.length + grouped.pending.length + grouped.no_show.length + grouped.other.length;
  const openSpots = Math.max(slots - staffedCount, 0);
  const claimsPending = claims.filter(c => c.status === "pending").length;

  // ── Issues derived from already-loaded data only.
  const issues = useMemo(() => {
    const items: Array<{ key: string; tone: "warn" | "bad" | "info"; icon: React.ComponentType<{ className?: string }>; title: string; helper?: string }> = [];
    if (openSpots > 0) {
      items.push({
        key: "open-spots",
        tone: "warn", icon: Users,
        title: `${openSpots} open ${openSpots === 1 ? "spot" : "spots"}`,
        helper: "Staff this shift to reach required coverage.",
      });
    }
    if (grouped.no_show.length > 0) {
      items.push({
        key: "no-show",
        tone: "bad", icon: AlertTriangle,
        title: `${grouped.no_show.length} marked absent / no-show`,
      });
    }
    if (grouped.pending.length > 0) {
      items.push({
        key: "pending",
        tone: "warn", icon: Clock,
        title: `${grouped.pending.length} pending ${grouped.pending.length === 1 ? "response" : "responses"}`,
        helper: "Workers haven't accepted yet.",
      });
    }
    if (grouped.rejected_by_worker.length > 0) {
      items.push({
        key: "rejected",
        tone: "bad", icon: UserX,
        title: `${grouped.rejected_by_worker.length} rejected`,
      });
    }
    // Missing phone on staffed workers.
    const staffed = [
      ...grouped.confirmed, ...grouped.accepted, ...grouped.pending, ...grouped.no_show,
    ];
    const missingPhone = staffed.filter(a => !normalizePhone(empById.get(a.employee_id)?.phone_number));
    if (missingPhone.length > 0) {
      items.push({
        key: "missing-phone",
        tone: "warn", icon: Phone,
        title: `${missingPhone.length} worker${missingPhone.length === 1 ? "" : "s"} without phone`,
        helper: "Contact actions won't be available for these workers.",
      });
    }
    if (!shift.location_id) {
      items.push({
        key: "no-location",
        tone: "warn", icon: MapPin,
        title: "No location set",
        helper: "Workers won't know where to go.",
      });
    }
    if (!shift.client_id) {
      items.push({
        key: "no-client",
        tone: "info", icon: Briefcase,
        title: "No client linked",
      });
    }
    if (claimsPending > 0) {
      items.push({
        key: "claims",
        tone: "info", icon: Inbox,
        title: `${claimsPending} pending claim${claimsPending === 1 ? "" : "s"}`,
        helper: "Review on desktop to approve or reject.",
      });
    }
    return items;
  }, [grouped, openSpots, empById, shift.location_id, shift.client_id, claimsPending]);

  const order: Bucket[] = [
    "confirmed", "accepted", "pending",
    "no_show", "rejected_by_worker", "removed", "other",
  ];

  const TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "assigned", label: "Assigned", badge: assignments.length || undefined },
    { key: "claims", label: "Claims", badge: claimsPending || undefined },
    { key: "issues", label: "Issues", badge: issues.length || undefined },
    { key: "recommended", label: "Recommended" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="h-[92vh] p-0 rounded-t-3xl flex flex-col overflow-hidden bg-background"
      >
        {/* Sticky header */}
        <div className="px-5 pt-3 pb-2 border-b border-border/40 bg-background/95 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Team management
                </span>
                {shift.shift_code && (
                  <span className="text-[10px] font-mono font-semibold text-muted-foreground/80">
                    #{formatShiftCode(shift.shift_code)}
                  </span>
                )}
                {shift.publication_status && shift.publication_status !== "published" && (
                  <Badge variant="outline" className="h-[18px] px-1.5 text-[9px] uppercase tracking-wider">
                    {shift.publication_status}
                  </Badge>
                )}
              </div>
              <h2 className="text-lg font-semibold tracking-tight leading-tight line-clamp-2">
                {clientName && clientName !== "—" ? clientName : (shift.title || "Shift")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {locationName || "No location"} · {shift.date} · {shift.start_time}–{shift.end_time}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {staffedCount}/{slots || "—"} staffed · {openSpots} open
              </p>
            </div>
            <Button
              variant="ghost" size="sm"
              className="h-9 px-2 rounded-full shrink-0 -mt-1 -mr-1 text-xs gap-1"
              onClick={() => onOpenChange(false)}
              aria-label="Back to shift overview"
            >
              <X className="h-4 w-4" />
              Back
            </Button>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label={HUB_COPY.tabsAria}
            className="mt-2.5 -mx-1 flex gap-1 overflow-x-auto scrollbar-hide"
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
                    "shrink-0 px-3 h-8 rounded-full text-[12px] font-semibold transition-colors flex items-center gap-1.5",
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t.label}
                  {typeof t.badge === "number" && t.badge > 0 && (
                    <span className={cn(
                      "min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums",
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
              slots={slots}
              staffedCount={staffedCount}
              openSpots={openSpots}
              grouped={grouped}
              claimsPending={claimsPending}
            />
          )}

          {tab === "assigned" && (
            <AssignedTab
              assignments={assignments}
              grouped={grouped}
              order={order}
              empById={empById}
              shiftAdminId={shiftAdminId ?? null}
              canManage={canManage}
              companyId={companyId ?? null}
              onCopyPhone={(p) => {
                navigator.clipboard?.writeText(p).catch(() => {});
                toast({ title: "Phone copied" });
              }}
              onAssignmentAction={openAssignmentAction}
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
                toast({ title: "Reminder copied", description: "Paste into WhatsApp or SMS." });
              }}
            />
          )}

          {tab === "issues" && (
            <IssuesTab issues={issues} />
          )}

          {tab === "recommended" && (
            <RecommendedTab
              shift={shift}
              employees={employees}
              assignments={assignments}
              companyId={companyId}
              onAssign={openAssignWorkerAction}
              onOpenDesktop={() => {
                onOpenChange(false);
                navigate("/app/shifts");
              }}
            />
          )}

          <p className="px-0.5 pt-1 text-[11px] text-muted-foreground leading-snug">
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
      </SheetContent>
    </Sheet>
  );
}

export const MobileShiftTeamHub = memo(MobileShiftTeamHubImpl);

/* ─── Tabs ─── */

function OverviewTab({
  slots, staffedCount, openSpots, grouped, claimsPending,
}: {
  slots: number;
  staffedCount: number;
  openSpots: number;
  grouped: Record<Bucket, HubAssignment[]>;
  claimsPending: number;
}) {
  return (
    <section aria-label="Operational overview">
      <SectionTitle icon={Users} helper={HUB_COPY.overviewHelper}>
        Overview
      </SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Required" value={slots || "—"} />
        <StatTile label="Staffed" value={staffedCount} />
        <StatTile label="Open" value={openSpots} accent={openSpots > 0 ? "warn" : "good"} />
        <StatTile label="Confirmed" value={grouped.confirmed.length} accent="good" />
        <StatTile label="Accepted" value={grouped.accepted.length} accent="info" />
        <StatTile label="Pending" value={grouped.pending.length} accent="warn" />
        <StatTile label="Rejected" value={grouped.rejected_by_worker.length} accent={grouped.rejected_by_worker.length ? "bad" : "muted"} />
        <StatTile label="Removed" value={grouped.removed.length} />
        <StatTile label="No-show" value={grouped.no_show.length} accent={grouped.no_show.length ? "bad" : "muted"} />
        <StatTile label="Claims" value={claimsPending} accent={claimsPending ? "info" : "muted"} />
      </div>
    </section>
  );
}

function AssignedTab({
  assignments, grouped, order, empById, shiftAdminId, canManage, companyId, onCopyPhone, onAssignmentAction,
}: {
  assignments: HubAssignment[];
  grouped: Record<Bucket, HubAssignment[]>;
  order: Bucket[];
  empById: Map<string, Employee>;
  shiftAdminId: string | null;
  canManage: boolean;
  companyId: string | null;
  onCopyPhone: (p: string) => void;
  onAssignmentAction: (assignmentId: string, nextStatus: AssignmentNextStatus, workerName: string) => void;
}) {
  return (
    <section aria-label="Assigned workers">
      <SectionTitle icon={ShieldCheck} helper={HUB_COPY.assignedHelper}>
        Assigned workers
        <span className="ml-1.5 text-xs font-normal text-muted-foreground normal-case tracking-normal">
          ({assignments.length})
        </span>
      </SectionTitle>

      {assignments.length === 0 ? (
        <EmptyBlock title={HUB_COPY.emptyAssignedTitle} helper={HUB_COPY.emptyAssignedHelper} />
      ) : (
        <div className="space-y-3">
          {order.map((b) => {
            const list = grouped[b];
            if (!list || list.length === 0) return null;
            const meta = BUCKET_META[b];
            const Icon = meta.icon;
            return (
              <div key={b} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {meta.label}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("h-[20px] px-1.5 text-[10px] font-semibold", toneToClass(meta.tone))}
                  >
                    {list.length}
                  </Badge>
                </div>
                <ul className="divide-y divide-border/30">
                  {list.map((a) => (
                    <WorkerRow
                      key={a.id}
                      assignment={a}
                      employee={empById.get(a.employee_id)}
                      isCaptain={!!shiftAdminId && a.employee_id === shiftAdminId}
                      canManage={canManage}
                      companyId={companyId}
                      onCopyPhone={onCopyPhone}
                      onAssignmentAction={onAssignmentAction}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const ASSIGN_ACTION_LABEL: Record<AssignmentNextStatus, string> = {
  confirmed: "Confirm",
  rejected: "Mark rejected",
  removed: "Remove from shift",
};
const ASSIGN_ACTION_ICON: Record<AssignmentNextStatus, React.ComponentType<{ className?: string }>> = {
  confirmed: Check,
  rejected: XCircle,
  removed: UserMinus,
};

function WorkerRow({
  assignment, employee, isCaptain, canManage, companyId, onCopyPhone, onAssignmentAction,
}: {
  assignment: HubAssignment;
  employee: Employee | undefined;
  isCaptain: boolean;
  canManage: boolean;
  companyId: string | null;
  onCopyPhone: (p: string) => void;
  onAssignmentAction: (assignmentId: string, nextStatus: AssignmentNextStatus, workerName: string) => void;
}) {
  const name = fullName(employee);
  const phoneDigits = normalizePhone(employee?.phone_number);
  const hasPhone = phoneDigits.length >= 10;
  const wa = hasPhone ? buildWhatsAppTargets(phoneDigits, "") : null;
  const allowedActions = allowedNextStatusesFor(assignment.status);
  const showMenu = canManage && allowedActions.length > 0;
  const readiness = computeReadiness(employee, companyId);

  const subBits: string[] = [];
  if (assignment.assignment_role) subBits.push(assignment.assignment_role);
  if (assignment.attendance_status && assignment.attendance_status !== "pending") {
    subBits.push(assignment.attendance_status);
  }
  const responseTs = assignment.accepted_at || assignment.rejected_at || assignment.responded_at || null;
  const responseLabel = responseTs
    ? (assignment.accepted_at ? "Accepted " : assignment.rejected_at ? "Rejected " : "Responded ") + formatRelative(responseTs)
    : null;

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar className="h-9 w-9 shrink-0">
          {employee?.avatar_url ? <AvatarImage src={employee.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-[10px] font-semibold">
            {initialsOf(employee)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold leading-tight truncate">{name}</p>
            {isCaptain && (
              <Badge
                variant="outline"
                className="h-[16px] px-1 text-[9px] uppercase tracking-wider border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10"
              >
                <Star className="h-2.5 w-2.5 mr-0.5" />
                Captain
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {subBits.length ? subBits.join(" · ") : "—"}
          </p>
          {responseLabel && (
            <p className={cn(
              "text-[10px] mt-0.5 font-medium",
              assignment.accepted_at ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            )}>
              {responseLabel}
            </p>
          )}
          {readiness.state !== "ready" && readiness.state !== "missing_phone" && (
            <div className="mt-0.5"><ReadinessChip readiness={readiness} /></div>
          )}
          {!hasPhone && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">{HUB_COPY.noPhone}</p>
          )}
        </div>

        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={`Change status for ${name}`}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Logged action
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allowedActions.map((next) => {
                const Icon = ASSIGN_ACTION_ICON[next];
                return (
                  <DropdownMenuItem
                    key={next}
                    onClick={() => onAssignmentAction(assignment.id, next, name)}
                    className={next === "removed" || next === "rejected" ? "text-destructive focus:text-destructive" : undefined}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {ASSIGN_ACTION_LABEL[next]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {hasPhone && (
        <div className="mt-2 flex items-center gap-1.5">
          <ContactBtn href={`tel:${phoneDigits}`} icon={Phone} label="Call" />
          <ContactBtn href={`sms:${phoneDigits}`} icon={MessageSquare} label="SMS" />
          {wa?.waMeUrl && (
            <ContactBtn href={wa.waMeUrl} icon={MessageSquare} label="WhatsApp" external />
          )}
          <button
            type="button"
            onClick={() => onCopyPhone(phoneDigits)}
            className="ml-auto h-7 w-7 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Copy phone number"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

function ContactBtn({
  href, icon: Icon, label, external,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-muted/60 hover:bg-muted text-[11px] font-medium text-foreground"
      aria-label={label}
    >
      <Icon className="h-3 w-3" />
      {label}
    </a>
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
  return (
    <section aria-label="Worker claims and requests">
      <SectionTitle icon={Inbox} helper={HUB_COPY.claimsHelper}>
        Claims
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
          Loading claims…
        </div>
      ) : claims.length === 0 ? (
        <EmptyBlock title={HUB_COPY.emptyClaimsTitle} helper={HUB_COPY.emptyClaimsHelper} />
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => {
            const e = empById.get(c.employee_id);
            const workerName = e ? fullName(e) : "this worker";
            const tone =
              c.status === "approved" ? "good" :
              c.status === "rejected" ? "bad" : "warn";
            const isPending = c.status === "pending";
            const readiness = computeReadiness(e, companyId);
            const blocked = isPending && !readiness.canBeApproved;
            return (
              <li key={c.id} className="rounded-2xl border border-border/50 bg-card p-3">
                <div className="flex items-start gap-2.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    {e?.avatar_url ? <AvatarImage src={e.avatar_url} alt="" /> : null}
                    <AvatarFallback className="text-[10px] font-semibold">
                      {initialsOf(e)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight truncate">
                        {e ? fullName(e) : "Claim request pending"}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn("h-[18px] px-1.5 text-[10px] font-semibold capitalize", toneToClass(tone))}
                      >
                        {c.status}
                      </Badge>
                    </div>
                    {readiness.state !== "ready" && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <ReadinessChip readiness={readiness} />
                      </div>
                    )}
                    {c.message && (
                      <p className="mt-1 text-[12px] text-muted-foreground line-clamp-3">
                        "{c.message}"
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                      {c.reviewed_at ? ` · reviewed ${new Date(c.reviewed_at).toLocaleString()}` : ""}
                    </p>

                    {blocked && (
                      <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                        {readiness.helper}
                      </p>
                    )}

                    {isPending && canManage && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => onClaimAction(c.id, "approved", workerName, c.employee_id)}
                          aria-disabled={blocked}
                          title={blocked ? readiness.helper : undefined}
                          className={cn(
                            "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold transition-colors",
                            blocked
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-emerald-600 text-white hover:bg-emerald-700",
                          )}
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onClaimAction(c.id, "rejected", workerName, c.employee_id)}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-muted hover:bg-muted/80 text-foreground text-[11px] font-semibold transition-colors"
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </button>
                        {blocked && e && (
                          <>
                            <button
                              type="button"
                              onClick={() => onViewWorker(e.id)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-muted/60 hover:bg-muted text-foreground text-[11px] font-semibold transition-colors"
                            >
                              <UserCog className="h-3 w-3" />
                              View profile
                            </button>
                            <button
                              type="button"
                              onClick={() => onCopyReminder(workerName)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-muted/60 hover:bg-muted text-foreground text-[11px] font-semibold transition-colors"
                            >
                              <Copy className="h-3 w-3" />
                              Copy reminder
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-3">
        <p className="text-[12px] text-muted-foreground">
          {canManage
            ? "Approve or reject above. Logged actions don't affect payroll or worked time."
            : HUB_COPY.claimsManagedDesktop}
        </p>
        <button
          type="button"
          onClick={onOpenDesktop}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary"
        >
          Review claims on desktop <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}

function IssuesTab({
  issues,
}: {
  issues: Array<{ key: string; tone: "warn" | "bad" | "info"; icon: React.ComponentType<{ className?: string }>; title: string; helper?: string }>;
}) {
  return (
    <section aria-label="Issues that need attention">
      <SectionTitle icon={AlertTriangle} helper={HUB_COPY.issuesHelper}>
        Issues
        {issues.length > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground normal-case tracking-normal">
            ({issues.length})
          </span>
        )}
      </SectionTitle>
      {issues.length === 0 ? (
        <EmptyBlock title={HUB_COPY.emptyIssuesTitle} helper={HUB_COPY.emptyIssuesHelper} />
      ) : (
        <ul className="space-y-2">
          {issues.map((i) => {
            const Icon = i.icon;
            return (
              <li
                key={i.key}
                className={cn(
                  "rounded-2xl border px-3 py-2.5 flex items-start gap-2.5",
                  toneToClass(i.tone),
                )}
              >
                <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-tight">{i.title}</p>
                  {i.helper && (
                    <p className="mt-0.5 text-[11px] opacity-80 leading-snug">{i.helper}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type RecFilter =
  | "best"
  | "ready"
  | "grace"
  | "phone"
  | "history"
  | "drivers"
  | "captains"
  | "available";

function RecommendedTab({
  shift, employees, assignments, companyId, onAssign, onOpenDesktop,
}: {
  shift: Shift;
  employees: Employee[];
  assignments: HubAssignment[];
  companyId: string | null | undefined;
  onAssign: (employeeId: string, workerName: string) => void;
  onOpenDesktop: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RecFilter>("best");
  const [signals, setSignals] = useState<RecommendationSignals>(EMPTY_SIGNALS);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [prefRefreshKey, setPrefRefreshKey] = useState(0);
  const { toast: hubToast } = useToast();

  const handleSetPreference = async (
    employeeId: string,
    workerName: string,
    preferenceType: WorkerPreferenceType,
  ) => {
    if (!shift.client_id && !shift.location_id) {
      hubToast({
        title: "Can't save preference",
        description: "This shift has no client or location set.",
        variant: "destructive",
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
      hubToast({
        title: "Preference saved",
        description: `${workerName} marked as ${preferenceType.replace("_", " ")} for this ${shift.client_id ? "client" : "location"}.`,
      });
      setPrefRefreshKey(k => k + 1);
    } catch (e: any) {
      hubToast({
        title: "Couldn't save preference",
        description: e?.message ?? "Try again.",
        variant: "destructive",
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
      hubToast({
        title: "Preference cleared",
        description: `${workerName}'s preferences for this ${shift.client_id ? "client" : "location"} were cleared.`,
      });
      setPrefRefreshKey(k => k + 1);
    } catch (e: any) {
      hubToast({
        title: "Couldn't clear preference",
        description: e?.message ?? "Try again.",
        variant: "destructive",
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
      .filter(e => e.is_active !== false)
      .filter(e => !takenIds.has(e.id))
      .map(e => ({ e, r: computeReadiness(e, companyId) }))
      .filter(x => x.r.state !== "inactive" && x.r.state !== "unknown");
  }, [employees, takenIds, companyId]);

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
      if (filter === "ready" && c.readinessState !== "ready") return false;
      if (filter === "grace" && c.readinessState !== "grace_period") return false;
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

  const FILTERS: { key: RecFilter; label: string }[] = [
    { key: "best", label: "Best match" },
    { key: "ready", label: "Ready" },
    { key: "grace", label: "Grace period" },
    { key: "phone", label: "Has phone" },
    { key: "history", label: "Worked here" },
    { key: "available", label: "Available" },
    { key: "drivers", label: "Drivers" },
    { key: "captains", label: "Captains" },
  ];

  return (
    <section aria-label="Recommended workers" className="space-y-3">
      <SectionTitle icon={Sparkles} helper="Ranked by readiness, availability, history, contact, and reliability.">
        Add workers
      </SectionTitle>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, or ID…"
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
              "h-7 rounded-full px-2.5 text-[11px] font-semibold border",
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
        <p className="text-[11px] text-muted-foreground px-1">Refining recommendations…</p>
      )}

      {visible.length === 0 ? (
        <EmptyBlock
          title="No workers match"
          helper="Try a different search or clear filters. Workers already on this shift are hidden."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((c) => {
            const display = buildRecommendedDisplay(c);
            const badgeTone =
              c.readinessState === "ready"
                ? "border-emerald-300/60 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                : c.readinessState === "grace_period"
                  ? "border-amber-300/60 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
                  : "border-rose-300/60 text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30";
            return (
              <li
                key={c.employee.id}
                className="rounded-2xl border border-border/50 bg-card px-3 py-2.5 flex items-start gap-3"
              >
                <Avatar className="h-9 w-9 mt-0.5">
                  {c.employee.avatar_url ? <AvatarImage src={c.employee.avatar_url} alt={c.name} /> : null}
                  <AvatarFallback className="text-[11px] font-semibold">{c.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                    <span className={cn("rounded-full border px-1.5 py-0 text-[10px] font-semibold", badgeTone)}>
                      {c.readinessState === "ready" ? "Ready" : c.readinessState === "grace_period" ? "Grace" : "Blocked"}
                    </span>
                    <span
                      className="rounded-md border border-border/50 bg-muted/40 px-1.5 py-0 text-[10px] font-mono tabular-nums text-muted-foreground"
                      title={`Score ${c.score}`}
                    >
                      Score {c.score}
                    </span>
                  </div>
                  {display.chips.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {display.chips.map(ch => (
                        <span
                          key={`d-${ch.key}`}
                          className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                            ch.tone === "good"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                              : ch.tone === "risk"
                                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {ch.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {display.summary && (
                    <p className="mt-1 text-[11px] text-foreground/80 leading-snug">{display.summary}</p>
                  )}
                  {c.phone ? (
                    <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{c.phone}</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">No phone on file</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {c.canAssign ? (
                    <Button
                      size="sm"
                      onClick={() => onAssign(c.employee.id, c.name)}
                      className="h-8 px-2.5 text-[12px] gap-1"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Assign
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="h-8 px-2.5 text-[12px]"
                      title={
                        c.preferenceBlocked ? "Worker is blocked for this client/location"
                        : c.conflictDetected ? "Worker has an overlapping shift"
                        : "Worker can't be assigned"
                      }
                    >
                      {c.preferenceBlocked ? "Blocked here" : c.conflictDetected ? "Conflict" : "Blocked"}
                    </Button>
                  )}
                  {(shift.client_id || shift.location_id) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="h-7 px-2 rounded-md text-[10px] font-semibold text-muted-foreground hover:bg-muted/60 inline-flex items-center gap-1"
                          aria-label={`Set fit for ${c.name}`}
                        >
                          <MoreVertical className="h-3 w-3" /> Fit
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Mark for this {shift.client_id ? "client" : "location"}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "preferred")}>
                          Mark preferred
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "prequalified")}>
                          Mark prequalified
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "captain_preferred")}>
                          Captain preferred
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "driver_preferred")}>
                          Driver preferred
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleSetPreference(c.employee.id, c.name, "not_recommended")}>
                          Mark not recommended
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-600"
                          onClick={() => handleSetPreference(c.employee.id, c.name, "blocked")}
                        >
                          Block here
                        </DropdownMenuItem>
                        {(signals.preferencesByEmp.get(c.employee.id) ?? []).length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleClearPreferences(c.employee.id, c.name)}>
                              Clear preferences
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onOpenDesktop}
        className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary"
      >
        Open desktop staffing <ExternalLink className="h-3 w-3" />
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
        <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{helper}</p>
      ) : null}
    </div>
  );
}

function StatTile({
  label, value, accent = "muted",
}: {
  label: string;
  value: number | string;
  accent?: "good" | "warn" | "info" | "muted" | "bad";
}) {
  const accentCls =
    accent === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : accent === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : accent === "info"
          ? "text-sky-700 dark:text-sky-400"
          : accent === "bad"
            ? "text-rose-700 dark:text-rose-400"
            : "text-foreground";
  return (
    <div className="rounded-xl border border-border/50 bg-card px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums leading-tight", accentCls)}>{value}</p>
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
