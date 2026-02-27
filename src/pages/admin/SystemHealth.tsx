import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Users, Building2, CalendarDays, Tags, Upload, DollarSign,
  MapPin, Megaphone, Clock, Shield, Activity, CheckCircle2,
  AlertTriangle, XCircle, RefreshCw, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/ui/page-header";

type Status = "green" | "yellow" | "red";

interface HealthCheck {
  id: string;
  label: string;
  description: string;
  status: Status;
  detail: string;
  icon: any;
  category: string;
}

const STATUS_CONFIG: Record<Status, { bg: string; border: string; text: string; dot: string; label: string; Icon: any }> = {
  green: {
    bg: "bg-earning/8",
    border: "border-earning/25",
    text: "text-earning",
    dot: "bg-earning",
    label: "OK",
    Icon: CheckCircle2,
  },
  yellow: {
    bg: "bg-warning/8",
    border: "border-warning/25",
    text: "text-warning",
    dot: "bg-warning",
    label: "Atención",
    Icon: AlertTriangle,
  },
  red: {
    bg: "bg-destructive/8",
    border: "border-destructive/25",
    text: "text-destructive",
    dot: "bg-destructive",
    label: "Crítico",
    Icon: XCircle,
  },
};

export default function SystemHealth() {
  const { fullName } = useAuth();
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const runChecks = async () => {
    setLoading(true);
    const results: HealthCheck[] = [];

    // 1. Companies check
    const { count: companyCount } = await supabase.from("companies").select("id", { count: "exact", head: true });
    const { count: activeCompanies } = await supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_active", true);
    const cc = companyCount ?? 0;
    const ac = activeCompanies ?? 0;
    results.push({
      id: "companies",
      label: "Empresas",
      description: "Estado de las empresas registradas",
      icon: Building2,
      category: "Datos maestros",
      status: cc === 0 ? "red" : ac < cc ? "yellow" : "green",
      detail: cc === 0 ? "No hay empresas registradas" : `${ac}/${cc} activas`,
    });

    // 2. Employees check
    const { count: totalEmps } = await supabase.from("employees").select("id", { count: "exact", head: true });
    const { count: activeEmps } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true);
    const te = totalEmps ?? 0;
    const ae = activeEmps ?? 0;
    const inactiveRatio = te > 0 ? (te - ae) / te : 0;
    results.push({
      id: "employees",
      label: "Empleados",
      description: "Registro y activación de empleados",
      icon: Users,
      category: "Datos maestros",
      status: te === 0 ? "red" : inactiveRatio > 0.3 ? "yellow" : "green",
      detail: te === 0 ? "Sin empleados" : `${ae} activos de ${te} (${Math.round((1 - inactiveRatio) * 100)}%)`,
    });

    // 3. Concepts check
    const { count: conceptCount } = await supabase.from("concepts").select("id", { count: "exact", head: true });
    const { count: activeConcepts } = await supabase.from("concepts").select("id", { count: "exact", head: true }).eq("is_active", true);
    const tCon = conceptCount ?? 0;
    const aCon = activeConcepts ?? 0;
    results.push({
      id: "concepts",
      label: "Conceptos",
      description: "Conceptos de nómina configurados",
      icon: Tags,
      category: "Datos maestros",
      status: tCon === 0 ? "red" : aCon < 3 ? "yellow" : "green",
      detail: tCon === 0 ? "No hay conceptos" : `${aCon} activos de ${tCon}`,
    });

    // 4. Clients check
    const { count: clientCount } = await supabase.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null);
    results.push({
      id: "clients",
      label: "Clientes",
      description: "Clientes registrados en el sistema",
      icon: Building2,
      category: "Datos maestros",
      status: (clientCount ?? 0) === 0 ? "yellow" : "green",
      detail: (clientCount ?? 0) === 0 ? "Sin clientes configurados" : `${clientCount} cliente(s) activo(s)`,
    });

    // 5. Locations check
    const { count: locationCount } = await supabase.from("locations").select("id", { count: "exact", head: true }).is("deleted_at", null);
    results.push({
      id: "locations",
      label: "Ubicaciones",
      description: "Ubicaciones para turnos y geolocalización",
      icon: MapPin,
      category: "Datos maestros",
      status: (locationCount ?? 0) === 0 ? "yellow" : "green",
      detail: (locationCount ?? 0) === 0 ? "Sin ubicaciones" : `${locationCount} ubicación(es)`,
    });

    // 6. Pay Periods check
    const { data: openPeriods } = await supabase.from("pay_periods").select("id, status, start_date, end_date").eq("status", "open");
    const { count: totalPeriods } = await supabase.from("pay_periods").select("id", { count: "exact", head: true });
    const op = openPeriods?.length ?? 0;
    results.push({
      id: "periods",
      label: "Periodos de nómina",
      description: "Estado de los periodos activos",
      icon: CalendarDays,
      category: "Nómina",
      status: (totalPeriods ?? 0) === 0 ? "red" : op === 0 ? "yellow" : "green",
      detail: (totalPeriods ?? 0) === 0 ? "Sin periodos creados" : op === 0 ? "No hay periodos abiertos" : `${op} periodo(s) abierto(s)`,
    });

    // 7. Imports check
    const { data: recentImports } = await supabase.from("imports").select("id, status, created_at").order("created_at", { ascending: false }).limit(5);
    const failedImports = recentImports?.filter(i => i.status === "error")?.length ?? 0;
    results.push({
      id: "imports",
      label: "Importaciones",
      description: "Estado de las importaciones recientes",
      icon: Upload,
      category: "Nómina",
      status: failedImports > 0 ? "red" : (recentImports?.length ?? 0) === 0 ? "yellow" : "green",
      detail: failedImports > 0 ? `${failedImports} importación(es) con error` : (recentImports?.length ?? 0) === 0 ? "Sin importaciones aún" : `Últimas ${recentImports!.length} OK`,
    });

    // 8. Movements check
    const { count: movCount } = await supabase.from("movements").select("id", { count: "exact", head: true });
    results.push({
      id: "movements",
      label: "Novedades",
      description: "Movimientos/novedades registrados",
      icon: DollarSign,
      category: "Nómina",
      status: (movCount ?? 0) === 0 ? "yellow" : "green",
      detail: (movCount ?? 0) === 0 ? "Sin novedades registradas" : `${movCount} novedad(es) totales`,
    });

    // 9. Shifts check
    const { count: shiftCount } = await supabase.from("scheduled_shifts").select("id", { count: "exact", head: true }).is("deleted_at", null);
    const { data: unassignedShifts } = await supabase
      .from("scheduled_shifts")
      .select("id, shift_assignments(id)")
      .is("deleted_at", null)
      .eq("status", "published");
    const unassigned = unassignedShifts?.filter(s => !(s.shift_assignments as any[])?.length)?.length ?? 0;
    results.push({
      id: "shifts",
      label: "Turnos",
      description: "Programación y asignación de turnos",
      icon: Clock,
      category: "Programación",
      status: unassigned > 3 ? "red" : unassigned > 0 ? "yellow" : "green",
      detail: (shiftCount ?? 0) === 0 ? "Sin turnos creados" : unassigned > 0 ? `${unassigned} turno(s) sin asignar` : `${shiftCount} turno(s), todos asignados`,
    });

    // 10. Announcements check
    const { count: annCount } = await supabase.from("announcements").select("id", { count: "exact", head: true }).is("deleted_at", null);
    results.push({
      id: "announcements",
      label: "Anuncios",
      description: "Comunicaciones publicadas",
      icon: Megaphone,
      category: "Comunicación",
      status: "green",
      detail: (annCount ?? 0) === 0 ? "Sin anuncios" : `${annCount} anuncio(s)`,
    });

    // 11. Permissions / Users check
    const { count: userCount } = await supabase.from("company_users").select("id", { count: "exact", head: true });
    results.push({
      id: "users",
      label: "Usuarios admin",
      description: "Usuarios con acceso administrativo",
      icon: Shield,
      category: "Seguridad",
      status: (userCount ?? 0) <= 1 ? "yellow" : "green",
      detail: (userCount ?? 0) <= 1 ? "Solo 1 usuario admin" : `${userCount} usuario(s) admin`,
    });

    // 12. Modules check
    const { data: modules } = await supabase.from("company_modules").select("module, is_active");
    const activeModules = modules?.filter(m => m.is_active)?.length ?? 0;
    const totalModules = modules?.length ?? 0;
    results.push({
      id: "modules",
      label: "Módulos",
      description: "Módulos activados por empresa",
      icon: Activity,
      category: "Seguridad",
      status: totalModules === 0 ? "red" : activeModules < totalModules * 0.5 ? "yellow" : "green",
      detail: totalModules === 0 ? "Sin módulos configurados" : `${activeModules}/${totalModules} activos`,
    });

    setChecks(results);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => { runChecks(); }, []);

  const summary = useMemo(() => {
    const green = checks.filter(c => c.status === "green").length;
    const yellow = checks.filter(c => c.status === "yellow").length;
    const red = checks.filter(c => c.status === "red").length;
    return { green, yellow, red, total: checks.length };
  }, [checks]);

  const overallStatus: Status = summary.red > 0 ? "red" : summary.yellow > 0 ? "yellow" : "green";
  const overallConfig = STATUS_CONFIG[overallStatus];

  const categories = useMemo(() => {
    const map = new Map<string, HealthCheck[]>();
    checks.forEach(c => {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    });
    return Array.from(map.entries());
  }, [checks]);

  return (
    <div className="space-y-6">
      <PageHeader
        variant="5"
        icon={Shield}
        title="Cuadro de control"
        subtitle="Diagnóstico en tiempo real del estado de la plataforma"
        rightSlot={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Última revisión: {format(lastRefresh, "HH:mm:ss", { locale: es })}
            </span>
            <Button variant="outline" size="sm" onClick={runChecks} disabled={loading} className="rounded-xl gap-2">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refrescar
            </Button>
          </div>
        }
      />

      {/* Overall Semaphore */}
      <Card className={cn("border-2 transition-all", overallConfig.border, overallConfig.bg)}>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            {/* Traffic light */}
            <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border/50 shadow-sm">
              {(["red", "yellow", "green"] as Status[]).map(s => (
                <div
                  key={s}
                  className={cn(
                    "h-8 w-8 rounded-full transition-all duration-500",
                    overallStatus === s
                      ? cn(STATUS_CONFIG[s].dot, "shadow-lg scale-110", s === "green" && "shadow-earning/40", s === "yellow" && "shadow-warning/40", s === "red" && "shadow-destructive/40")
                      : "bg-muted/40"
                  )}
                />
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <overallConfig.Icon className={cn("h-6 w-6", overallConfig.text)} />
                <h2 className={cn("text-xl font-bold font-heading", overallConfig.text)}>
                  {overallStatus === "green" ? "Sistema operativo" : overallStatus === "yellow" ? "Requiere atención" : "Problemas detectados"}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {summary.green} sin problemas · {summary.yellow} con advertencia · {summary.red} crítico
              </p>
            </div>
            {/* Mini counters */}
            <div className="hidden sm:flex items-center gap-3">
              {(["green", "yellow", "red"] as Status[]).map(s => {
                const count = s === "green" ? summary.green : s === "yellow" ? summary.yellow : summary.red;
                const cfg = STATUS_CONFIG[s];
                return (
                  <div key={s} className={cn("flex items-center gap-1.5 rounded-xl px-3 py-2 border", cfg.bg, cfg.border)}>
                    <div className={cn("h-2.5 w-2.5 rounded-full", cfg.dot)} />
                    <span className={cn("text-lg font-bold font-heading tabular-nums", cfg.text)}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Categories */}
      {!loading && categories.map(([catLabel, catChecks]) => {
        const catWorst: Status = catChecks.some(c => c.status === "red")
          ? "red"
          : catChecks.some(c => c.status === "yellow")
          ? "yellow"
          : "green";
        const catCfg = STATUS_CONFIG[catWorst];

        return (
          <Collapsible key={catLabel} defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-3 w-full group/cat cursor-pointer mb-2">
              <div className={cn("h-2 w-2 rounded-full", catCfg.dot)} />
              <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground group-hover/cat:text-foreground transition-colors">
                {catLabel}
              </span>
              <div className="flex-1 h-px bg-border/40" />
              <ChevronDown className="h-4 w-4 text-muted-foreground/40 transition-transform duration-300 group-data-[state=open]/cat:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
              {catChecks.map(check => {
                const cfg = STATUS_CONFIG[check.status];
                const StatusIcon = cfg.Icon;
                return (
                  <Tooltip key={check.id} delayDuration={200}>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "rounded-xl border p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-default",
                        cfg.bg, cfg.border
                      )}>
                        <div className="flex items-start gap-3">
                          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                            <check.icon className={cn("h-5 w-5", cfg.text)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-foreground">{check.label}</span>
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", cfg.text, cfg.border)}>
                                <StatusIcon className="h-3 w-3 mr-0.5" />
                                {cfg.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{check.detail}</p>
                          </div>
                          <div className={cn("h-3 w-3 rounded-full shrink-0 mt-1", cfg.dot)} />
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px] text-xs">
                      {check.description}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
