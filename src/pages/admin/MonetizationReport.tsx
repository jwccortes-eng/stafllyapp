import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, Clock, TrendingUp, Users, BarChart3,
  Layers, Shield, Megaphone, CalendarDays, Code,
  Wallet, CreditCard, Zap, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/* ── Investment data (estimated from project scope) ── */
const PROJECT_START = "2025-02-01";
const HOURLY_RATE = 50;

const DEVELOPMENT_PHASES = [
  { phase: "Arquitectura base y auth", hours: 40, description: "Auth dual (email + teléfono/PIN), RBAC multi-tenant, profiles, rate limiting" },
  { phase: "Gestión de nómina", hours: 55, description: "Periodos, importación Connecteam, novedades, resumen, cálculos automáticos" },
  { phase: "Empleados y catálogos", hours: 30, description: "CRUD empleados, conceptos, tarifas personalizadas, invitaciones" },
  { phase: "Portal de empleados", hours: 35, description: "Dashboard, pagos, acumulados, detalle semanal, turnos" },
  { phase: "Programación y turnos", hours: 25, description: "Turnos programados, asignaciones, calendario, reloj" },
  { phase: "Clientes y ubicaciones", hours: 15, description: "CRUD clientes, ubicaciones con geofencing" },
  { phase: "Comunicación y feed social", hours: 25, description: "Anuncios, reacciones, multimedia, chat interno, realtime" },
  { phase: "Reportes y exportaciones", hours: 20, description: "Resumen por periodo, por empleado, directorio, CSV/Excel" },
  { phase: "Owner dashboard y multi-empresa", hours: 30, description: "Vista global, gestión de empresas, módulos, onboarding" },
  { phase: "Permisos granulares (RBAC)", hours: 20, description: "Action permissions, role templates, module permissions" },
  { phase: "Seguridad y auditoría", hours: 20, description: "RLS policies, audit log, sensitive data protection, password confirm" },
  { phase: "Automatizaciones", hours: 10, description: "Motor de reglas, log de ejecución" },
  { phase: "UI/UX y diseño", hours: 25, description: "Design system, tema claro/oscuro, sidebar colapsable, mobile" },
  { phase: "Edge Functions", hours: 15, description: "admin-reset-password, employee-auth, employee-chat, invite-admin, external-api" },
  { phase: "Mantenimiento y iteraciones", hours: 35, description: "Refactoring, bug fixes, optimizaciones, ajustes continuos" },
];

const SUBSCRIPTION_COSTS = [
  { item: "Plataforma Pro (mensual)", cost: 20, months: 12, total: 240 },
  { item: "Dominio personalizado", cost: 0, months: 0, total: 15 },
];

export default function MonetizationReport() {
  const { role } = useAuth();
  const [activityCount, setActivityCount] = useState(0);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [companyCount, setCompanyCount] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from("activity_log").select("id", { count: "exact", head: true }),
      supabase.from("employees").select("id", { count: "exact", head: true }),
      supabase.from("companies").select("id", { count: "exact", head: true }),
    ]).then(([actRes, empRes, compRes]) => {
      setActivityCount(actRes.count ?? 0);
      setEmployeeCount(empRes.count ?? 0);
      setCompanyCount(compRes.count ?? 0);
    });
  }, []);

  if (role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Acceso restringido al propietario.</p>
      </div>
    );
  }

  const totalDevHours = DEVELOPMENT_PHASES.reduce((s, p) => s + p.hours, 0);
  const totalDevCost = totalDevHours * HOURLY_RATE;
  const totalSubCost = SUBSCRIPTION_COSTS.reduce((s, c) => s + c.total, 0);
  const totalInvestment = totalDevCost + totalSubCost;
  const today = new Date();
  const projectStart = new Date(PROJECT_START);
  const monthsActive = Math.max(1, Math.round((today.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24 * 30)));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Reporte de Monetización e Inversión
        </h1>
        <p className="page-subtitle">
          Análisis completo de costos de desarrollo e inversión — Solo visible para el propietario
        </p>
        <Badge variant="outline" className="mt-2">
          Confidencial · {format(today, "dd MMMM yyyy", { locale: es })}
        </Badge>
      </div>

      {/* ── Summary KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Horas desarrollo</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{totalDevHours}h</p>
            <p className="text-xs text-muted-foreground mt-1">{DEVELOPMENT_PHASES.length} fases completadas</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-warning/20 bg-warning/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-warning" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Costo desarrollo</span>
            </div>
            <p className="text-3xl font-bold text-foreground">${totalDevCost.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">${HOURLY_RATE}/hora × {totalDevHours}h</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-destructive/20 bg-destructive/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-destructive" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Membresías</span>
            </div>
            <p className="text-3xl font-bold text-foreground">${totalSubCost.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">servicios pagados</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-earning/20 bg-earning/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-earning" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inversión total</span>
            </div>
            <p className="text-3xl font-bold text-foreground">${totalInvestment.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{monthsActive} meses de proyecto</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Platform Stats ── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Métricas de la plataforma
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-xl bg-muted/50">
              <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{employeeCount}</p>
              <p className="text-[11px] text-muted-foreground">Empleados</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/50">
              <Layers className="h-5 w-5 mx-auto mb-1 text-warning" />
              <p className="text-2xl font-bold">{companyCount}</p>
              <p className="text-[11px] text-muted-foreground">Empresas</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/50">
              <Zap className="h-5 w-5 mx-auto mb-1 text-earning" />
              <p className="text-2xl font-bold">{activityCount}</p>
              <p className="text-[11px] text-muted-foreground">Eventos registrados</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/50">
              <Code className="h-5 w-5 mx-auto mb-1 text-destructive" />
              <p className="text-2xl font-bold">5</p>
              <p className="text-[11px] text-muted-foreground">Edge Functions</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Development Phases ── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Desglose de desarrollo por fase
          </CardTitle>
          <CardDescription>
            Estimación de horas invertidas × ${HOURLY_RATE}/hora
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="col-span-4">Fase</div>
              <div className="col-span-5">Descripción</div>
              <div className="col-span-1 text-right">Horas</div>
              <div className="col-span-2 text-right">Costo</div>
            </div>
            <Separator />
            {DEVELOPMENT_PHASES.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors text-sm">
                <div className="col-span-4 font-medium">{p.phase}</div>
                <div className="col-span-5 text-muted-foreground text-xs">{p.description}</div>
                <div className="col-span-1 text-right font-mono">{p.hours}h</div>
                <div className="col-span-2 text-right font-mono font-semibold">${(p.hours * HOURLY_RATE).toLocaleString()}</div>
              </div>
            ))}
            <Separator />
            <div className="grid grid-cols-12 gap-2 px-3 py-3 font-semibold">
              <div className="col-span-9">Total desarrollo</div>
              <div className="col-span-1 text-right font-mono">{totalDevHours}h</div>
              <div className="col-span-2 text-right font-mono text-primary">${totalDevCost.toLocaleString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Subscriptions ── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Membresías y servicios pagados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="col-span-5">Servicio</div>
              <div className="col-span-3 text-right">Costo mensual</div>
              <div className="col-span-2 text-right">Meses</div>
              <div className="col-span-2 text-right">Total</div>
            </div>
            <Separator />
            {SUBSCRIPTION_COSTS.map((s, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors text-sm">
                <div className="col-span-5 font-medium">{s.item}</div>
                <div className="col-span-3 text-right font-mono">${s.cost}/mes</div>
                <div className="col-span-2 text-right font-mono">{s.months || "—"}</div>
                <div className="col-span-2 text-right font-mono font-semibold">${s.total.toLocaleString()}</div>
              </div>
            ))}
            <Separator />
            <div className="grid grid-cols-12 gap-2 px-3 py-3 font-semibold">
              <div className="col-span-10">Total membresías</div>
              <div className="col-span-2 text-right font-mono text-destructive">${totalSubCost.toLocaleString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Grand Total ── */}
      <Card className="rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Inversión total del proyecto</p>
              <p className="text-4xl font-bold text-foreground">${totalInvestment.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Desde {format(projectStart, "MMMM yyyy", { locale: es })} · {monthsActive} meses
              </p>
            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center gap-2 justify-end text-sm">
                <span className="text-muted-foreground">Desarrollo:</span>
                <span className="font-semibold">${totalDevCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 justify-end text-sm">
                <span className="text-muted-foreground">Membresías:</span>
                <span className="font-semibold">${totalSubCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 justify-end text-sm">
                <span className="text-muted-foreground">Costo/mes promedio:</span>
                <span className="font-semibold">${Math.round(totalInvestment / monthsActive).toLocaleString()}/mes</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center pb-4">
        Este reporte es confidencial y solo visible para el propietario de la plataforma. Generado automáticamente.
      </p>
    </div>
  );
}
