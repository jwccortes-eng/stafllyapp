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
  MoreVertical, Check, XCircle,
} from "lucide-react";
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
  clientName, locationName, shiftAdminId,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("overview");

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
  }, [open, shift?.id]);

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
              onCopyPhone={(p) => {
                navigator.clipboard?.writeText(p).catch(() => {});
                toast({ title: "Phone copied" });
              }}
            />
          )}

          {tab === "claims" && (
            <ClaimsTab
              loading={claimsLoading}
              error={claimsError}
              claims={claims}
              empById={empById}
              onOpenDesktop={() => {
                onOpenChange(false);
                navigate("/app/shifts/requests");
              }}
            />
          )}

          {tab === "issues" && (
            <IssuesTab issues={issues} />
          )}

          {tab === "recommended" && (
            <RecommendedTab
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
  assignments, grouped, order, empById, shiftAdminId, onCopyPhone,
}: {
  assignments: HubAssignment[];
  grouped: Record<Bucket, HubAssignment[]>;
  order: Bucket[];
  empById: Map<string, Employee>;
  shiftAdminId: string | null;
  onCopyPhone: (p: string) => void;
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
                      onCopyPhone={onCopyPhone}
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

function WorkerRow({
  assignment, employee, isCaptain, onCopyPhone,
}: {
  assignment: HubAssignment;
  employee: Employee | undefined;
  isCaptain: boolean;
  onCopyPhone: (p: string) => void;
}) {
  const name = fullName(employee);
  const phoneDigits = normalizePhone(employee?.phone_number);
  const hasPhone = phoneDigits.length >= 10;
  const wa = hasPhone ? buildWhatsAppTargets(phoneDigits, "") : null;

  const subBits: string[] = [];
  if (assignment.assignment_role) subBits.push(assignment.assignment_role);
  if (assignment.attendance_status && assignment.attendance_status !== "pending") {
    subBits.push(assignment.attendance_status);
  }

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
          {!hasPhone && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">{HUB_COPY.noPhone}</p>
          )}
        </div>
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
  loading, error, claims, empById, onOpenDesktop,
}: {
  loading: boolean;
  error: string | null;
  claims: ShiftRequestRow[];
  empById: Map<string, Employee>;
  onOpenDesktop: () => void;
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
            const tone =
              c.status === "approved" ? "good" :
              c.status === "rejected" ? "bad" : "warn";
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
                    {c.message && (
                      <p className="mt-1 text-[12px] text-muted-foreground line-clamp-3">
                        "{c.message}"
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                      {c.reviewed_at ? ` · reviewed ${new Date(c.reviewed_at).toLocaleString()}` : ""}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-3">
        <p className="text-[12px] text-muted-foreground">{HUB_COPY.claimsManagedDesktop}</p>
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

function RecommendedTab({ onOpenDesktop }: { onOpenDesktop: () => void }) {
  return (
    <section aria-label="Recommended workers">
      <SectionTitle icon={Sparkles} helper={HUB_COPY.recommendedHelper}>
        Recommended
      </SectionTitle>
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-center">
        <Sparkles className="h-5 w-5 mx-auto text-muted-foreground" />
        <p className="mt-2 text-[12px] text-muted-foreground leading-snug">
          {HUB_COPY.recommendedPlaceholder}
        </p>
        <button
          type="button"
          onClick={onOpenDesktop}
          className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary"
        >
          {HUB_COPY.openDesktopStaffing} <ExternalLink className="h-3 w-3" />
        </button>
      </div>
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
