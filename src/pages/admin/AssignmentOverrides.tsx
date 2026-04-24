/**
 * Assignment Overrides Dashboard
 * ------------------------------
 * Read-only + revoke surface for `shift_assignment_admin_overrides`.
 * Lets admin / owner / developer audit every operational bypass of the
 * `enforce_employee_ready_for_shift` trigger.
 *
 * Scope guarantees:
 *   - Does NOT touch payroll, attendance, or employee.profile_status.
 *   - Does NOT allow creating new overrides from this page (revoke only).
 *   - Server-side RLS already restricts to admin/owner/developer/company_admin.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow, isAfter, isBefore, addDays } from "date-fns";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Search,
  Copy,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  Filter,
  Loader2,
  Calendar,
  CheckCircle2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  PROFILE_STATUS_LABELS,
  PROFILE_STATUS_TONES,
  type ProfileStatus,
} from "@/lib/onboarding/profile-status";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OverrideStatus = "active" | "expiring_soon" | "expired" | "revoked";

interface OverrideRow {
  id: string;
  company_id: string;
  shift_id: string;
  employee_id: string;
  reason: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;

  // joined
  employee_name: string;
  employer_identification: string | null;
  profile_status: ProfileStatus;
  onboarding_status: string | null;
  shift_code: string | null;
  shift_date: string | null;
  shift_start: string | null;
  shift_end: string | null;
  shift_title: string | null;
  created_by_name: string | null;
  has_active_assignment: boolean;
}

interface AlertItem {
  kind: "ready_with_override" | "expiring_soon" | "active_assignment_expired_override";
  override: OverrideRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function deriveStatus(o: { expires_at: string | null; revoked_at: string | null }): OverrideStatus {
  if (o.revoked_at) return "revoked";
  if (!o.expires_at) return "active";
  const exp = new Date(o.expires_at);
  if (isBefore(exp, new Date())) return "expired";
  if (isBefore(exp, addDays(new Date(), 7))) return "expiring_soon";
  return "active";
}

const STATUS_TONE: Record<OverrideStatus, string> = {
  active: "bg-earning/10 text-earning border-earning/20",
  expiring_soon: "bg-warning/10 text-warning border-warning/20",
  expired: "bg-muted text-muted-foreground border-border",
  revoked: "bg-deduction/10 text-deduction border-deduction/20",
};

const STATUS_LABEL: Record<OverrideStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  revoked: "Revoked",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy HH:mm");
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function buildAuditRow(o: OverrideRow): string {
  return [
    `override_id=${o.id}`,
    `company_id=${o.company_id}`,
    `shift_id=${o.shift_id}`,
    `shift_code=${o.shift_code ?? ""}`,
    `employee_id=${o.employee_id}`,
    `employee=${o.employee_name}`,
    `profile_status=${o.profile_status}`,
    `onboarding=${o.onboarding_status ?? ""}`,
    `created_by=${o.created_by}`,
    `created_at=${o.created_at}`,
    `expires_at=${o.expires_at ?? ""}`,
    `revoked_at=${o.revoked_at ?? ""}`,
    `revoked_by=${o.revoked_by ?? ""}`,
    `reason=${JSON.stringify(o.reason)}`,
  ].join(" | ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AssignmentOverrides() {
  const { role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();

  const isPrivileged = role === "developer" || role === "owner" || role === "company_owner" || role === "admin";

  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OverrideStatus | "all">("all");
  const [shiftCodeFilter, setShiftCodeFilter] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState<string>("all");
  const [expFilter, setExpFilter] = useState<"all" | "next7" | "next30">("all");
  const [revokeTarget, setRevokeTarget] = useState<OverrideRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  async function load() {
    if (!selectedCompanyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Base overrides — RLS already filters to caller-visible companies.
    const { data: ovs, error } = await supabase
      .from("shift_assignment_admin_overrides")
      .select("id, company_id, shift_id, employee_id, reason, created_by, created_at, expires_at, revoked_at, revoked_by")
      .eq("company_id", selectedCompanyId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Failed to load overrides", description: error.message, variant: "destructive" });
      setRows([]);
      setLoading(false);
      return;
    }

    const overrides = ovs ?? [];
    if (overrides.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const employeeIds = Array.from(new Set(overrides.map((o) => o.employee_id)));
    const shiftIds = Array.from(new Set(overrides.map((o) => o.shift_id)));
    const creatorIds = Array.from(new Set(overrides.map((o) => o.created_by).filter(Boolean)));

    const [empsRes, shiftsRes, profsRes, asgsRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, first_name, last_name, employer_identification, profile_status, onboarding_status")
        .in("id", employeeIds),
      supabase
        .from("scheduled_shifts")
        .select("id, shift_code, date, start_time, end_time, title")
        .in("id", shiftIds),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", creatorIds.length > 0 ? creatorIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase
        .from("shift_assignments")
        .select("shift_id, employee_id, status")
        .in("shift_id", shiftIds)
        .in("employee_id", employeeIds),
    ]);

    const empMap = new Map((empsRes.data ?? []).map((e) => [e.id, e]));
    const shiftMap = new Map((shiftsRes.data ?? []).map((s) => [s.id, s]));
    const profMap = new Map((profsRes.data ?? []).map((p) => [p.id, p]));
    const asgKey = (sid: string, eid: string) => `${sid}|${eid}`;
    const activeAsgSet = new Set(
      (asgsRes.data ?? [])
        .filter((a) => a.status !== "rejected" && a.status !== "removed")
        .map((a) => asgKey(a.shift_id, a.employee_id)),
    );

    const enriched: OverrideRow[] = overrides.map((o) => {
      const e = empMap.get(o.employee_id);
      const s = shiftMap.get(o.shift_id);
      const p = o.created_by ? profMap.get(o.created_by) : undefined;
      return {
        ...o,
        employee_name:
          e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "(unnamed)" : "(unknown employee)",
        employer_identification: e?.employer_identification ?? null,
        profile_status: ((e?.profile_status as ProfileStatus) ?? "incomplete"),
        onboarding_status: e?.onboarding_status ?? null,
        shift_code: s?.shift_code ?? null,
        shift_date: s?.date ?? null,
        shift_start: s?.start_time ?? null,
        shift_end: s?.end_time ?? null,
        shift_title: s?.title ?? null,
        created_by_name: (p?.full_name as string | undefined) ?? (p?.email as string | undefined) ?? null,
        has_active_assignment: activeAsgSet.has(asgKey(o.shift_id, o.employee_id)),
      };
    });

    setRows(enriched);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const creators = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.created_by) m.set(r.created_by, r.created_by_name ?? r.created_by.slice(0, 8));
    }
    return Array.from(m.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const status = deriveStatus(r);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (shiftCodeFilter.trim() && !(r.shift_code ?? "").toLowerCase().includes(shiftCodeFilter.toLowerCase())) {
        return false;
      }
      if (createdByFilter !== "all" && r.created_by !== createdByFilter) return false;
      if (expFilter !== "all" && r.expires_at) {
        const exp = new Date(r.expires_at);
        const limit = addDays(new Date(), expFilter === "next7" ? 7 : 30);
        if (isAfter(exp, limit)) return false;
        if (isBefore(exp, new Date()) && status === "expired") return false; // already past
      } else if (expFilter !== "all" && !r.expires_at) {
        return false; // perpetual overrides excluded from time-windowed filters
      }
      if (q) {
        const hay = `${r.employee_name} ${r.employer_identification ?? ""} ${r.shift_code ?? ""} ${r.shift_title ?? ""} ${r.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, shiftCodeFilter, createdByFilter, expFilter]);

  const kpis = useMemo(() => {
    const k = { active: 0, expiring: 0, expired: 0, revoked: 0, byReason: new Map<string, number>() };
    for (const r of rows) {
      const s = deriveStatus(r);
      if (s === "active") k.active++;
      else if (s === "expiring_soon") {
        k.active++; // expiring is still active
        k.expiring++;
      } else if (s === "expired") k.expired++;
      else if (s === "revoked") k.revoked++;

      const reasonKey = (r.reason || "—").split(/[-—]/)[0].trim().slice(0, 60) || "—";
      k.byReason.set(reasonKey, (k.byReason.get(reasonKey) ?? 0) + 1);
    }
    return k;
  }, [rows]);

  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = [];
    for (const r of rows) {
      const s = deriveStatus(r);
      // Override active for an employee that's already ready/active → redundant
      if ((s === "active" || s === "expiring_soon") && (r.profile_status === "ready" || r.profile_status === "active")) {
        out.push({ kind: "ready_with_override", override: r });
      }
      if (s === "expiring_soon") {
        out.push({ kind: "expiring_soon", override: r });
      }
      if (s === "expired" && r.has_active_assignment) {
        out.push({ kind: "active_assignment_expired_override", override: r });
      }
    }
    return out;
  }, [rows]);

  // ── Actions ──────────────────────────────────────────────────────────────
  async function copyAudit(o: OverrideRow) {
    try {
      await navigator.clipboard.writeText(buildAuditRow(o));
      toast({ title: "Audit row copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  async function doRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;

    const { error } = await supabase
      .from("shift_assignment_admin_overrides")
      .update({ revoked_at: new Date().toISOString(), revoked_by: uid })
      .eq("id", revokeTarget.id);

    if (error) {
      toast({ title: "Revoke failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Override revoked",
        description: `${revokeTarget.employee_name} · shift #${revokeTarget.shift_code ?? "—"}`,
      });
      // Audit trail (best-effort)
      try {
        await supabase.from("activity_log").insert({
          user_id: uid!,
          company_id: revokeTarget.company_id,
          action: "assignment_override_revoked",
          entity_type: "shift_assignment_admin_overrides",
          entity_id: revokeTarget.id,
          details: {
            shift_id: revokeTarget.shift_id,
            employee_id: revokeTarget.employee_id,
            reason: revokeTarget.reason,
          },
        } as any);
      } catch { /* ignore audit failures */ }
      setRevokeTarget(null);
      load();
    }
    setRevoking(false);
  }

  // ── Guards ───────────────────────────────────────────────────────────────
  if (!isPrivileged) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5" /> Access restricted
            </CardTitle>
            <CardDescription>
              Assignment overrides are visible only to admin, owner and developer roles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Assignment Overrides"
        subtitle="Audited operational bypasses of the employee-readiness rule. View only — create from the affected shift."
        icon={ShieldAlert}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Active" value={kpis.active} tone="earning" icon={<ShieldCheck className="h-4 w-4" />} />
        <KpiCard label="Expiring (7d)" value={kpis.expiring} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard label="Expired" value={kpis.expired} tone="muted" icon={<Calendar className="h-4 w-4" />} />
        <KpiCard label="Revoked" value={kpis.revoked} tone="deduction" icon={<ShieldX className="h-4 w-4" />} />
      </div>

      {/* Reason breakdown */}
      {kpis.byReason.size > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overrides by reason</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Array.from(kpis.byReason.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([reason, count]) => (
                <Badge key={reason} variant="outline" className="font-normal">
                  {reason} <span className="ml-1 text-muted-foreground">· {count}</span>
                </Badge>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {alerts.length} attention {alerts.length === 1 ? "item" : "items"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-48 overflow-y-auto">
            {alerts.slice(0, 30).map((a, i) => (
              <div key={i} className="text-xs flex items-start gap-2">
                <span className="mt-0.5">
                  {a.kind === "ready_with_override" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                  {a.kind === "expiring_soon" && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                  {a.kind === "active_assignment_expired_override" && (
                    <ShieldX className="h-3.5 w-3.5 text-deduction" />
                  )}
                </span>
                <span>
                  <span className="font-medium">{a.override.employee_name}</span>
                  <span className="text-muted-foreground"> · #{a.override.shift_code ?? "—"} · </span>
                  {a.kind === "ready_with_override" && (
                    <>employee is now <em>{PROFILE_STATUS_LABELS[a.override.profile_status]}</em> — override no longer needed</>
                  )}
                  {a.kind === "expiring_soon" && (
                    <>override expires {fmtRelative(a.override.expires_at)}</>
                  )}
                  {a.kind === "active_assignment_expired_override" && (
                    <>assignment is active but override expired {fmtRelative(a.override.expires_at)}</>
                  )}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employee, ID, shift, reason…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OverrideStatus | "all")}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expiring_soon">Expiring soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Shift code"
            value={shiftCodeFilter}
            onChange={(e) => setShiftCodeFilter(e.target.value)}
          />
          <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
            <SelectTrigger><SelectValue placeholder="Created by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any creator</SelectItem>
              {creators.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={expFilter} onValueChange={(v) => setExpFilter(v as typeof expFilter)}>
            <SelectTrigger><SelectValue placeholder="Expiration" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any expiration</SelectItem>
              <SelectItem value="next7">Next 7 days</SelectItem>
              <SelectItem value="next30">Next 30 days</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">{filtered.length} overrides</CardTitle>
            <CardDescription className="text-xs">
              of {rows.length} total in this company
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading overrides…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">No overrides match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Employee</th>
                    <th className="text-left px-3 py-2">Profile</th>
                    <th className="text-left px-3 py-2">Shift</th>
                    <th className="text-left px-3 py-2">Reason</th>
                    <th className="text-left px-3 py-2">Created</th>
                    <th className="text-left px-3 py-2">Expires</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const s = deriveStatus(r);
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.employee_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.employer_identification ? `#${r.employer_identification} · ` : ""}
                            <span className="font-mono">{r.employee_id.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={PROFILE_STATUS_TONES[r.profile_status]}>
                            {PROFILE_STATUS_LABELS[r.profile_status]}
                          </Badge>
                          {r.onboarding_status && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                              {r.onboarding_status}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">#{r.shift_code ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.shift_date ?? "—"} · {(r.shift_start ?? "").slice(0, 5)}–{(r.shift_end ?? "").slice(0, 5)}
                          </div>
                          {r.shift_title && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                              {r.shift_title}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 max-w-[260px]">
                          <div className="text-xs line-clamp-2">{r.reason}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs">{fmtDateTime(r.created_at)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.created_by_name ?? r.created_by.slice(0, 8)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs">{fmtDateTime(r.expires_at)}</div>
                          {r.expires_at && (
                            <div className="text-[11px] text-muted-foreground">{fmtRelative(r.expires_at)}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge>
                          {r.has_active_assignment && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">assignment active</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Copy audit row"
                              onClick={() => copyAudit(r)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button asChild size="icon" variant="ghost" title="Open employee profile">
                              <Link to={`/app/employees/${r.employee_id}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              title="Open shift detail"
                            >
                              <Link
                                to={r.shift_code ? `/app/backfill-shift/${r.shift_code}` : `/app/shifts`}
                              >
                                <Calendar className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            {(s === "active" || s === "expiring_soon") && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Revoke override"
                                onClick={() => setRevokeTarget(r)}
                              >
                                <RotateCcw className="h-3.5 w-3.5 text-deduction" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this override?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Revoking this override means future assignment attempts for this employee in this shift will
                  be blocked again by the readiness rule. <strong>Existing assignments are NOT removed.</strong>
                </div>
                {revokeTarget && (
                  <div className="rounded-md border border-border bg-muted/40 p-2 text-xs space-y-0.5">
                    <div><span className="text-muted-foreground">Employee:</span> {revokeTarget.employee_name}</div>
                    <div><span className="text-muted-foreground">Shift:</span> #{revokeTarget.shift_code ?? "—"} · {revokeTarget.shift_date}</div>
                    <div><span className="text-muted-foreground">Reason:</span> {revokeTarget.reason}</div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doRevoke} disabled={revoking}>
              {revoking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Revoke override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "earning" | "warning" | "muted" | "deduction";
  icon: React.ReactNode;
}) {
  const toneClasses: Record<typeof tone, string> = {
    earning: "border-earning/30 bg-earning/5",
    warning: "border-warning/30 bg-warning/5",
    muted: "border-border bg-muted/30",
    deduction: "border-deduction/30 bg-deduction/5",
  };
  const iconTone: Record<typeof tone, string> = {
    earning: "text-earning",
    warning: "text-warning",
    muted: "text-muted-foreground",
    deduction: "text-deduction",
  };
  return (
    <Card className={toneClasses[tone]}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={iconTone[tone]}>{icon}</div>
        </div>
        <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
