import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, CalendarDays, Clock, DollarSign, Inbox, Building2,
  Search, ArrowRight, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isAdminLevelRole } from "@/lib/roles";
import { AdminProductSwitcher } from "@/components/admin/AdminProductSwitcher";
import { KpiStateCard } from "@/components/ox/KpiStateCard";
import {
  type MetricState, loadingMetric, errorMetric, notApplicableMetric, countMetric,
} from "@/lib/ox/metric-state";


/**
 * Mobile-first Admin Home — Command Center style.
 * Frontend-only. Reuses existing routes, permissions and tenant scoping.
 * Desktop Dashboard is untouched; this only renders when useIsMobile() is true.
 */

type ActionKey =
  | "workers" | "shifts" | "timeclock" | "payroll" | "tickets" | "clients" | "communities";

interface ActionDef {
  key: ActionKey;
  label: string;
  hint: string;
  to: string;
  icon: any;
  module: string | null;
  badgeKey?: "tickets" | "shift_requests";
  accent: string; // tailwind class for icon tile bg
}

const ACTIONS: ActionDef[] = [
  { key: "workers", label: "Workers", hint: "Roster & profiles", to: "/app/employees", icon: Users, module: "employees", accent: "bg-primary/10 text-primary" },
  { key: "shifts", label: "Shifts", hint: "Schedule & assign", to: "/app/shifts", icon: CalendarDays, module: "shifts", badgeKey: "shift_requests", accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { key: "timeclock", label: "Time Clock", hint: "Live attendance", to: "/app/timeclock", icon: Clock, module: "shifts", accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { key: "payroll", label: "Payroll", hint: "Periods & reports", to: "/app/periods", icon: DollarSign, module: "periods", accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  { key: "tickets", label: "Requests", hint: "Tickets & inbox", to: "/app/requests", icon: Inbox, module: null, badgeKey: "tickets", accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { key: "clients", label: "Clients", hint: "Accounts & sites", to: "/app/clients", icon: Building2, module: "clients", accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
];

type BadgeState = { kind: "loading" | "error" | "ready"; value: number };

export default function MobileAdminHome() {
  const navigate = useNavigate();
  const { selectedCompanyId, selectedCompany, isModuleActive, isGlobalMode } = useCompany();
  const { role: globalRole, hasModuleAccess, fullName, getRoleForCompany } = useAuth();
  const role = isGlobalMode ? globalRole : getRoleForCompany(selectedCompanyId);
  const isAdminRole = isAdminLevelRole(role);

  const [badges, setBadges] = useState<{ tickets: BadgeState; shift_requests: BadgeState }>({
    tickets: { kind: "loading", value: 0 },
    shift_requests: { kind: "loading", value: 0 },
  });

  // P0 OX — today's operation, with explicit states (never a silent zero).
  const [shiftsToday, setShiftsToday] = useState<MetricState>(loadingMetric("turnos"));
  const [clockedIn, setClockedIn] = useState<MetricState>(loadingMetric("workers"));
  const [hoursToReview, setHoursToReview] = useState<MetricState>(loadingMetric("registros"));
  const [pendingResponses, setPendingResponses] = useState<MetricState>(loadingMetric("respuestas"));
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  // Reuse the same badge query as AdminSidebar (tickets + pending shift assignments)
  useEffect(() => {
    if (!selectedCompanyId) {
      setBadges({
        tickets: { kind: "ready", value: 0 },
        shift_requests: { kind: "ready", value: 0 },
      });
      return;
    }
    let alive = true;
    async function fetchBadges() {
      const [ticketsRes, shiftReqRes] = await Promise.all([
        supabase.from("employee_tickets").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).in("status", ["new", "in_progress"]),
        supabase.from("shift_assignments").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("status", "pending"),
      ]);
      if (!alive) return;
      setBadges({
        tickets: ticketsRes.error
          ? { kind: "error", value: 0 }
          : { kind: "ready", value: ticketsRes.count ?? 0 },
        shift_requests: shiftReqRes.error
          ? { kind: "error", value: 0 }
          : { kind: "ready", value: shiftReqRes.count ?? 0 },
      });
    }
    fetchBadges();
    const id = setInterval(fetchBadges, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [selectedCompanyId, reloadKey]);

  useEffect(() => {
    if (!selectedCompanyId) {
      const na = notApplicableMetric("", "Selecciona una compañía para ver su operación.");
      setShiftsToday(na); setClockedIn(na); setHoursToReview(na); setPendingResponses(na);
      return;
    }
    let alive = true;
    setShiftsToday(loadingMetric("turnos"));
    setClockedIn(loadingMetric("workers"));
    setHoursToReview(loadingMetric("registros"));
    setPendingResponses(loadingMetric("respuestas"));

    (async () => {
      const today = new Date().toISOString().split("T")[0];
      const [shiftsRes, openRes, reviewRes, respRes] = await Promise.all([
        supabase.from("scheduled_shifts").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId).eq("date", today).is("deleted_at", null),
        supabase.from("time_entries").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId).is("clock_out", null),
        supabase.from("time_entries").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId).eq("status", "pending"),
        supabase.from("shift_assignments").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId).eq("status", "pending"),
      ]);
      if (!alive) return;

      setShiftsToday(
        shiftsRes.error
          ? errorMetric("turnos")
          : countMetric(shiftsRes.count ?? 0, "turnos", {
              zero: "Aún no hay turnos programados para hoy.",
              some: (n) => `${n === 1 ? "Turno programado" : "Turnos programados"} para hoy.`,
            }),
      );
      setClockedIn(
        openRes.error
          ? errorMetric("workers")
          : countMetric(openRes.count ?? 0, "workers", {
              zero: "Nadie tiene el fichaje abierto ahora mismo.",
              some: (n) => `${n === 1 ? "Worker sigue" : "Workers siguen"} con el fichaje abierto.`,
            }),
      );
      setHoursToReview(
        reviewRes.error
          ? errorMetric("registros")
          : countMetric(reviewRes.count ?? 0, "registros", {
              zero: "No hay horas pendientes de revisión.",
              some: (n) => `${n === 1 ? "Registro de horas espera" : "Registros de horas esperan"} tu aprobación.`,
            }),
      );
      setPendingResponses(
        respRes.error
          ? errorMetric("respuestas")
          : countMetric(respRes.count ?? 0, "respuestas", {
              zero: "Todos los workers asignados ya respondieron.",
              some: (n) => `${n === 1 ? "Worker asignado no ha" : "Workers asignados no han"} respondido.`,
            }),
      );
    })();

    return () => { alive = false; };
  }, [selectedCompanyId, reloadKey]);

  // Permission filter mirrors AdminSidebar.isLinkVisible logic for module-gated items
  const isVisible = (a: ActionDef) => {
    if (isGlobalMode) return true;
    if (a.module) {
      if (!isModuleActive(a.module)) return false;
      if (isAdminRole) return true;
      if (role === "manager" || role === "supervisor") return hasModuleAccess(a.module, "view");
      return false;
    }
    // Non-module admin tools (e.g. Requests inbox) are admin-only
    if (!isAdminRole && role !== "manager" && role !== "supervisor") return false;
    return true;
  };

  const visibleActions = useMemo(() => ACTIONS.filter(isVisible), [role, selectedCompanyId, isGlobalMode]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const firstName = (fullName || "").split(" ")[0] || "Operador";
  const companyLabel = isGlobalMode ? "Vista global" : (selectedCompany?.name || "Stafly");

  const openCommandPalette = () => {
    // Reuse the existing CommandPalette ⌘K trigger (same pattern as nTrigger).
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };


  return (
    <div className="min-h-full pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
      {/* Hero */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
              <Sparkles className="h-3 w-3" />
              <span className="truncate">{companyLabel}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight leading-tight">
              {greeting},<br />
              <span className="text-primary">{firstName}.</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Your command center. Tap to jump in.
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            <AdminProductSwitcher compact />
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-5 pb-4">
        <button
          type="button"
          onClick={openCommandPalette}
          className={cn(
            "w-full flex items-center gap-3 h-12 px-4 rounded-2xl",
            "bg-muted/50 hover:bg-muted/70 active:scale-[0.99] transition-all",
            "border border-border/40 text-left"
          )}
        >
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground truncate">
            Search workers, shifts, clients…
          </span>
          <kbd className="ml-auto text-[10px] font-mono text-muted-foreground/70 px-1.5 py-0.5 rounded bg-background/80 border border-border/40">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* P0 OX — Operación de hoy: nunca un cero silencioso */}
      <div className="px-5 mb-5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 px-1">
          Operación de hoy
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KpiStateCard label="Turnos hoy" state={shiftsToday} onRetry={reload} onClick={() => navigate("/app/shifts")} />
          <KpiStateCard label="Fichajes abiertos" state={clockedIn} onRetry={reload} onClick={() => navigate("/app/timeclock")} />
          <KpiStateCard label="Horas por revisar" state={hoursToReview} onRetry={reload} onClick={() => navigate("/app/payroll-review-queue")} />
          <KpiStateCard label="Sin responder" state={pendingResponses} onRetry={reload} onClick={() => navigate("/app/shifts")} />
        </div>
      </div>

      {/* Action grid */}
      <div className="px-5">
        <div className="grid grid-cols-2 gap-3">
          {visibleActions.map((a) => {
            const Icon = a.icon;
            const badge: BadgeState = a.badgeKey ? badges[a.badgeKey] : { kind: "ready", value: 0 };
            const count = badge.value;

            return (
              <button
                key={a.key}
                onClick={() => navigate(a.to)}
                className={cn(
                  "group relative flex flex-col items-start text-left",
                  "rounded-2xl border border-border/50 bg-card",
                  "p-3 min-h-[96px]",
                  "active:scale-[0.97] hover:border-border transition-all",
                  "shadow-sm hover:shadow-md"
                )}
              >
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center mb-2", a.accent)}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div className="flex items-center gap-2 w-full">
                  <span className="text-[13px] font-semibold tracking-tight truncate">{a.label}</span>
                  {badge.kind === "error" && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] font-semibold ml-auto bg-destructive/15 text-destructive border border-destructive/20">
                      Error
                    </Badge>
                  )}
                  {badge.kind === "ready" && count > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] font-semibold ml-auto bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      {count > 9 ? "9+" : count}
                    </Badge>
                  )}

                </div>
                <span className="text-[10.5px] text-muted-foreground mt-0.5 leading-tight truncate w-full">
                  {a.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick links */}
      <div className="px-5 mt-6">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 px-1">
          Quick access
        </div>
        <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40 overflow-hidden">
          <QuickLink label="Live Map" to="/app/live-map" onNav={navigate} />
          <QuickLink label="Announcements" to="/app/announcements" onNav={navigate} />
          <QuickLink label="Front Desk" to="/app/front-desk" onNav={navigate} />
          <QuickLink label="Reports" to="/app/summary" onNav={navigate} />
        </div>
      </div>

      <div className="px-5 mt-6 mb-2">
        <p className="text-[11px] text-center text-muted-foreground/70">
          Tap <span className="font-semibold">More</span> in the bottom bar for full navigation.
        </p>
      </div>
    </div>
  );
}

function QuickLink({ label, to, onNav }: { label: string; to: string; onNav: (to: string) => void }) {
  return (
    <button
      onClick={() => onNav(to)}
      className="w-full flex items-center justify-between px-4 py-3.5 active:bg-muted/40 transition-colors"
    >
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
