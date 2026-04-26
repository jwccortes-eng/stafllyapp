/**
 * Command Center — Premium operational home for /app/command-center
 *
 * Phase UX 1 — READ-ONLY + deep links.
 * - No payroll calculations
 * - No mutations
 * - No schema changes
 * - Multi-tenant: respects selectedCompanyId, supports Global hybrid view
 *
 * All queries are scoped by company_id when one is selected. In Global mode
 * (developer/owner with no company), we render an aggregated summary across
 * accessible companies plus a per-company mini-pulse selector.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Activity, Users, CalendarDays, Clock, ShieldCheck, Building2,
  Upload, GitMerge, DollarSign, MapPin, Inbox, Settings2,
  ArrowRight, AlertTriangle, CheckCircle2, ChevronRight, Sparkles,
  UserPlus, Mail, Layers, Radio, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────
type Severity = "info" | "warn" | "critical";
type Pulse = {
  key: string;
  label: string;
  value: string;
  helper: string;
  pct: number; // 0..100, used for progress + tone
  tone: "good" | "warn" | "bad" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
};
type RecommendedAction = {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  cta: string;
  href: string;
  count?: number;
  icon: React.ComponentType<{ className?: string }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
const safeCount = (res: any) => (typeof res?.count === "number" ? res.count : 0);
const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const initials = (name?: string | null) =>
  (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "U";

// ─── Pulse Card ───────────────────────────────────────────────────────────
function PulseCard({ pulse, loading }: { pulse: Pulse; loading: boolean }) {
  const Icon = pulse.icon;
  const toneRing = {
    good: "ring-1 ring-emerald-500/20",
    warn: "ring-1 ring-amber-500/30",
    bad: "ring-1 ring-rose-500/30",
    neutral: "ring-1 ring-border",
  }[pulse.tone];
  const toneText = {
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-rose-600 dark:text-rose-400",
    neutral: "text-muted-foreground",
  }[pulse.tone];
  const toneBar = {
    good: "[&>div]:bg-emerald-500",
    warn: "[&>div]:bg-amber-500",
    bad: "[&>div]:bg-rose-500",
    neutral: "",
  }[pulse.tone];

  const Inner = (
    <Card className={cn("transition-shadow hover:shadow-md", toneRing)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-muted p-1.5">
              <Icon className={cn("h-4 w-4", toneText)} />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{pulse.label}</span>
          </div>
          {pulse.href && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="mt-3 space-y-1">
          {loading ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <div className="text-2xl font-semibold tracking-tight">{pulse.value}</div>
          )}
          <p className="text-xs text-muted-foreground">{pulse.helper}</p>
        </div>
        <Progress value={pulse.pct} className={cn("mt-3 h-1.5", toneBar)} />
      </CardContent>
    </Card>
  );

  return pulse.href ? <Link to={pulse.href} className="block">{Inner}</Link> : Inner;
}

// ─── Recommended Action Item ──────────────────────────────────────────────
function ActionItem({ action }: { action: RecommendedAction }) {
  const Icon = action.icon;
  const sev = {
    info: "text-sky-600 bg-sky-500/10 border-sky-500/20",
    warn: "text-amber-600 bg-amber-500/10 border-amber-500/20",
    critical: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  }[action.severity];
  const sevLabel = {
    info: "Info",
    warn: "Atención",
    critical: "Crítico",
  }[action.severity];

  return (
    <Link
      to={action.href}
      className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
    >
      <div className={cn("mt-0.5 rounded-md border p-2", sev)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-medium">{action.title}</h4>
          {typeof action.count === "number" && action.count > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {action.count}
            </Badge>
          )}
          <Badge variant="outline" className={cn("ml-auto h-5 border-0 px-1.5 text-[10px]", sev)}>
            {sevLabel}
          </Badge>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{action.description}</p>
        <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary">
          <span>{action.cta}</span>
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

// ─── Ecosystem Tile ───────────────────────────────────────────────────────
function EcosystemTile({
  to, icon: Icon, title, subtitle,
}: { to: string; icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <div className="rounded-md bg-muted p-2 transition-colors group-hover:bg-primary/10">
        <Icon className="h-4 w-4 text-foreground/80 group-hover:text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════
export default function CommandCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    selectedCompany, selectedCompanyId, companies, isGlobalMode,
    canUseGlobalMode, switchCompany, loading: companyLoading,
  } = useCompany();

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const displayName =
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.name ||
    user?.email?.split("@")[0] ||
    "Admin";

  // ── If no company selected and not global → show selector ──────────────
  if (!companyLoading && !selectedCompanyId && !isGlobalMode) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Selecciona una compañía
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              El Command Center necesita una compañía activa para mostrar tus indicadores operativos.
            </p>
            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => switchCompany(c.id)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(c.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">/{c.slug}</div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return isGlobalMode && !selectedCompanyId
    ? <GlobalCommandCenter
        companies={companies}
        switchCompany={switchCompany}
        displayName={displayName}
        greeting={greeting}
      />
    : <CompanyCommandCenter
        companyId={selectedCompanyId!}
        companyName={selectedCompany?.name ?? "—"}
        displayName={displayName}
        greeting={greeting}
        canUseGlobalMode={canUseGlobalMode}
        switchCompany={switchCompany}
      />;
}

// ═════════════════════════════════════════════════════════════════════════
// COMPANY VIEW
// ═════════════════════════════════════════════════════════════════════════
function CompanyCommandCenter({
  companyId, companyName, displayName, greeting, canUseGlobalMode, switchCompany,
}: {
  companyId: string;
  companyName: string;
  displayName: string;
  greeting: string;
  canUseGlobalMode: boolean;
  switchCompany: (id: string | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const [data, setData] = useState({
    employeesTotal: 0,
    employeesActive: 0,
    shiftsToday: 0,
    shiftsTodayCovered: 0,
    shiftsUpcoming7: 0,
    shiftsUpcoming7Covered: 0,
    pendingConfirmations: 0,
    timeEntriesToday: 0,
    workersAssignedToday: 0,
    incompleteShifts: 0,
    duplicates: 0,
    failedInvitations: 0,
    pendingActivations: 0,
    openPayPeriods: 0,
    openTickets: 0,
    activeClients: 0,
    activeLocations: 0,
    hasShifts: false,
  });

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const today = todayStr();
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      // Split into smaller Promise.all batches to avoid TS deep-instantiation.
      const batchA = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("is_active", true),
        supabase.from("employees").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("is_active", true).not("user_id", "is", null),
        supabase.from("scheduled_shifts").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("date", today).is("deleted_at", null),
        supabase.from("scheduled_shifts").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).gte("date", today).lte("date", in7).is("deleted_at", null),
        supabase.from("shift_assignments").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("status", "pending"),
        supabase.from("time_entries").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).gte("clock_in_time", `${today}T00:00:00`),
      ]);
      const [empTotal, empActive, shiftsToday, shiftsUpcoming, pendConf, timeToday] = batchA;

      // Cast supabase calls to `any` to avoid TS2589 deep instantiation across many tables.
      const sb: any = supabase;
      const [failedInv, openPeriods, openTickets, clients, locations, anyShift] = await Promise.all<any>([
        sb.from("employee_invitations").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("status", "failed"),
        sb.from("pay_periods").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("status", "open"),
        sb.from("service_requests").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).in("status", ["new", "reviewing", "approved_for_scheduling"]),
        sb.from("clients").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("is_active", true),
        sb.from("locations").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("is_active", true),
        sb.from("scheduled_shifts").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("deleted_at", null),
      ]);
      const dup = { count: 0 }; // worker_duplicate_candidates table not present in this project

      // Derived: covered shifts today (need shift_ids first to avoid heavy join)
      let coveredToday = 0;
      let assignedWorkersToday = 0;
      let incompleteShifts = 0;
      const { data: todayShiftIds } = await supabase
        .from("scheduled_shifts")
        .select("id, required_employees")
        .eq("company_id", companyId)
        .eq("date", today)
        .is("deleted_at", null)
        .limit(500);
      if (todayShiftIds && todayShiftIds.length > 0) {
        const ids = todayShiftIds.map((s: any) => s.id);
        const { data: assigns } = await supabase
          .from("shift_assignments")
          .select("shift_id, employee_id, status")
          .eq("company_id", companyId)
          .in("shift_id", ids)
          .in("status", ["confirmed", "accepted", "pending"]);
        const byShift = new Map<string, number>();
        const empSet = new Set<string>();
        (assigns ?? []).forEach((a: any) => {
          byShift.set(a.shift_id, (byShift.get(a.shift_id) ?? 0) + 1);
          if (a.employee_id) empSet.add(a.employee_id);
        });
        assignedWorkersToday = empSet.size;
        coveredToday = todayShiftIds.filter((s: any) => {
          const need = (s.required_employees as number) ?? 1;
          const got = byShift.get(s.id) ?? 0;
          return got >= need;
        }).length;
        incompleteShifts = todayShiftIds.length - coveredToday;
      }

      // Pending activations: invitations sent/queued but not yet activated
      const { count: pendingActCount } = await supabase
        .from("employee_invitations")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", ["sent", "delivered", "queued"]);

      if (cancelledRef.current) return;
      setData({
        employeesTotal: safeCount(empTotal),
        employeesActive: safeCount(empActive),
        shiftsToday: safeCount(shiftsToday),
        shiftsTodayCovered: coveredToday,
        shiftsUpcoming7: safeCount(shiftsUpcoming),
        shiftsUpcoming7Covered: coveredToday, // best-effort, refined below if needed
        pendingConfirmations: safeCount(pendConf),
        timeEntriesToday: safeCount(timeToday),
        workersAssignedToday: assignedWorkersToday,
        incompleteShifts,
        duplicates: safeCount(dup),
        failedInvitations: safeCount(failedInv),
        pendingActivations: pendingActCount ?? 0,
        openPayPeriods: safeCount(openPeriods),
        openTickets: safeCount(openTickets),
        activeClients: safeCount(clients),
        activeLocations: safeCount(locations),
        hasShifts: safeCount(anyShift) > 0,
      });
      setLastUpdatedAt(new Date());
      setLoadError(null);
    } catch (e: any) {
      console.warn("[CommandCenter] load failed:", e);
      // Keep previous data on failure — only surface a discreet warning.
      if (!cancelledRef.current) {
        setLoadError(e?.message ?? "No se pudieron actualizar los datos");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [companyId]);

  useEffect(() => {
    cancelledRef.current = false;
    void load("initial");
    return () => { cancelledRef.current = true; };
  }, [load]);

  // ── Build pulses ────────────────────────────────────────────────────────
  const activationPct = pctOf(data.employeesActive, data.employeesTotal);
  const coveragePct = pctOf(data.shiftsTodayCovered, data.shiftsToday);
  const attendancePct = pctOf(data.timeEntriesToday, Math.max(data.workersAssignedToday, 1));
  const payrollOk = data.openPayPeriods <= 1; // 1 open is normal; >1 is risky
  const minimalConfigOk = data.activeClients > 0 && data.activeLocations > 0 && data.employeesTotal > 0;

  const pulses: Pulse[] = [
    {
      key: "activation",
      label: "Activation",
      value: `${activationPct}%`,
      helper: `${data.employeesActive} de ${data.employeesTotal} workers activos`,
      pct: activationPct,
      tone: activationPct >= 80 ? "good" : activationPct >= 50 ? "warn" : "bad",
      icon: UserPlus,
      href: "/app/employees",
    },
    {
      key: "coverage",
      label: "Coverage hoy",
      value: data.shiftsToday > 0 ? `${coveragePct}%` : "—",
      helper: data.shiftsToday > 0
        ? `${data.shiftsTodayCovered}/${data.shiftsToday} shifts cubiertos`
        : "Sin shifts hoy",
      pct: coveragePct,
      tone: data.shiftsToday === 0 ? "neutral" : coveragePct >= 95 ? "good" : coveragePct >= 70 ? "warn" : "bad",
      icon: CalendarDays,
      href: "/app/shifts",
    },
    {
      key: "attendance",
      label: "Attendance hoy",
      value: data.workersAssignedToday > 0 ? `${attendancePct}%` : "—",
      helper: `${data.timeEntriesToday} fichajes / ${data.workersAssignedToday} asignados`,
      pct: attendancePct,
      tone: data.workersAssignedToday === 0 ? "neutral" : attendancePct >= 80 ? "good" : attendancePct >= 50 ? "warn" : "bad",
      icon: Clock,
      href: "/app/timeclock",
    },
    {
      key: "payroll",
      label: "Payroll Readiness",
      value: data.openPayPeriods === 0 ? "✓" : `${data.openPayPeriods}`,
      helper: data.openPayPeriods === 0
        ? "Sin periodos abiertos"
        : `${data.openPayPeriods} periodo(s) abierto(s)`,
      pct: payrollOk ? 100 : 50,
      tone: payrollOk ? "good" : "warn",
      icon: DollarSign,
      href: "/app/periods",
    },
    {
      key: "health",
      label: "Company Health",
      value: minimalConfigOk ? "Listo" : "Incompleto",
      helper: minimalConfigOk
        ? `${data.activeClients} clientes · ${data.activeLocations} ubicaciones`
        : "Faltan clientes, ubicaciones o workers",
      pct: minimalConfigOk ? 100 : 40,
      tone: minimalConfigOk ? "good" : "warn",
      icon: ShieldCheck,
      href: "/app/company-config",
    },
  ];

  // ── Operational status message ─────────────────────────────────────────
  const issuesCount =
    (coveragePct < 95 && data.shiftsToday > 0 ? 1 : 0) +
    (data.failedInvitations > 0 ? 1 : 0) +
    (data.duplicates > 0 ? 1 : 0) +
    (data.openPayPeriods > 1 ? 1 : 0) +
    (!minimalConfigOk ? 1 : 0);
  const allGood = issuesCount === 0;

  // ── Recommended actions ────────────────────────────────────────────────
  const actions: RecommendedAction[] = [];
  if (data.pendingActivations > 0) {
    actions.push({
      id: "act-pending",
      title: "Workers pendientes de activación",
      description: "Invitaciones enviadas que aún no han sido activadas por el worker.",
      severity: "info",
      cta: "Ver invitaciones",
      href: "/app/invite",
      count: data.pendingActivations,
      icon: UserPlus,
    });
  }
  if (data.failedInvitations > 0) {
    actions.push({
      id: "act-failed-emails",
      title: "Invitaciones con error de envío",
      description: "Correos de invitación que fallaron en la entrega. Revisa direcciones o reintenta.",
      severity: "critical",
      cta: "Revisar invitaciones",
      href: "/app/invite",
      count: data.failedInvitations,
      icon: Mail,
    });
  }
  if (data.incompleteShifts > 0) {
    actions.push({
      id: "act-incomplete",
      title: "Shifts incompletos hoy",
      description: "Turnos con plazas sin cubrir. Asigna workers o publica para reclamo.",
      severity: data.incompleteShifts > 3 ? "critical" : "warn",
      cta: "Ir a Shifts",
      href: "/app/shifts",
      count: data.incompleteShifts,
      icon: AlertTriangle,
    });
  }
  if (data.pendingConfirmations > 0) {
    actions.push({
      id: "act-pending-conf",
      title: "Confirmaciones pendientes",
      description: "Workers que no han aceptado/rechazado su asignación.",
      severity: "warn",
      cta: "Revisar pendientes",
      href: "/app/shifts",
      count: data.pendingConfirmations,
      icon: CheckCircle2,
    });
  }
  if (data.duplicates > 0) {
    actions.push({
      id: "act-dups",
      title: "Posibles duplicados de empleados",
      description: "Candidatos detectados por el motor de matching. Revisa y consolida.",
      severity: "warn",
      cta: "Abrir Merge",
      href: "/app/employees/merge",
      count: data.duplicates,
      icon: GitMerge,
    });
  }
  if (data.openPayPeriods > 1) {
    actions.push({
      id: "act-periods",
      title: "Periodos de payroll abiertos",
      description: "Hay más de un periodo abierto. Cierra periodos pasados para mantener integridad.",
      severity: "warn",
      cta: "Ver periodos",
      href: "/app/periods",
      count: data.openPayPeriods,
      icon: DollarSign,
    });
  }
  if (data.openTickets > 0) {
    actions.push({
      id: "act-tickets",
      title: "Tickets/Requests abiertos",
      description: "Solicitudes de servicio o tickets internos pendientes de atención.",
      severity: "info",
      cta: "Ver tickets",
      href: "/app/requests",
      count: data.openTickets,
      icon: Inbox,
    });
  }

  // ── Empty state premium ────────────────────────────────────────────────
  const showEmptyState = !loading && !data.hasShifts && data.employeesTotal === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-muted/30 p-5 md:p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Radio className="h-3.5 w-3.5" />
              <span>Command Center</span>
              <span>·</span>
              <span>{format(new Date(), "EEE d MMM · HH:mm")}</span>
              {lastUpdatedAt && (
                <>
                  <span>·</span>
                  <span>Last updated: {format(lastUpdatedAt, "HH:mm")}</span>
                </>
              )}
              {refreshing && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Actualizando…
                  </span>
                </>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {greeting}, {displayName}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>{companyName}</span>
              {canUseGlobalMode && (
                <>
                  <span>·</span>
                  <button
                    onClick={() => switchCompany(null)}
                    className="text-primary hover:underline"
                  >
                    Vista global
                  </button>
                </>
              )}
            </div>
            {loadError && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                <span>No se pudo actualizar. Mostrando últimos datos disponibles.</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load("refresh")}
              disabled={loading || refreshing}
              className="gap-2"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              Refresh
            </Button>
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                allGood
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
              )}
            >
              {allGood ? <Sparkles className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span className="font-medium">
                {allGood
                  ? "Tu operación está bajo control"
                  : `${issuesCount} ${issuesCount === 1 ? "área requiere" : "áreas requieren"} atención`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {showEmptyState ? (
        <EmptyStatePremium />
      ) : (
        <>
          {/* Operational Pulse */}
          <section className="space-y-3">
            <SectionHeader icon={Activity} title="Operational Pulse" subtitle="Indicadores clave en tiempo real" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {pulses.map((p) => <PulseCard key={p.key} pulse={p} loading={loading} />)}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Today snapshot */}
            <section className="space-y-3 lg:col-span-1">
              <SectionHeader icon={CalendarDays} title="Hoy" subtitle={format(new Date(), "EEEE d 'de' MMMM")} />
              <Card>
                <CardContent className="divide-y p-0">
                  <SnapshotRow label="Shifts programados" value={data.shiftsToday} href="/app/shifts" />
                  <SnapshotRow label="Workers asignados" value={data.workersAssignedToday} href="/app/shifts" />
                  <SnapshotRow label="Shifts incompletos" value={data.incompleteShifts} tone={data.incompleteShifts > 0 ? "warn" : "neutral"} href="/app/shifts" />
                  <SnapshotRow label="Confirmaciones pendientes" value={data.pendingConfirmations} tone={data.pendingConfirmations > 0 ? "warn" : "neutral"} href="/app/shifts" />
                  <SnapshotRow label="Fichajes registrados" value={data.timeEntriesToday} href="/app/timeclock" />
                </CardContent>
              </Card>
            </section>

            {/* Recommended actions */}
            <section className="space-y-3 lg:col-span-2">
              <SectionHeader icon={Sparkles} title="Recomendaciones priorizadas" subtitle="Acciones que puedes resolver ahora" />
              {actions.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center gap-3 p-6">
                    <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Sin acciones pendientes</div>
                      <div className="text-xs text-muted-foreground">
                        Tu operación no tiene alertas accionables en este momento.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {actions.map((a) => <ActionItem key={a.id} action={a} />)}
                </div>
              )}
            </section>
          </div>

          {/* Ecosystem */}
          <section className="space-y-3">
            <SectionHeader icon={Layers} title="Ecosistema" subtitle="Acceso rápido a tus módulos" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              <EcosystemTile to="/app/employees" icon={Users} title="Workers" subtitle={`${data.employeesTotal} totales`} />
              <EcosystemTile to="/app/shifts" icon={CalendarDays} title="Shifts" subtitle={`${data.shiftsUpcoming7} próximos 7 días`} />
              <EcosystemTile to="/app/import-schedule" icon={Upload} title="Import Schedule" subtitle="Cargar planning" />
              <EcosystemTile to="/app/employees/merge" icon={GitMerge} title="Employee Merge" subtitle={`${data.duplicates} candidatos`} />
              <EcosystemTile to="/app/periods" icon={DollarSign} title="Payroll" subtitle={`${data.openPayPeriods} abierto(s)`} />
              <EcosystemTile to="/app/clients" icon={Building2} title="Clients" subtitle={`${data.activeClients} activos`} />
              <EcosystemTile to="/app/requests" icon={Inbox} title="Requests" subtitle={`${data.openTickets} abiertos`} />
              <EcosystemTile to="/app/company-config" icon={Settings2} title="Settings" subtitle="Configuración" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// GLOBAL VIEW (developer/owner, no company selected) — hybrid summary
// ═════════════════════════════════════════════════════════════════════════
function GlobalCommandCenter({
  companies, switchCompany, displayName, greeting,
}: {
  companies: Array<{ id: string; name: string; slug: string }>;
  switchCompany: (id: string | null) => void;
  displayName: string;
  greeting: string;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const [totals, setTotals] = useState({ workers: 0, shiftsToday: 0, openPeriods: 0, companies: 0 });
  const [perCompany, setPerCompany] = useState<Array<{
    id: string; name: string; slug: string; workers: number; shiftsToday: number; openPeriods: number;
  }>>([]);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const today = todayStr();
      const companyIds = companies.map((c) => c.id);

      if (companyIds.length === 0) {
        if (!cancelledRef.current) {
          setTotals({ workers: 0, shiftsToday: 0, openPeriods: 0, companies: 0 });
          setPerCompany([]);
          setLastUpdatedAt(new Date());
          setLoadError(null);
        }
        return;
      }

      const [{ data: emps }, { data: shifts }, { data: periods }] = await Promise.all([
        supabase.from("employees").select("company_id")
          .in("company_id", companyIds).eq("is_active", true),
        supabase.from("scheduled_shifts").select("company_id")
          .in("company_id", companyIds).eq("date", today).is("deleted_at", null),
        supabase.from("pay_periods").select("company_id")
          .in("company_id", companyIds).eq("status", "open"),
      ]);

      const empByCo = new Map<string, number>();
      (emps ?? []).forEach((e: any) => empByCo.set(e.company_id, (empByCo.get(e.company_id) ?? 0) + 1));
      const shiftByCo = new Map<string, number>();
      (shifts ?? []).forEach((s: any) => shiftByCo.set(s.company_id, (shiftByCo.get(s.company_id) ?? 0) + 1));
      const periodByCo = new Map<string, number>();
      (periods ?? []).forEach((p: any) => periodByCo.set(p.company_id, (periodByCo.get(p.company_id) ?? 0) + 1));

      const rows = companies.map((c) => ({
        id: c.id, name: c.name, slug: c.slug,
        workers: empByCo.get(c.id) ?? 0,
        shiftsToday: shiftByCo.get(c.id) ?? 0,
        openPeriods: periodByCo.get(c.id) ?? 0,
      })).sort((a, b) => b.shiftsToday - a.shiftsToday);

      if (cancelledRef.current) return;
      setPerCompany(rows);
      setTotals({
        workers: emps?.length ?? 0,
        shiftsToday: shifts?.length ?? 0,
        openPeriods: periods?.length ?? 0,
        companies: companies.length,
      });
      setLastUpdatedAt(new Date());
      setLoadError(null);
    } catch (e: any) {
      console.warn("[CommandCenter Global] failed:", e);
      // Keep previous data — surface only a discreet warning.
      if (!cancelledRef.current) {
        setLoadError(e?.message ?? "No se pudieron actualizar los datos");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [companies]);

  useEffect(() => {
    cancelledRef.current = false;
    void load("initial");
    return () => { cancelledRef.current = true; };
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-muted/30 p-5 md:p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Radio className="h-3.5 w-3.5" />
              <span>Command Center · Vista global</span>
              <span>·</span>
              <span>{format(new Date(), "EEE d MMM · HH:mm")}</span>
              {lastUpdatedAt && (
                <>
                  <span>·</span>
                  <span>Last updated: {format(lastUpdatedAt, "HH:mm")}</span>
                </>
              )}
              {refreshing && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Actualizando…
                  </span>
                </>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {greeting}, {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Resumen agregado de {totals.companies} compañía{totals.companies === 1 ? "" : "s"} accesibles.
            </p>
            {loadError && (
              <div className="mt-1 inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                <span>No se pudo actualizar. Mostrando últimos datos disponibles.</span>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load("refresh")}
            disabled={loading || refreshing}
            className="gap-2 md:self-start"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Aggregated KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Compañías" value={totals.companies} icon={Building2} loading={loading} />
        <KpiTile label="Workers activos" value={totals.workers} icon={Users} loading={loading} />
        <KpiTile label="Shifts hoy" value={totals.shiftsToday} icon={CalendarDays} loading={loading} />
        <KpiTile label="Periodos abiertos" value={totals.openPeriods} icon={DollarSign} loading={loading} />
      </div>

      {/* Per-company mini pulse */}
      <section className="space-y-3">
        <SectionHeader icon={Layers} title="Compañías" subtitle="Mini-pulse por compañía" />
        <div className="grid gap-2">
          {perCompany.map((c) => (
            <button
              key={c.id}
              onClick={() => switchCompany(c.id)}
              className="group flex items-center gap-4 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials(c.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="truncate text-xs text-muted-foreground">/{c.slug}</div>
              </div>
              <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
                <MiniStat label="workers" value={c.workers} />
                <MiniStat label="shifts hoy" value={c.shiftsToday} />
                <MiniStat label="periodos" value={c.openPeriods} tone={c.openPeriods > 1 ? "warn" : "neutral"} />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
          {!loading && perCompany.length === 0 && (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">No hay compañías accesibles.</CardContent></Card>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Small subcomponents ──────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <span className="text-xs text-muted-foreground">· {subtitle}</span>
    </div>
  );
}

function SnapshotRow({
  label, value, tone = "neutral", href,
}: { label: string; value: number; tone?: "neutral" | "warn" | "good"; href?: string }) {
  const toneCls = {
    neutral: "text-foreground",
    warn: "text-amber-600 dark:text-amber-400",
    good: "text-emerald-600 dark:text-emerald-400",
  }[tone];
  const inner = (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn("text-sm font-semibold tabular-nums", toneCls)}>{value}</span>
        {href && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
    </div>
  );
  return href ? <Link to={href} className="block hover:bg-muted/40">{inner}</Link> : inner;
}

function KpiTile({ label, value, icon: Icon, loading }: { label: string; value: number; icon: any; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        {loading
          ? <Skeleton className="mt-3 h-7 w-16" />
          : <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warn" }) {
  return (
    <div className="text-right">
      <div className={cn("text-sm font-semibold tabular-nums", tone === "warn" && "text-amber-600 dark:text-amber-400")}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
    </div>
  );
}

function EmptyStatePremium() {
  return (
    <Card>
      <CardContent className="space-y-5 p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Sparkles className="h-5 w-5" /></div>
          <div>
            <h3 className="text-base font-semibold">Configura tu compañía</h3>
            <p className="text-sm text-muted-foreground">4 pasos para poner tu operación en marcha.</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <EcosystemTile to="/app/company-config" icon={Settings2} title="Configura tu compañía" subtitle="Datos básicos y módulos" />
          <EcosystemTile to="/app/import-schedule" icon={Upload} title="Importa tu primer schedule" subtitle="Cargar planning desde Excel/CSV" />
          <EcosystemTile to="/app/invite" icon={UserPlus} title="Invita workers" subtitle="Envía invitaciones por email" />
          <EcosystemTile to="/app/shifts" icon={CalendarDays} title="Crear primer shift" subtitle="Programa tu primer turno" />
        </div>
      </CardContent>
    </Card>
  );
}
