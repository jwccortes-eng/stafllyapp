import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { startOfDay, endOfDay, format, differenceInHours } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

/**
 * /app/today — Read-only mock entry screen.
 *
 * Sin queries nuevas, sin writes, sin schema, sin notificaciones.
 * Solo enlaza a /app/needs-attention y /app/daily-close.
 */

type Stats = {
  loading: boolean;
  shiftsToday: number | null;
  activeClockIns: number | null;
  criticalAlerts: number | null;
  dayState: "in_progress" | "needs_review" | "unknown";
};

export default function Today() {
  const { selectedCompanyId } = useCompany();
  const [stats, setStats] = useState<Stats>({
    loading: true,
    shiftsToday: null,
    activeClockIns: null,
    criticalAlerts: null,
    dayState: "unknown",
  });

  useEffect(() => {
    let cancelled = false;
    if (!selectedCompanyId) {
      setStats({ loading: false, shiftsToday: null, activeClockIns: null, criticalAlerts: null, dayState: "unknown" });
      return;
    }
    setStats((s) => ({ ...s, loading: true }));

    (async () => {
      try {
        const today = new Date();
        const dayKey = format(today, "yyyy-MM-dd");
        const dayStart = startOfDay(today).toISOString();
        const dayEnd = endOfDay(today).toISOString();

        // Q1: scheduled_shifts hoy
        const { data: shifts } = await supabase
          .from("scheduled_shifts")
          .select("id, slots")
          .eq("company_id", selectedCompanyId)
          .eq("date", dayKey)
          .is("deleted_at", null);

        // Q2: clock-ins activos (open time_entries)
        const { data: openEntries } = await supabase
          .from("time_entries")
          .select("id, clock_in")
          .eq("company_id", selectedCompanyId)
          .is("clock_out", null);

        // Q3: time_entries clock_in del día (para staffing assignments alertas)
        const shiftIds = (shifts ?? []).map((s) => s.id);
        let assignmentsByShift = new Map<string, number>();
        if (shiftIds.length > 0) {
          const { data: asg } = await supabase
            .from("shift_assignments")
            .select("shift_id, status")
            .in("shift_id", shiftIds);
          (asg ?? []).forEach((a) => {
            if (a.status === "accepted" || a.status === "active" || a.status === "confirmed") {
              assignmentsByShift.set(a.shift_id, (assignmentsByShift.get(a.shift_id) ?? 0) + 1);
            }
          });
        }

        // Alerta: open clock-in > 16h
        const stale = (openEntries ?? []).filter((e) => {
          if (!e.clock_in) return false;
          return differenceInHours(today, new Date(e.clock_in)) > 16;
        }).length;

        // Alerta: shifts con slots > assigned
        const staffingGaps = (shifts ?? []).filter((s) => {
          const need = Number(s.slots ?? 0);
          const have = assignmentsByShift.get(s.id) ?? 0;
          return need > 0 && have < need;
        }).length;

        const criticalAlerts = stale + staffingGaps;

        const dayState: Stats["dayState"] =
          stale > 0 || staffingGaps > 0 ? "needs_review" : "in_progress";

        if (cancelled) return;
        setStats({
          loading: false,
          shiftsToday: shifts?.length ?? 0,
          activeClockIns: openEntries?.length ?? 0,
          criticalAlerts,
          dayState,
        });
      } catch {
        if (!cancelled) {
          setStats({ loading: false, shiftsToday: null, activeClockIns: null, criticalAlerts: null, dayState: "unknown" });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [selectedCompanyId]);

  const fmt = (n: number | null) => (stats.loading ? "…" : n === null ? "—" : String(n));
  const dayStateLabel =
    stats.dayState === "needs_review"
      ? "Estado del día: requiere revisión"
      : stats.dayState === "in_progress"
      ? "Estado del día: en curso"
      : "Estado del día: pendiente de revisión";
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {/* Header */}
        <div className="mb-14">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Vista del día
            <Badge variant="outline" className="ml-1 border-dashed text-[10px]">
              Mockup
            </Badge>
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Hoy
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Tu operación en una sola vista.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Stafly organiza lo urgente, lo que requiere decisión y lo que falta
            para cerrar el día.
          </p>
        </div>

        {/* 3 bloques principales */}
        <div className="space-y-5">
          {/* 1. Ahora */}
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-primary/[0.04] via-background to-background transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <Activity className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Ahora
                    </div>
                    <h2 className="font-display text-xl font-semibold">
                      Qué está pasando ahora
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                      Turnos de hoy, clock-ins activos y alertas críticas en
                      tiempo real.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <MiniStat label="Turnos hoy" value={fmt(stats.shiftsToday)} />
                      <MiniStat label="Clock-ins activos" value={fmt(stats.activeClockIns)} />
                      <MiniStat label="Alertas críticas" value={fmt(stats.criticalAlerts)} />
                    </div>
                  </div>
                </div>
                <Button asChild variant="default" size="lg" className="shrink-0">
                  <Link to="/app/timeclock">
                    Ver operación
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 2. Decidir */}
          <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] via-background to-background transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Decidir
                    </div>
                    <h2 className="font-display text-xl font-semibold">
                      Qué necesita decisión
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                      Problemas que Stafly detectó y necesitan autoridad humana.
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" size="lg" className="shrink-0">
                  <Link to="/app/needs-attention">
                    Ver Needs Attention
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 3. Cerrar */}
          <Card className="overflow-hidden border-border/70 bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-muted p-3 text-foreground">
                    <CalendarCheck2 className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Cerrar
                    </div>
                    <h2 className="font-display text-xl font-semibold">
                      Cerrar el día
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                      Revisa turnos, staffing, asistencia y readiness antes de
                      payroll.
                    </p>
                    <div className="mt-3 inline-flex items-center rounded-md bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground/75">
                      Estado del día: pendiente de revisión
                    </div>
                  </div>
                </div>
                <Button asChild variant="outline" size="lg" className="shrink-0">
                  <Link to="/app/daily-close">
                    Ver cierre diario
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Franja inferior — flujo operativo */}
        <div className="mt-14 border-t border-border/60 pt-6">
          <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Flujo operativo
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FlowStep label="Hoy" active />
            <FlowArrow />
            <FlowStep label="Needs Attention" />
            <FlowArrow />
            <FlowStep label="Daily Close" />
            <FlowArrow />
            <FlowStep label="Payroll Review" />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Payroll solo se revisa con horas reales marcadas, nunca con horas
            programadas.
          </p>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Mockup visual · Sin escrituras · Sin notificaciones
        </p>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FlowStep({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
          : "rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}

function FlowArrow() {
  return <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />;
}
