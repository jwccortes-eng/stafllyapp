/**
 * Stafly Control Tower — Developer / Global Owner Command Center
 * Route: /app/dev-command-center
 *
 * READ-ONLY Phase 1.
 * - No writes, no schema/RLS/edge changes, no payroll recalculation.
 * - Visible only to roles: developer, owner.
 * - Multi-tenant SaaS health, migration & data quality overview.
 *
 * This view is intentionally separate from the operational Command Center
 * (/app/command-center), which is per-tenant. This one is cross-tenant.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity, Building2, Users, CalendarDays, Upload, Database,
  ShieldCheck, AlertTriangle, FileWarning, Hash, Sparkles,
  ChevronRight, GitMerge, Clock, Layers, RefreshCw,
} from "lucide-react";

const sb: any = supabase;
const safeCount = (r: any) => (typeof r?.count === "number" ? r.count : 0);
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n ?? 0);
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);

// Hardcoded Quality Staff historical policy (per memory).
const QUALITY_STAFF_ID = "00000000-0000-0000-0000-000000000001";
const QS_VALIDATED = [124, 128, 129];
const QS_REVIEW = [121, 122, 123, 125];
const QS_PASSOVER = [126, 127];

type Tenant = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_sandbox: boolean;
  plan_code: string | null;
  plan_status: string | null;
  logo_url: string | null;
};

type TenantStat = {
  workersActive: number;
  workersInactive: number;
  shifts30: number;
  timeEntries30: number;
  openTimeEntries: number;
  payPeriods: number;
  imports: number;
  historicalRows: number;
  modulesEnabled: number;
};

type QSPeriodStat = { period: number; rows: number; total: number };

export default function DevCommandCenter() {
  const { user, role, loading: authLoading } = useAuth();

  // Gate: only developer/owner.
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-7 w-7 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (role !== "developer" && role !== "owner") {
    return <Navigate to="/app/command-center" replace />;
  }

  return <ControlTower displayName={user.email?.split("@")[0] ?? "Owner"} />;
}

// ─────────────────────────────────────────────────────────────────────────
function ControlTower({ displayName }: { displayName: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [snapshot, setSnapshot] = useState({
    totalCompanies: 0,
    activeCompanies: 0,
    sandboxCompanies: 0,
    companiesWithWorkers: 0,
    companiesWithShifts: 0,
    companiesWithPayroll: 0,
    companiesWithImports: 0,
    historicalRowsTotal: 0,
    historicalUnmatched: 0,
    openTimeEntriesGlobal: 0,
    placeholdersGlobal: 0,
    importsRecent: 0,
  });
  const [tenantStats, setTenantStats] = useState<Record<string, TenantStat>>({});
  const [qsPeriods, setQsPeriods] = useState<QSPeriodStat[]>([]);
  const [qsHistoricalUnmatched, setQsHistoricalUnmatched] = useState(0);
  const [globalQuality, setGlobalQuality] = useState({
    workersMissingPhone: 0,
    workersMissingEmail: 0,
    inactiveWithEntries: 0,
    timeEntriesNoShift: 0,
    openTimeEntriesOver24h: 0,
    placeholdersInShifts: 0,
  });
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  async function load(mode: "initial" | "refresh") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      // ── Companies ────────────────────────────────────────────────────
      const { data: companies } = await sb
        .from("companies")
        .select("id, name, slug, is_active, is_sandbox, plan_code, plan_status, logo_url")
        .order("name");
      const list: Tenant[] = companies ?? [];
      setTenants(list);

      const today = new Date();
      const back30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const back24h = new Date(Date.now() - 24 * 3600000).toISOString();
      const back14d = new Date(Date.now() - 14 * 86400000).toISOString();

      // ── Per-tenant counts (sequential per tenant, parallel within) ──
      const stats: Record<string, TenantStat> = {};
      let withWorkers = 0, withShifts = 0, withPayroll = 0, withImports = 0;

      await Promise.all(
        list.map(async (c) => {
          const [
            wA, wI, sh30, te30, openTE, pp, imp, hist, mods,
          ] = await Promise.all([
            sb.from("employees").select("id", { count: "exact", head: true })
              .eq("company_id", c.id).eq("is_active", true),
            sb.from("employees").select("id", { count: "exact", head: true })
              .eq("company_id", c.id).eq("is_active", false),
            sb.from("scheduled_shifts").select("id", { count: "exact", head: true })
              .eq("company_id", c.id).gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
              .is("deleted_at", null),
            sb.from("time_entries").select("id", { count: "exact", head: true })
              .eq("company_id", c.id).gte("clock_in", back30),
            sb.from("time_entries").select("id", { count: "exact", head: true })
              .eq("company_id", c.id).is("clock_out", null),
            sb.from("pay_periods").select("id", { count: "exact", head: true })
              .eq("company_id", c.id),
            sb.from("imports").select("id", { count: "exact", head: true })
              .eq("company_id", c.id),
            sb.from("historical_payroll_entries").select("id", { count: "exact", head: true })
              .eq("company_id", c.id),
            sb.from("company_modules").select("id", { count: "exact", head: true })
              .eq("company_id", c.id).eq("is_active", true),
          ]);

          const wsActive = safeCount(wA);
          const wsInactive = safeCount(wI);
          const shifts = safeCount(sh30);
          const periods = safeCount(pp);
          const imports = safeCount(imp);

          if (wsActive + wsInactive > 0) withWorkers++;
          if (shifts > 0) withShifts++;
          if (periods > 0) withPayroll++;
          if (imports > 0) withImports++;

          stats[c.id] = {
            workersActive: wsActive,
            workersInactive: wsInactive,
            shifts30: shifts,
            timeEntries30: safeCount(te30),
            openTimeEntries: safeCount(openTE),
            payPeriods: periods,
            imports,
            historicalRows: safeCount(hist),
            modulesEnabled: safeCount(mods),
          };
        })
      );
      setTenantStats(stats);

      // ── Global aggregates ───────────────────────────────────────────
      const [histAll, histUnmatched, openTEGlobal, importsRecent] = await Promise.all([
        sb.from("historical_payroll_entries").select("id", { count: "exact", head: true }),
        sb.from("historical_payroll_entries").select("id", { count: "exact", head: true })
          .is("matched_employee_id", null),
        sb.from("time_entries").select("id", { count: "exact", head: true }).is("clock_out", null),
        sb.from("imports").select("id", { count: "exact", head: true }).gte("created_at", back14d),
      ]);

      // Placeholders heuristic (best-effort, optional columns).
      let placeholdersGlobal = 0;
      try {
        const { count } = await sb.from("employees")
          .select("id", { count: "exact", head: true })
          .or("payroll_safe.eq.false,person_type_guess.in.(placeholder,system,external,agency)");
        placeholdersGlobal = count ?? 0;
      } catch { /* columns may not exist on this schema */ }

      // Data quality globals
      const [missPhone, missEmail, openOver24h, teNoShift] = await Promise.all([
        sb.from("employees").select("id", { count: "exact", head: true })
          .eq("is_active", true).is("phone_number", null),
        sb.from("employees").select("id", { count: "exact", head: true })
          .eq("is_active", true).is("email", null),
        sb.from("time_entries").select("id", { count: "exact", head: true })
          .is("clock_out", null).lt("clock_in", back24h),
        sb.from("time_entries").select("id", { count: "exact", head: true })
          .is("shift_id", null),
      ]);

      setGlobalQuality({
        workersMissingPhone: safeCount(missPhone),
        workersMissingEmail: safeCount(missEmail),
        inactiveWithEntries: 0, // requires join — skipped in Phase 1 to keep read cost low
        timeEntriesNoShift: safeCount(teNoShift),
        openTimeEntriesOver24h: safeCount(openOver24h),
        placeholdersInShifts: 0,
      });

      setSnapshot({
        totalCompanies: list.length,
        activeCompanies: list.filter((c) => c.is_active).length,
        sandboxCompanies: list.filter((c) => c.is_sandbox).length,
        companiesWithWorkers: withWorkers,
        companiesWithShifts: withShifts,
        companiesWithPayroll: withPayroll,
        companiesWithImports: withImports,
        historicalRowsTotal: safeCount(histAll),
        historicalUnmatched: safeCount(histUnmatched),
        openTimeEntriesGlobal: safeCount(openTEGlobal),
        placeholdersGlobal,
        importsRecent: safeCount(importsRecent),
      });

      // ── Quality Staff per-period historical totals ──────────────────
      const allQS = [...QS_VALIDATED, ...QS_REVIEW, ...QS_PASSOVER];
      const { data: qsPeriodRows } = await sb
        .from("pay_periods")
        .select("id, sequence_number")
        .eq("company_id", QUALITY_STAFF_ID)
        .in("sequence_number", allQS);
      const periodIdToSeq = new Map<string, number>();
      (qsPeriodRows ?? []).forEach((p: any) => periodIdToSeq.set(p.id, Number(p.sequence_number)));

      const periodIds = Array.from(periodIdToSeq.keys());
      let qsRows: any[] = [];
      if (periodIds.length > 0) {
        const { data } = await sb
          .from("historical_payroll_entries")
          .select("period_id, base_total_pay")
          .eq("company_id", QUALITY_STAFF_ID)
          .in("period_id", periodIds);
        qsRows = data ?? [];
      }
      const map = new Map<number, { rows: number; total: number }>();
      qsRows.forEach((r: any) => {
        const k = periodIdToSeq.get(r.period_id);
        if (k === undefined) return;
        if (!map.has(k)) map.set(k, { rows: 0, total: 0 });
        const e = map.get(k)!;
        e.rows += 1;
        e.total += Number(r.base_total_pay ?? 0);
      });
      setQsPeriods(allQS.map((p) => ({ period: p, rows: map.get(p)?.rows ?? 0, total: map.get(p)?.total ?? 0 })));

      const { count: qsUnmatched } = await sb
        .from("historical_payroll_entries").select("id", { count: "exact", head: true })
        .eq("company_id", QUALITY_STAFF_ID).is("matched_employee_id", null);
      setQsHistoricalUnmatched(qsUnmatched ?? 0);

      setLastUpdatedAt(new Date());
    } catch (e) {
      console.warn("[ControlTower] load failed:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load("initial");
    document.title = "Stafly Control Tower";
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Stafly Control Tower
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Multi-tenant SaaS health, migrations, data quality and operational command.
              </p>
            </div>
            <Badge variant="outline" className="ml-2 border-amber-500/30 bg-amber-500/10 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Owner · Read-only
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdatedAt && (
            <span className="text-[11px] text-muted-foreground">
              Updated {lastUpdatedAt.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline" size="sm"
            onClick={() => load("refresh")}
            disabled={refreshing || loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            <span className="ml-1.5 text-xs">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── Snapshot grid ───────────────────────────────────────────── */}
      <SnapshotGrid loading={loading} snapshot={snapshot} />

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="migration">Migration · Quality Staff</TabsTrigger>
          <TabsTrigger value="quality">Data Quality</TabsTrigger>
          <TabsTrigger value="actions">Action Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewPanel snapshot={snapshot} loading={loading} />
        </TabsContent>

        <TabsContent value="tenants" className="space-y-3">
          <TenantsTable tenants={tenants} stats={tenantStats} loading={loading} />
        </TabsContent>

        <TabsContent value="migration" className="space-y-4">
          <QualityStaffMigrationPanel
            periods={qsPeriods}
            unmatched={qsHistoricalUnmatched}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="quality" className="space-y-3">
          <DataQualityPanel quality={globalQuality} snapshot={snapshot} loading={loading} />
        </TabsContent>

        <TabsContent value="actions" className="space-y-3">
          <ActionQueuePanel snapshot={snapshot} unmatchedQS={qsHistoricalUnmatched} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Snapshot ────────────────────────────────────────────────────────────
function SnapshotGrid({ loading, snapshot }: { loading: boolean; snapshot: any }) {
  const cells = [
    { label: "Total tenants", value: snapshot.totalCompanies, icon: Building2, helper: `${snapshot.activeCompanies} active` },
    { label: "With workers", value: snapshot.companiesWithWorkers, icon: Users },
    { label: "With shifts (30d)", value: snapshot.companiesWithShifts, icon: CalendarDays },
    { label: "With payroll", value: snapshot.companiesWithPayroll, icon: Database },
    { label: "With imports", value: snapshot.companiesWithImports, icon: Upload },
    { label: "Historical rows", value: snapshot.historicalRowsTotal, icon: Layers, helper: `${snapshot.historicalUnmatched} unmatched` },
    { label: "Open time entries", value: snapshot.openTimeEntriesGlobal, icon: Clock, tone: snapshot.openTimeEntriesGlobal > 0 ? "warn" : "good" },
    { label: "Imports (14d)", value: snapshot.importsRecent, icon: Activity },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className={cn(
            (c as any).tone === "warn" && "ring-1 ring-amber-500/20"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {c.label}
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {loading ? <Skeleton className="h-7 w-16" /> : fmt(c.value)}
              </div>
              {c.helper && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{c.helper}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function OverviewPanel({ snapshot, loading }: { snapshot: any; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          SaaS health summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Read-only Phase 1 view. All counts are live from the database, scoped across all tenants accessible to your owner role.
        </p>
        <ul className="space-y-1.5">
          <li>• <strong>{fmt(snapshot.totalCompanies)}</strong> tenants registered, <strong>{fmt(snapshot.activeCompanies)}</strong> active.</li>
          <li>• <strong>{fmt(snapshot.historicalRowsTotal)}</strong> historical payroll rows mirrored, <strong>{fmt(snapshot.historicalUnmatched)}</strong> unmatched.</li>
          <li>• <strong>{fmt(snapshot.openTimeEntriesGlobal)}</strong> time entries currently open across the platform.</li>
          <li>• <strong>{fmt(snapshot.importsRecent)}</strong> imports executed in the last 14 days.</li>
        </ul>
        {loading && <Skeleton className="h-3 w-32" />}
      </CardContent>
    </Card>
  );
}

// ─── Tenants table ───────────────────────────────────────────────────────
function TenantsTable({
  tenants, stats, loading,
}: { tenants: Tenant[]; stats: Record<string, TenantStat>; loading: boolean }) {
  if (loading && tenants.length === 0) {
    return <Skeleton className="h-48 w-full" />;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left p-3">Tenant</th>
                <th className="text-right p-3">Workers</th>
                <th className="text-right p-3">Shifts 30d</th>
                <th className="text-right p-3">Time entries 30d</th>
                <th className="text-right p-3">Open TE</th>
                <th className="text-right p-3">Periods</th>
                <th className="text-right p-3">Imports</th>
                <th className="text-right p-3">Historical</th>
                <th className="text-right p-3">Modules</th>
                <th className="text-right p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const s = stats[t.id];
                return (
                  <tr key={t.id} className="border-b hover:bg-muted/20">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-[11px] font-semibold uppercase">
                          {t.name.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{t.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">/{t.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {s ? `${fmt(s.workersActive)} / ${fmt(s.workersInactive)}` : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums">{s ? fmt(s.shifts30) : "—"}</td>
                    <td className="p-3 text-right tabular-nums">{s ? fmt(s.timeEntries30) : "—"}</td>
                    <td className={cn("p-3 text-right tabular-nums",
                      s && s.openTimeEntries > 0 && "text-amber-600 font-semibold")}>
                      {s ? fmt(s.openTimeEntries) : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums">{s ? fmt(s.payPeriods) : "—"}</td>
                    <td className="p-3 text-right tabular-nums">{s ? fmt(s.imports) : "—"}</td>
                    <td className="p-3 text-right tabular-nums">{s ? fmt(s.historicalRows) : "—"}</td>
                    <td className="p-3 text-right tabular-nums">{s ? fmt(s.modulesEnabled) : "—"}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {t.is_sandbox && <Badge variant="outline" className="text-[10px]">sandbox</Badge>}
                        {!t.is_active && <Badge variant="secondary" className="text-[10px]">inactive</Badge>}
                        {t.is_active && !t.is_sandbox && <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">active</Badge>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Quality Staff migration panel ──────────────────────────────────────
function QualityStaffMigrationPanel({
  periods, unmatched, loading,
}: { periods: QSPeriodStat[]; unmatched: number; loading: boolean }) {
  const groupOf = (p: number): "validated" | "review" | "passover" => {
    if (QS_VALIDATED.includes(p)) return "validated";
    if (QS_REVIEW.includes(p)) return "review";
    return "passover";
  };
  const tone = (g: string) =>
    g === "validated" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : g === "review" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
    : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400";
  const label = (g: string) =>
    g === "validated" ? "Validated" : g === "review" ? "Review" : "PASSOVER blocked";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Quality Staff — historical payroll closeout
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {periods.map((p) => {
              const g = groupOf(p.period);
              return (
                <div key={p.period} className={cn("rounded-lg border p-3", tone(g))}>
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                      Period #{p.period}
                    </div>
                    <Badge variant="outline" className="text-[10px] border-current">
                      {label(g)}
                    </Badge>
                  </div>
                  <div className="mt-2 text-lg font-semibold tabular-nums">
                    {loading ? <Skeleton className="h-6 w-20" /> : money(p.total)}
                  </div>
                  <div className="text-[11px] opacity-80">{fmt(p.rows)} rows</div>
                </div>
              );
            })}
          </div>
          <div className="rounded-md border bg-muted/20 p-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              <strong>{fmt(unmatched)}</strong> unmatched historical payroll rows pending identity review.
            </div>
            <Link to="/app/periods" className="mt-1 inline-flex items-center gap-1 text-primary font-medium">
              Open Pay Periods <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Data Quality ────────────────────────────────────────────────────────
function DataQualityPanel({
  quality, snapshot, loading,
}: { quality: any; snapshot: any; loading: boolean }) {
  const issues = [
    {
      severity: "high", label: "Open time entries > 24h", count: quality.openTimeEntriesOver24h,
      reason: "Stale clocks distort attendance and integrity.", to: "/app/timeclock", icon: Clock,
    },
    {
      severity: "high", label: "Time entries without shift_id", count: quality.timeEntriesNoShift,
      reason: "Cannot reconcile payroll without scheduled shift link.", to: "/app/timeclock", icon: FileWarning,
    },
    {
      severity: "high", label: "Unmatched historical payroll rows", count: snapshot.historicalUnmatched,
      reason: "Connecteam payroll rows pending identity match.", to: "/app/periods", icon: Hash,
    },
    {
      severity: "medium", label: "Active workers without phone", count: quality.workersMissingPhone,
      reason: "Phone is required for portal/WhatsApp activation.", to: "/app/employees", icon: Users,
    },
    {
      severity: "medium", label: "Active workers without email", count: quality.workersMissingEmail,
      reason: "Reduces invitation deliverability.", to: "/app/employees", icon: Users,
    },
    {
      severity: "info", label: "Placeholder / system records", count: snapshot.placeholdersGlobal,
      reason: "Non-real records that must stay excluded from payroll.", to: "/app/employees", icon: GitMerge,
    },
  ];
  if (loading) return <Skeleton className="h-40 w-full" />;
  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {issues.map((i) => {
          const tone =
            i.severity === "high" ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
            : i.severity === "medium" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
            : "bg-muted text-muted-foreground border-border";
          const Icon = i.icon;
          return (
            <Link key={i.label} to={i.to} className="flex items-start gap-3 p-3 hover:bg-muted/30">
              <div className={cn("rounded-md border p-1.5", tone)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{i.label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {fmt(i.count)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{i.reason}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 mt-1.5" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Action Queue ────────────────────────────────────────────────────────
function ActionQueuePanel({ snapshot, unmatchedQS }: { snapshot: any; unmatchedQS: number }) {
  const items = [
    {
      priority: "critical", title: "Quality Staff: PASSOVER #126 / #127 split policy",
      reason: "Raw row-date file required to safely split passover periods.",
      cta: "Prepare fix plan", to: "/app/periods",
    },
    {
      priority: "high", title: "Quality Staff: Review periods #121/#122/#123/#125",
      reason: "Decide replace / merge / skip / document_only per period.",
      cta: "Open review board", to: "/app/periods",
    },
    {
      priority: "high", title: `Resolve ${fmt(unmatchedQS)} unmatched Quality Staff historical rows`,
      reason: "Identity review needed before publishing closed periods.",
      cta: "Open historical entries", to: "/app/periods",
    },
    {
      priority: snapshot.openTimeEntriesGlobal > 0 ? "medium" : "info",
      title: `Cross-tenant: ${fmt(snapshot.openTimeEntriesGlobal)} open time entries`,
      reason: "Open clocks can distort payroll if left unattended.",
      cta: "Open Time Clock", to: "/app/timeclock",
    },
    {
      priority: "info", title: "Upload next Connecteam payroll final file",
      reason: "Pilot pipeline ready beyond #129.",
      cta: "Open Pay Periods", to: "/app/periods",
    },
  ];

  const order: any = { critical: 0, high: 1, medium: 2, info: 3 };
  items.sort((a, b) => order[a.priority] - order[b.priority]);

  const meta: any = {
    critical: { tone: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20", label: "Critical" },
    high: { tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", label: "High" },
    medium: { tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20", label: "Medium" },
    info: { tone: "bg-muted text-muted-foreground border-border", label: "Info" },
  };

  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {items.map((i) => {
          const m = meta[i.priority];
          return (
            <Link key={i.title} to={i.to} className="flex items-start gap-3 p-3 hover:bg-muted/30 group">
              <div className={cn("rounded-md border p-1.5", m.tone)}>
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px] border-0", m.tone)}>
                    {m.label}
                  </Badge>
                  <span className="text-sm font-semibold">{i.title}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{i.reason}</p>
                <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  {i.cta} <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
