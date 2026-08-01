import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, CalendarDays, Clock, DollarSign, Inbox, Building2,
  Search, ArrowRight, CheckCircle2, ChevronRight, AlertTriangle, RotateCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { isAdminLevelRole } from "@/lib/roles";
import { ContextSwitcher } from "@/components/context/ContextSwitcher";
import { OperationalCard } from "@/components/ocs";
import {
  type MetricState, loadingMetric, errorMetric, notApplicableMetric, countMetric,
} from "@/lib/ox/metric-state";

/**
 * OX-5 — Mobile Presence Compression.
 * Mobile-first Admin Home. Frontend-only: same queries, permissions and tenant
 * scoping as before; only the presentation is compressed so the first screen
 * answers "¿cómo está la operación?", "¿qué necesita atención?" y "¿qué sigue?".
 */

type ActionKey =
  | "workers" | "shifts" | "timeclock" | "payroll" | "tickets" | "clients" | "communities";

interface ActionDef {
  key: ActionKey;
  label: string;
  to: string;
  icon: any;
  module: string | null;
  badgeKey?: "tickets" | "shift_requests";
  accent: string; // tailwind class for icon tile bg
}

const ACTIONS: ActionDef[] = [
  { key: "workers", label: "Workers", to: "/app/employees", icon: Users, module: "employees", accent: "bg-primary/10 text-primary" },
  { key: "shifts", label: "Turnos", to: "/app/shifts", icon: CalendarDays, module: "shifts", badgeKey: "shift_requests", accent: "bg-status-warning-bg text-status-warning" },
  { key: "timeclock", label: "Fichajes", to: "/app/timeclock", icon: Clock, module: "shifts", accent: "bg-status-success-bg text-status-success" },
  { key: "payroll", label: "Payroll", to: "/app/periods", icon: DollarSign, module: "periods", accent: "bg-status-progress-bg text-status-progress" },
  { key: "tickets", label: "Solicitudes", to: "/app/requests", icon: Inbox, module: null, badgeKey: "tickets", accent: "bg-muted text-muted-foreground" },
  { key: "clients", label: "Clientes", to: "/app/clients", icon: Building2, module: "clients", accent: "bg-status-neutral-bg text-status-neutral" },
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

  const metrics = [shiftsToday, clockedIn, hoursToReview, pendingResponses];
  const anyLoading = metrics.some((m) => m.kind === "loading");
  const anyError = metrics.some((m) => m.kind === "error");

  const allCalm =
    metrics.every((m) => m.kind === "zero_confirmed") &&
    (clockedIn.value ?? 0) === 0 &&
    (hoursToReview.value ?? 0) === 0 &&
    (pendingResponses.value ?? 0) === 0;

  // Only what demands a decision, in priority order.
  const attention = [
    {
      key: "hours",
      count: hoursToReview.value ?? 0,
      ok: hoursToReview.kind !== "loading" && hoursToReview.kind !== "error",
      label: (n: number) => `${n} ${n === 1 ? "hora por validar" : "horas por validar"}`,
      hint: "Bloquean el cierre del periodo.",
      to: "/app/validation-center",
    },
    {
      key: "responses",
      count: pendingResponses.value ?? 0,
      ok: pendingResponses.kind !== "loading" && pendingResponses.kind !== "error",
      label: (n: number) => `${n} sin responder`,
      hint: "El turno puede quedarse sin cobertura.",
      to: "/app/shifts",
    },
    {
      key: "open",
      count: clockedIn.value ?? 0,
      ok: clockedIn.kind !== "loading" && clockedIn.kind !== "error",
      label: (n: number) => `${n} ${n === 1 ? "fichaje abierto" : "fichajes abiertos"}`,
      hint: "Sin clock-out no se validan horas.",
      to: "/app/timeclock",
    },
  ].filter((a) => a.ok && a.count > 0);

  const headline = anyLoading
    ? "Leyendo tu operación…"
    : anyError
      ? "No pudimos leer parte de tu operación."
      : allCalm
        ? "Todo bajo control."
        : attention.length > 0
          ? `${attention.length} ${attention.length === 1 ? "asunto necesita" : "asuntos necesitan"} tu atención.`
          : "Tu operación avanza sin pendientes.";

  return (
    <div className="min-h-full pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
      {/* Anfitriona: la empresa encabeza, Stafly acompaña */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80 truncate">
              {companyLabel}
            </p>
            <h1 className="text-[22px] font-semibold tracking-tight leading-tight mt-0.5 truncate">
              {greeting}, <span className="text-primary">{firstName}</span>
            </h1>
          </div>
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Buscar"
            className="h-11 w-11 shrink-0 rounded-xl border border-border/50 bg-card flex items-center justify-center active:scale-[0.96] transition-transform"
          >
            <Search className="h-[18px] w-[18px] text-muted-foreground" />
          </button>
          <div className="shrink-0 w-11">
            <ContextSwitcher placement="header" collapsed />
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">{headline}</p>
      </div>

      {/* Primer scroll: sólo lo que exige decisión — o la confirmación de calma */}
      <div className="px-5 mb-5">
        {allCalm ? (
          <OperationalCard
            status="ready"
            statusLabel="Sin pendientes"
            leading={
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-status-success-bg text-status-success">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            }
            title="Todo bajo control"
            primary={<p className="text-sm">Nadie espera una decisión tuya.</p>}
            action={{ label: "Ver la operación de hoy", onClick: () => navigate("/app/command-center") }}
          />
        ) : anyLoading ? (
          <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-2.5">
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
          </div>
        ) : attention.length > 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40 overflow-hidden">
            {attention.map((a) => (
              <button
                key={a.key}
                onClick={() => navigate(a.to)}
                className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] text-left active:bg-muted/40 transition-colors"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-warning-bg text-status-warning">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold tracking-tight truncate">
                    {a.label(a.count)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">{a.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        ) : anyError ? (
          <button
            onClick={reload}
            className="w-full flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3.5 min-h-[56px] text-left active:bg-muted/40"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-danger-bg text-status-danger">
              <RotateCw className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Datos incompletos</span>
              <span className="block text-[11px] text-muted-foreground">Toca para reintentar.</span>
            </span>
          </button>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-card px-4 py-3.5">
            <p className="text-sm">Sin decisiones pendientes ahora mismo.</p>
          </div>
        )}
      </div>

      {/* Pulso de hoy — una sola historia, no cuatro widgets */}
      <div className="px-5 mb-5">
        <button
          onClick={() => navigate("/app/command-center")}
          className="w-full rounded-2xl border border-border/50 bg-card p-4 text-left active:bg-muted/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Hoy
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Pulse label="Turnos" state={shiftsToday} />
            <Pulse label="Activos" state={clockedIn} />
            <Pulse label="Validar" state={hoursToReview} />
            <Pulse label="Sin resp." state={pendingResponses} />
          </div>
        </button>
      </div>

      {/* Accesos de operación — icono + nombre, sin texto de apoyo */}
      <div className="px-5">
        <div className="grid grid-cols-3 gap-2.5">
          {visibleActions.map((a) => {
            const Icon = a.icon;
            const badge: BadgeState = a.badgeKey ? badges[a.badgeKey] : { kind: "ready", value: 0 };
            const count = badge.value;

            return (
              <button
                key={a.key}
                onClick={() => navigate(a.to)}
                className={cn(
                  "relative flex flex-col items-start text-left",
                  "rounded-2xl border border-border/50 bg-card p-3 min-h-[76px]",
                  "active:scale-[0.97] transition-all",
                )}
              >
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2", a.accent)}>
                  <Icon className="h-[17px] w-[17px]" />
                </div>
                <span className="text-[12.5px] font-semibold tracking-tight truncate w-full">
                  {a.label}
                </span>
                {badge.kind === "error" && (
                  <StatusBadge status="failed" label="!" size="sm" className="absolute top-2 right-2" />
                )}
                {badge.kind === "ready" && count > 0 && (
                  <StatusBadge
                    status="pending"
                    label={count > 9 ? "9+" : String(count)}
                    size="sm"
                    indicator="dot"
                    className="absolute top-2 right-2"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="px-5 mt-5">
        <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40 overflow-hidden">
          <QuickLink label="Mapa en vivo" to="/app/live-map" onNav={navigate} />
          <QuickLink label="Anuncios" to="/app/announcements" onNav={navigate} />
          <QuickLink label="Reportes" to="/app/summary" onNav={navigate} />
        </div>
      </div>
    </div>
  );
}

function Pulse({ label, state }: { label: string; state: MetricState }) {
  const value =
    state.kind === "loading" ? "·" : state.kind === "error" ? "—" : String(state.value ?? 0);
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "text-[20px] font-semibold leading-none tabular-nums",
          state.kind === "error" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-[10.5px] text-muted-foreground mt-1 truncate">{label}</div>
    </div>
  );
}

function QuickLink({ label, to, onNav }: { label: string; to: string; onNav: (to: string) => void }) {
  return (
    <button
      onClick={() => onNav(to)}
      className="w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] active:bg-muted/40 transition-colors"
    >
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
