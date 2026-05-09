/**
 * MobileShiftTeamHub — Phase 1, Step 1 (skeleton, READ-ONLY).
 *
 * Opened from MobileShiftOperationsSheet via a "Manage team" CTA.
 * This first version owns NO mutations yet — it only re-organizes the
 * read-only data already loaded by the parent sheet so operators can
 * see workers grouped by lifecycle state (Confirmed / Accepted / Pending /
 * Rejected by worker / Removed by ops) plus a coverage strip.
 *
 * Step 2 (separate PR) will wire the 4 whitelisted actions:
 *   - Accept on behalf  (status='accepted', accepted_at=now())
 *   - Confirm           (status='confirmed')
 *   - Mark attendance   (reuse AttendanceValidator)
 *   - Soft-remove       (status='removed', blocked if time_entries exist)
 *
 * Safety contract carried in:
 *  - No writes. No mutations. No notifications. No schema/RLS impact.
 *  - Tenant-scoped via parent (assignments are already filtered upstream).
 *  - Permission gate: rendered behind canManageShifts() in the parent.
 *  - Worker portal unaffected. Desktop unaffected. Payroll untouched.
 */

import { memo, useMemo } from "react";
import {
  X, Users, ShieldCheck, Clock, UserPlus, ExternalLink, Inbox,
  CheckCircle2, AlertCircle, UserMinus, UserX,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatShiftCode, type Shift, type Employee } from "@/components/shifts/types";

const HUB_COPY = {
  intro: "Review the team for this shift. Mutations land in Step 2 — this view is read-only for now.",
  coverageHelper: "Live snapshot of staffing for this shift.",
  assignedHelper: "Grouped by lifecycle status. Soft-remove and Accept on behalf will land in Step 2.",
  requestsHelper: "People who claimed or requested this shift.",
  requestsManagedDesktop: "Requests are still approved from the desktop request queue.",
  emptyAssignedTitle: "No workers assigned yet",
  emptyAssignedHelper: "Add workers to start staffing this shift.",
  emptyRequestsTitle: "No open requests",
  emptyRequestsHelper: "Requests from workers will show here.",
  desktopOnlyAdd: "Adding workers from mobile lands in Step 3.",
  desktopOnlyEdit: "Editing shift details, duplicating, or cancelling the shift stays on desktop for now.",
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
  /** Employees catalog used to resolve names/avatars. */
  employees: Employee[];
  /** Permission flag from parent (canManageShifts result). */
  canManage: boolean;
  /** Optional UI labels passed from parent for header context. */
  clientName?: string | null;
  locationName?: string | null;
}

type Bucket =
  | "confirmed"
  | "accepted"
  | "pending"
  | "rejected_by_worker"
  | "removed"
  | "other";

function bucketize(a: HubAssignment): Bucket {
  if (a.status === "removed") return "removed";
  if (a.response_status === "rejected") return "rejected_by_worker";
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
  rejected_by_worker: { label: "Rejected by worker", icon: UserX, tone: "bad" },
  removed: { label: "Removed by ops", icon: UserMinus, tone: "muted" },
  other: { label: "Other", icon: AlertCircle, tone: "muted" },
};

const TONE_CLASSES: Record<NonNullable<ReturnType<typeof bucketize>> extends string ? string : never, string> = {} as never;

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

function MobileShiftTeamHubImpl({
  open, onOpenChange, shift, assignments, employees, canManage,
  clientName, locationName,
}: Props) {
  const navigate = useNavigate();

  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const grouped = useMemo(() => {
    const buckets: Record<Bucket, HubAssignment[]> = {
      confirmed: [], accepted: [], pending: [],
      rejected_by_worker: [], removed: [], other: [],
    };
    for (const a of assignments) buckets[bucketize(a)].push(a);
    return buckets;
  }, [assignments]);

  const slots = shift.slots ?? 0;
  const staffedCount =
    grouped.confirmed.length + grouped.accepted.length + grouped.pending.length;
  const openSpots = Math.max(slots - staffedCount, 0);

  const order: Bucket[] = [
    "confirmed", "accepted", "pending",
    "rejected_by_worker", "removed", "other",
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="h-[92vh] p-0 rounded-t-3xl flex flex-col overflow-hidden bg-background"
      >
        {/* Header */}
        <div className="px-5 pt-3 pb-3 border-b border-border/40 bg-background/95 backdrop-blur-sm">
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
              </div>
              <h2 className="text-lg font-semibold tracking-tight leading-tight line-clamp-2">
                {clientName && clientName !== "—" ? clientName : (shift.title || "Shift")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {locationName || "No location"} · {shift.date} · {shift.start_time}–{shift.end_time}
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
          <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
            {HUB_COPY.intro}
          </p>
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

          {/* A. Coverage Summary */}
          <section aria-label="Coverage summary">
            <SectionTitle icon={Users} helper={HUB_COPY.coverageHelper}>
              Coverage
            </SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Required" value={slots || "—"} />
              <StatTile label="Staffed" value={staffedCount} />
              <StatTile label="Open" value={openSpots} accent={openSpots > 0 ? "warn" : "good"} />
              <StatTile label="Confirmed" value={grouped.confirmed.length} accent="good" />
              <StatTile label="Accepted" value={grouped.accepted.length} accent="info" />
              <StatTile label="Pending" value={grouped.pending.length} accent="warn" />
            </div>
          </section>

          {/* B. Assigned Workers grouped */}
          <section aria-label="Assigned workers">
            <SectionTitle icon={ShieldCheck} helper={HUB_COPY.assignedHelper}>
              Assigned workers
              <span className="ml-1.5 text-xs font-normal text-muted-foreground normal-case tracking-normal">
                ({assignments.length})
              </span>
            </SectionTitle>

            {assignments.length === 0 ? (
              <EmptyBlock
                title={HUB_COPY.emptyAssignedTitle}
                helper={HUB_COPY.emptyAssignedHelper}
              />
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
                        {list.map((a) => {
                          const e = empById.get(a.employee_id);
                          const name = e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : "Unknown worker";
                          return (
                            <li key={a.id} className="flex items-center gap-2.5 px-3 py-2">
                              <Avatar className="h-8 w-8 shrink-0">
                                {e?.avatar_url ? <AvatarImage src={e.avatar_url} alt="" /> : null}
                                <AvatarFallback className="text-[10px] font-semibold">
                                  {initialsOf(e)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight truncate">{name}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {a.assignment_role || "—"}
                                  {a.attendance_status && a.attendance_status !== "pending"
                                    ? ` · ${a.attendance_status}` : ""}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* C. Worker requests — placeholder pending request feed wiring */}
          <section aria-label="Worker requests">
            <SectionTitle icon={Inbox} helper={HUB_COPY.requestsHelper}>
              Requests
            </SectionTitle>
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[12px] text-muted-foreground">
                {HUB_COPY.requestsManagedDesktop}
              </p>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/app/shifts/requests");
                }}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary"
              >
                Open request queue <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </section>

          {/* D. Add workers (Step 3 placeholder) */}
          <section aria-label="Add workers">
            <SectionTitle icon={UserPlus}>Add workers</SectionTitle>
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[12px] text-muted-foreground">{HUB_COPY.desktopOnlyAdd}</p>
            </div>
          </section>

          {/* F. Shift actions live on desktop */}
          <p className="px-0.5 text-[11px] text-muted-foreground leading-snug">
            {HUB_COPY.desktopOnlyEdit}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const MobileShiftTeamHub = memo(MobileShiftTeamHubImpl);

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
  accent?: "good" | "warn" | "info" | "muted";
}) {
  const accentCls =
    accent === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : accent === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : accent === "info"
          ? "text-sky-700 dark:text-sky-400"
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
