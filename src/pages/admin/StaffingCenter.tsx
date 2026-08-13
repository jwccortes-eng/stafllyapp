/**
 * StaffingCenter — Phase 6: Stafly Command Center v1
 *
 * Read-only operational dashboard for daily shift staffing.
 *
 * Hard rules:
 *  - No payroll calculations.
 *  - No time_entries reads/writes.
 *  - No attendance mutations.
 *  - No assignment mutations (navigation-only CTAs).
 *  - Multi-tenant: scoped by selectedCompanyId.
 *  - Mobile-first 390x844; works on desktop too.
 *
 * Data sources (all already proven safe in other Phase 1–5 surfaces):
 *  - scheduled_shifts (today + 7 days forward, deleted_at IS NULL)
 *  - shift_assignments (status / response_status / attendance_status)
 *  - shift_requests (claims, status='pending')
 *  - shift_audit_log (worker_response_accepted / rejected, recent feed)
 *  - clients / locations (names only)
 *  - employees (names for the recent-responses feed)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OpsFilterBanner from "@/components/ops/OpsFilterBanner";
import { format, addDays, parseISO, formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Radio, RefreshCw, Calendar, AlertTriangle, MapPin, UserCheck, UserX,
  Users, Clock, ChevronRight, Inbox, CheckCircle2, XCircle, Activity,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────
type ShiftRow = {
  id: string;
  title: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  slots: number | null;
  client_id: string | null;
  location_id: string | null;
  job_site_location_id: string | null;
  meeting_point_location_id: string | null;
  meeting_point: string | null;
  publication_status: string | null;
  status: string | null;
};

type AssignmentRow = {
  id: string;
  shift_id: string;
  employee_id: string | null;
  status: string;
  response_status: string | null;
  attendance_status: string | null;
};

type ClaimRow = { id: string; shift_id: string };

type AuditFeedRow = {
  id: string;
  shift_id: string;
  employee_id: string | null;
  action: string;
  created_at: string;
};

type ShiftMetrics = {
  required: number;
  staffed: number;
  accepted: number;
  pending: number;
  rejected: number;
  removed: number;
  absent: number;
  claimsPending: number;
  openSpots: number;
  hasLocation: boolean;
  hasMeetingPoint: boolean;
  isToday: boolean;
  withinNext48h: boolean;
  isLarge: boolean;
  coveragePct: number;
  riskScore: number;
  reasons: string[];
};

const STAFFED_EXCLUDED = new Set(["rejected", "removed"]);
const ACCEPTED_STATUSES = new Set(["accepted", "confirmed"]);

// ─── Risk scoring ─────────────────────────────────────────────────────────
function computeMetrics(shift: ShiftRow, asgs: AssignmentRow[], claims: number): ShiftMetrics {
  const required = Math.max(shift.slots ?? 0, 0);
  let staffed = 0, accepted = 0, pending = 0, rejected = 0, removed = 0, absent = 0;

  for (const a of asgs) {
    if (a.status === "removed") { removed += 1; continue; }
    if (a.status === "rejected" || a.response_status === "rejected") { rejected += 1; continue; }
    staffed += 1;
    if (ACCEPTED_STATUSES.has(a.status) || a.response_status === "accepted") accepted += 1;
    else if (a.response_status === "pending" || a.status === "pending") pending += 1;
    if (a.attendance_status === "absent") absent += 1;
  }

  const openSpots = Math.max(required - staffed, 0);
  const hasLocation = !!(shift.location_id || shift.job_site_location_id);
  const hasMeetingPoint = !!(shift.meeting_point_location_id || (shift.meeting_point && shift.meeting_point.trim()));
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isToday = shift.date === todayStr;
  const shiftStart = shift.start_time
    ? new Date(`${shift.date}T${shift.start_time}`)
    : new Date(`${shift.date}T00:00:00`);
  const hoursAhead = (shiftStart.getTime() - Date.now()) / 3_600_000;
  const withinNext48h = hoursAhead >= 0 && hoursAhead <= 48;
  const isLarge = required >= 20;
  const coveragePct = required > 0 ? Math.round((staffed / required) * 100) : 100;

  let score = 0;
  const reasons: string[] = [];
  if (isToday && openSpots > 0) { score += 100; reasons.push("Needs staff today"); }
  else if (openSpots > 0) reasons.push("Needs staff");
  if (!hasLocation) { score += 80; reasons.push(hasMeetingPoint ? "Missing job site" : "No location"); }
  if (pending > 0) { score += 60; reasons.push(`${pending} pending response${pending === 1 ? "" : "s"}`); }
  if (rejected > 0) { score += 60; reasons.push(`${rejected} rejected`); }
  if (claims > 0) { score += 50; reasons.push(`${claims} claim${claims === 1 ? "" : "s"} pending`); }
  if (absent > 0) { score += 50; reasons.push(`${absent} no-show`); }
  if (required > 0 && coveragePct < 70) score += 30;
  if (isLarge) score += 20;
  if (withinNext48h) score += 10;

  return {
    required, staffed, accepted, pending, rejected, removed, absent,
    claimsPending: claims, openSpots, hasLocation, hasMeetingPoint, isToday, withinNext48h,
    isLarge, coveragePct, riskScore: score, reasons,
  };
}

// ─── Small UI atoms ───────────────────────────────────────────────────────
function Chip({ tone = "muted", children, icon: Icon }: { tone?: "muted" | "warn" | "bad" | "good" | "info"; children: React.ReactNode; icon?: any }) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    warn:  "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    bad:   "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
    good:  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    info:  "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", cls)}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

function SummaryTile({ label, value, tone = "muted" }: { label: string; value: number | string; tone?: "muted" | "warn" | "bad" | "good" }) {
  const ring = {
    muted: "border-border",
    warn: "border-amber-500/30",
    bad: "border-rose-500/30",
    good: "border-emerald-500/30",
  }[tone];
  return (
    <div className={cn("rounded-lg border bg-card p-3", ring)}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ─── Shift card ───────────────────────────────────────────────────────────
function ShiftCard({
  shift, metrics, clientName, locationName, onManage,
}: {
  shift: ShiftRow;
  metrics: ShiftMetrics;
  clientName: string | null;
  locationName: string | null;
  onManage: () => void;
}) {
  const time = shift.start_time?.slice(0, 5) ?? "—";
  const endTime = shift.end_time?.slice(0, 5) ?? "—";
  const dateLabel = format(parseISO(shift.date), "EEE, MMM d", { locale: enUS });
  const titleText = shift.title || clientName || "Untitled shift";

  const tone =
    metrics.riskScore >= 150 ? "bad" :
    metrics.riskScore >= 80  ? "warn" :
    metrics.openSpots === 0 && metrics.pending === 0 ? "good" : "muted";

  const accentBar = {
    bad:   "bg-rose-500",
    warn:  "bg-amber-500",
    good:  "bg-emerald-500",
    muted: "bg-border",
  }[tone];

  return (
    <Card className="overflow-hidden">
      <div className={cn("h-1 w-full", accentBar)} />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{titleText}</h3>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{dateLabel}</span>
              <span className="opacity-50">·</span>
              <Clock className="h-3 w-3" />
              <span className="tabular-nums">{time}–{endTime}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{locationName ?? (metrics.hasLocation ? "Location set" : (metrics.hasMeetingPoint ? "Job site missing · meeting point set" : "No location"))}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-base font-semibold tabular-nums">
              {metrics.staffed}<span className="text-muted-foreground">/{metrics.required || "?"}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Staffed</div>
          </div>
        </div>

        {/* Counts */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <div className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{metrics.accepted}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Accepted</div>
          </div>
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <div className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">{metrics.pending}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Pending</div>
          </div>
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <div className="text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">{metrics.rejected}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Rejected</div>
          </div>
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <div className="text-sm font-semibold tabular-nums">{metrics.openSpots}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Open</div>
          </div>
        </div>

        {/* Chips */}
        {metrics.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {metrics.openSpots > 0 && <Chip tone="warn" icon={Users}>Needs staff</Chip>}
            {!metrics.hasLocation && <Chip tone={metrics.hasMeetingPoint ? "warn" : "bad"} icon={MapPin}>{metrics.hasMeetingPoint ? "Missing job site" : "No location"}</Chip>}
            {!metrics.hasLocation && metrics.hasMeetingPoint && <Chip tone="muted" icon={MapPin}>Meeting point set</Chip>}
            {metrics.pending > 0 && <Chip tone="warn" icon={Clock}>Pending responses</Chip>}
            {metrics.rejected > 0 && <Chip tone="bad" icon={UserX}>Rejected workers</Chip>}
            {metrics.claimsPending > 0 && <Chip tone="info" icon={Inbox}>Claims</Chip>}
            {metrics.absent > 0 && <Chip tone="bad" icon={AlertTriangle}>No-show</Chip>}
            {metrics.openSpots === 0 && metrics.pending === 0 && metrics.rejected === 0 && metrics.hasLocation && (
              <Chip tone="good" icon={CheckCircle2}>Ready</Chip>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1" onClick={onManage}>
            Manage team
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function StaffingCenter() {
  const navigate = useNavigate();
  const { role, hasModuleAccess } = useAuth();
  const { canAny } = usePermissions();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const canManageShifts = canAny(["staffing.assign", "service.edit"]);

  const [searchParams, setSearchParams] = useSearchParams();
  const opsWhen = searchParams.get("when");
  const opsFilter = searchParams.get("filter");
  const opsFilterActive = !!opsWhen || !!opsFilter;
  const opsFilterLabel = (() => {
    const parts: string[] = [];
    if (opsWhen === "today") parts.push("Hoy");
    if (opsWhen === "tomorrow") parts.push("Mañana");
    if (opsFilter === "needs-staffing") parts.push("Necesitan personal");
    return parts.join(" · ") || "Filtro Ops";
  })();
  const clearOpsFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("when");
    next.delete("filter");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);


  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [audit, setAudit] = useState<AuditFeedRow[]>([]);
  const [clients, setClients] = useState<Map<string, string>>(new Map());
  const [locations, setLocations] = useState<Map<string, string>>(new Map());
  const [employeeNames, setEmployeeNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (!selectedCompanyId) { setLoading(false); return; }
    if (mode === "initial") setLoading(true); else setRefreshing(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const in7   = format(addDays(new Date(), 7), "yyyy-MM-dd");

      const [shiftsRes, clientsRes, locsRes] = await Promise.all([
        supabase.from("scheduled_shifts")
          .select("id,title,date,start_time,end_time,slots,client_id,location_id,job_site_location_id,meeting_point_location_id,meeting_point,publication_status,status")
          .eq("company_id", selectedCompanyId)
          .is("deleted_at", null)
          .gte("date", today).lte("date", in7)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase.from("clients").select("id,name").eq("company_id", selectedCompanyId),
        supabase.from("locations").select("id,name").eq("company_id", selectedCompanyId),
      ]);
      if (shiftsRes.error) throw shiftsRes.error;

      const shiftRows = (shiftsRes.data ?? []) as ShiftRow[];
      const ids = shiftRows.map(s => s.id);

      let asgs: AssignmentRow[] = [];
      let claimRows: ClaimRow[] = [];
      let auditRows: AuditFeedRow[] = [];
      if (ids.length > 0) {
        const [aRes, cRes, audRes] = await Promise.all([
          supabase.from("shift_assignments")
            .select("id,shift_id,employee_id,status,response_status,attendance_status")
            .eq("company_id", selectedCompanyId)
            .in("shift_id", ids),
          supabase.from("shift_requests")
            .select("id,shift_id")
            .eq("company_id", selectedCompanyId)
            .in("shift_id", ids)
            .eq("status", "pending"),
          supabase.from("shift_audit_log")
            .select("id,shift_id,employee_id,action,created_at")
            .eq("company_id", selectedCompanyId)
            .in("action", ["worker_response_accepted", "worker_response_rejected"])
            .order("created_at", { ascending: false })
            .limit(10),
        ]);
        if (aRes.error)   throw aRes.error;
        if (cRes.error)   throw cRes.error;
        if (audRes.error) throw audRes.error;
        asgs       = (aRes.data ?? []) as AssignmentRow[];
        claimRows  = (cRes.data ?? []) as ClaimRow[];
        auditRows  = (audRes.data ?? []) as AuditFeedRow[];
      }

      // Lookup employee names for audit feed
      const empIds = Array.from(new Set(auditRows.map(r => r.employee_id).filter(Boolean) as string[]));
      let empMap = new Map<string, string>();
      if (empIds.length > 0) {
        const { data: emps } = await supabase
          .from("employees")
          .select("id,first_name,last_name")
          .eq("company_id", selectedCompanyId)
          .in("id", empIds);
        for (const e of emps ?? []) {
          empMap.set(e.id as string, `${(e as any).first_name ?? ""} ${(e as any).last_name ?? ""}`.trim() || "Worker");
        }
      }

      setShifts(shiftRows);
      setAssignments(asgs);
      setClaims(claimRows);
      setAudit(auditRows);
      setClients(new Map((clientsRes.data ?? []).map((c: any) => [c.id as string, c.name as string])));
      setLocations(new Map((locsRes.data ?? []).map((l: any) => [l.id as string, l.name as string])));
      setEmployeeNames(empMap);
      setError(null);
      setLastUpdated(new Date());
    } catch (e: any) {
      console.error("[StaffingCenter] load failed", e);
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => { load("initial"); }, [load]);

  // ── Derived state ──────────────────────────────────────────────────────
  const asgsByShift = useMemo(() => {
    const m = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      if (!m.has(a.shift_id)) m.set(a.shift_id, []);
      m.get(a.shift_id)!.push(a);
    }
    return m;
  }, [assignments]);

  const claimsByShift = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of claims) m.set(c.shift_id, (m.get(c.shift_id) ?? 0) + 1);
    return m;
  }, [claims]);

  const enriched = useMemo(() => {
    return shifts.map(s => ({
      shift: s,
      metrics: computeMetrics(s, asgsByShift.get(s.id) ?? [], claimsByShift.get(s.id) ?? 0),
      clientName: s.client_id ? clients.get(s.client_id) ?? null : null,
      locationName:
        (s.location_id && locations.get(s.location_id)) ||
        (s.job_site_location_id && locations.get(s.job_site_location_id)) ||
        null,
    }));
  }, [shifts, asgsByShift, claimsByShift, clients, locations]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const in7Str = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const needsAttention = useMemo(() =>
    enriched
      .filter(e => e.metrics.riskScore > 0)
      .sort((a, b) => b.metrics.riskScore - a.metrics.riskScore || a.shift.date.localeCompare(b.shift.date))
      .slice(0, 12),
  [enriched]);

  const todayShifts = useMemo(() =>
    enriched.filter(e => e.shift.date === todayStr)
            .sort((a, b) => (a.shift.start_time ?? "").localeCompare(b.shift.start_time ?? "")),
  [enriched, todayStr]);

  const upcomingGroups = useMemo(() => {
    const tomorrow: typeof enriched = [];
    const week: typeof enriched = [];
    const later: typeof enriched = [];
    for (const e of enriched) {
      if (e.shift.date <= todayStr) continue;
      if (e.shift.date === tomorrowStr) tomorrow.push(e);
      else if (e.shift.date <= in7Str) week.push(e);
      else later.push(e);
    }
    return { tomorrow, week, later };
  }, [enriched, todayStr, tomorrowStr, in7Str]);

  const totalPendingResponses = enriched.reduce((s, e) => s + e.metrics.pending, 0);
  const totalOpenSpots        = enriched.reduce((s, e) => s + e.metrics.openSpots, 0);
  const missingInfoCount      = enriched.filter(e => !e.metrics.hasLocation).length;

  const goManage = useCallback((shiftId: string) => {
    const tab = todayShifts.some(t => t.shift.id === shiftId) ? "today" : "upcoming";
    navigate(`/app/shifts?tab=${tab}&shift=${shiftId}&manageTeam=1`);
  }, [navigate, todayShifts]);

  // ── Guards ──────────────────────────────────────────────────────────────
  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a company to view the Command Center.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 pb-24 space-y-5">
      {/* Header */}
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Command Center</h1>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {selectedCompany?.name ?? "—"} · {format(new Date(), "EEEE, MMM d", { locale: enUS })}
            </p>
            {lastUpdated && (
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Updated {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: enUS })}
              </p>
            )}
          </div>
          <Button
            size="sm" variant="outline"
            disabled={refreshing}
            onClick={() => load("refresh")}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryTile label="Today" value={loading ? "—" : todayShifts.length} />
          <SummaryTile label="Needs staff" value={loading ? "—" : totalOpenSpots} tone={totalOpenSpots > 0 ? "warn" : "good"} />
          <SummaryTile label="Missing info" value={loading ? "—" : missingInfoCount} tone={missingInfoCount > 0 ? "bad" : "good"} />
          <SummaryTile label="Pending responses" value={loading ? "—" : totalPendingResponses} tone={totalPendingResponses > 0 ? "warn" : "good"} />
        </div>
      </header>

      <OpsFilterBanner
        active={opsFilterActive}
        label={opsFilterLabel}
        onClear={clearOpsFilter}
      />


      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-xs text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Section A — Needs Attention */}
      <section className="space-y-2">
        <SectionHeading
          icon={AlertTriangle}
          tone="warn"
          title="Needs attention"
          subtitle="Shifts ranked by operational risk"
          count={needsAttention.length}
        />
        {loading
          ? <SkeletonList />
          : needsAttention.length === 0
            ? <EmptyState text="All shifts on track" tone="good" />
            : <div className="space-y-2">
                {needsAttention.map(({ shift, metrics, clientName, locationName }) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    metrics={metrics}
                    clientName={clientName}
                    locationName={locationName}
                    onManage={() => canManageShifts && goManage(shift.id)}
                  />
                ))}
              </div>
        }
      </section>

      {/* Section B — Today */}
      <section className="space-y-2">
        <SectionHeading icon={Calendar} title="Today" subtitle={format(new Date(), "EEEE, MMM d", { locale: enUS })} count={todayShifts.length} />
        {loading
          ? <SkeletonList />
          : todayShifts.length === 0
            ? <EmptyState text="No shifts today" />
            : <div className="space-y-2">
                {todayShifts.map(({ shift, metrics, clientName, locationName }) => (
                  <ShiftCard key={shift.id} shift={shift} metrics={metrics} clientName={clientName} locationName={locationName}
                    onManage={() => canManageShifts && goManage(shift.id)} />
                ))}
              </div>}
      </section>

      {/* Section C — Upcoming */}
      <section className="space-y-3">
        <SectionHeading icon={Calendar} title="Upcoming" subtitle="Next 7 days" />
        {loading
          ? <SkeletonList />
          : (
            <>
              <UpcomingGroup label="Tomorrow" items={upcomingGroups.tomorrow} canManage={canManageShifts} onManage={goManage} />
              <UpcomingGroup label="This week" items={upcomingGroups.week}     canManage={canManageShifts} onManage={goManage} />
              {upcomingGroups.later.length > 0 && (
                <UpcomingGroup label="Later" items={upcomingGroups.later} canManage={canManageShifts} onManage={goManage} />
              )}
              {upcomingGroups.tomorrow.length === 0 && upcomingGroups.week.length === 0 && upcomingGroups.later.length === 0 && (
                <EmptyState text="No upcoming shifts" />
              )}
            </>
          )}
      </section>

      {/* Section D — Recent Responses */}
      <section className="space-y-2">
        <SectionHeading icon={Activity} title="Recent responses" subtitle="Latest worker accept / reject events" count={audit.length} />
        {loading
          ? <SkeletonList />
          : audit.length === 0
            ? <EmptyState text="No recent responses" />
            : <Card><CardContent className="p-0 divide-y divide-border">
                {audit.map(row => {
                  const accepted = row.action === "worker_response_accepted";
                  const shiftEntry = enriched.find(e => e.shift.id === row.shift_id);
                  const name = (row.employee_id && employeeNames.get(row.employee_id)) || "Worker";
                  return (
                    <button
                      key={row.id}
                      className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
                      onClick={() => goManage(row.shift_id)}
                    >
                      <div className={cn(
                        "mt-0.5 rounded-full p-1.5",
                        accepted ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                 : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      )}>
                        {accepted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs">
                          <span className="font-medium">{name}</span>{" "}
                          <span className="text-muted-foreground">
                            {accepted ? "accepted" : "rejected"}
                          </span>{" "}
                          <span className="font-medium truncate">
                            {shiftEntry?.shift.title || shiftEntry?.clientName || "shift"}
                          </span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(parseISO(row.created_at), { addSuffix: true, locale: enUS })}
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground self-center" />
                    </button>
                  );
                })}
              </CardContent></Card>
        }
      </section>

      {/* Section E — Claims */}
      {claims.length > 0 && (
        <section className="space-y-2">
          <SectionHeading icon={Inbox} title="Claims pending" subtitle="Workers requesting open spots" count={claims.length} />
          <Card><CardContent className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {claims.length} pending claim{claims.length === 1 ? "" : "s"} across {new Set(claims.map(c => c.shift_id)).size} shift{new Set(claims.map(c => c.shift_id)).size === 1 ? "" : "s"}.
            </p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/app/shifts?tab=requests")}>
              Review in Manage Team
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent></Card>
        </section>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────
function SectionHeading({
  icon: Icon, title, subtitle, count, tone = "muted",
}: { icon: any; title: string; subtitle?: string; count?: number; tone?: "muted" | "warn" }) {
  return (
    <div className="flex items-end justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground/70")} />
        <h2 className="text-sm font-semibold">{title}</h2>
        {typeof count === "number" && count > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">{count}</Badge>
        )}
      </div>
      {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
    </div>
  );
}

function EmptyState({ text, tone = "muted" }: { text: string; tone?: "muted" | "good" }) {
  return (
    <Card>
      <CardContent className="p-6 text-center">
        <div className={cn(
          "mx-auto mb-2 inline-flex rounded-full p-2",
          tone === "good" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
        )}>
          {tone === "good" ? <CheckCircle2 className="h-4 w-4" /> : <Inbox className="h-4 w-4" />}
        </div>
        <p className="text-xs text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

function UpcomingGroup({
  label, items, canManage, onManage,
}: {
  label: string;
  items: { shift: ShiftRow; metrics: ShiftMetrics; clientName: string | null; locationName: string | null }[];
  canManage: boolean;
  onManage: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[9px] tabular-nums">{items.length}</Badge>
      </div>
      <div className="space-y-2">
        {items.map(({ shift, metrics, clientName, locationName }) => (
          <ShiftCard
            key={shift.id}
            shift={shift}
            metrics={metrics}
            clientName={clientName}
            locationName={locationName}
            onManage={() => canManage && onManage(shift.id)}
          />
        ))}
      </div>
    </div>
  );
}
