/**
 * BatchTrendPanel — /app/payroll-native-dry-run "Comparar períodos" tab.
 *
 * READ-ONLY. Fetches the last N (3 or 4) pay periods for the selected company,
 * loads their period_base_pay + time_entries rows (already RLS-scoped), and
 * renders per-period metrics, repeat-offender workers, and recurring-issues
 * summary. NEVER writes anywhere.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Download, ShieldAlert, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computePeriodMetrics,
  downloadBatchTrendCsv,
  findRepeatOffenders,
  type PeriodMetrics,
  type PeriodStatus,
  type TrendPBP,
  type TrendPeriod,
  type TrendTE,
} from "@/utils/payrollDryRunTrend";

interface EmpLite { id: string; first_name: string | null; last_name: string | null }

const ISSUE_KEYS: {
  key: keyof Pick<
    PeriodMetrics,
    "openEntries" | "noShiftEntries" | "abnormalEntries" | "midnightEntries" | "overlapEntries" | "notComparableWorkers"
  >;
  label: string;
  tone: "warn" | "danger" | "muted";
}[] = [
  { key: "openEntries", label: "Entries abiertas", tone: "warn" },
  { key: "noShiftEntries", label: "Entries sin shift", tone: "warn" },
  { key: "abnormalEntries", label: "Duración anormal", tone: "danger" },
  { key: "midnightEntries", label: "Cruzan medianoche", tone: "muted" },
  { key: "overlapEntries", label: "Overlaps", tone: "danger" },
  { key: "notComparableWorkers", label: "Workers no comparables", tone: "warn" },
];

const REASON_LABEL: Record<string, string> = {
  delta_critical: "Delta crítico",
  open_entries: "Fichajes abiertos",
  no_shift_link: "Entries sin shift",
  abnormal_duration: "Duración anormal",
  midnight_cross: "Cruza medianoche",
  overlap_entries: "Overlaps",
};

export function BatchTrendPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [count, setCount] = useState<3 | 4>(3);
  const [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState<PeriodMetrics[]>([]);
  const [emps, setEmps] = useState<Map<string, EmpLite>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data: periodRows, error: pErr } = await supabase
          .from("pay_periods")
          .select("id, start_date, end_date, status, sequence_number")
          .eq("company_id", companyId)
          .order("start_date", { ascending: false })
          .limit(count);
        if (pErr) throw pErr;
        const list = (periodRows ?? []) as TrendPeriod[];
        if (list.length === 0) {
          if (!cancelled) { setPeriods([]); setLoading(false); }
          return;
        }
        const perPeriod = await Promise.all(
          list.map(async (p) => {
            const startIso = `${p.start_date}T00:00:00`;
            const endIso = `${p.end_date}T23:59:59`;
            const [pbpRes, teRes] = await Promise.all([
              supabase
                .from("period_base_pay")
                .select("employee_id, total_work_hours")
                .eq("company_id", companyId)
                .eq("period_id", p.id),
              supabase
                .from("time_entries")
                .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes")
                .eq("company_id", companyId)
                .gte("clock_in", startIso)
                .lte("clock_in", endIso)
                .limit(5000),
            ]);
            return computePeriodMetrics(
              p,
              (pbpRes.data ?? []) as TrendPBP[],
              (teRes.data ?? []) as TrendTE[],
            );
          }),
        );
        // Ensure chronological order (oldest → newest).
        perPeriod.sort((a, b) =>
          a.period.start_date.localeCompare(b.period.start_date),
        );

        // Fetch names for repeat offenders only.
        const repeatIds = new Set<string>();
        for (const r of findRepeatOffenders(perPeriod)) {
          repeatIds.add(r.employee_id);
        }
        let empMap = new Map<string, EmpLite>();
        if (repeatIds.size > 0) {
          const { data: empRows } = await supabase
            .from("employees")
            .select("id, first_name, last_name")
            .eq("company_id", companyId)
            .in("id", Array.from(repeatIds));
          empMap = new Map(
            ((empRows ?? []) as EmpLite[]).map((e) => [e.id, e]),
          );
        }

        if (cancelled) return;
        setPeriods(perPeriod);
        setEmps(empMap);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error cargando períodos");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, count]);

  const repeatOffenders = useMemo(
    () => findRepeatOffenders(periods),
    [periods],
  );

  const issueTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const pm of periods) {
      for (const k of ISSUE_KEYS) {
        totals[k.key] = (totals[k.key] ?? 0) + (pm[k.key] as number);
      }
    }
    return totals;
  }, [periods]);

  const handleExport = useCallback(() => {
    if (periods.length === 0) return;
    downloadBatchTrendCsv(
      {
        company_id: companyId,
        company_name: companyName,
        generated_at: new Date().toISOString(),
      },
      periods,
    );
  }, [companyId, companyName, periods]);

  return (
    <div className="space-y-4">
      {/* Trend-specific guardrail */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-amber-800 dark:text-amber-200">
            Esta tendencia es una señal de auditoría interna, no una aprobación
            para payroll nativo.
          </p>
          <p className="text-muted-foreground mt-0.5">
            Referencia usada: <code>period_base_pay.total_work_hours</code>.
            No usa <code>scheduled_shifts</code> como fuente de pago. No calcula
            dinero. Fuente oficial actual: Connecteam / reconciliación externa.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">Comparar últimos</div>
          <div className="min-w-[140px]">
            <Select
              value={String(count)}
              onValueChange={(v) => setCount(Number(v) as 3 | 4)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3" className="text-xs">3 períodos</SelectItem>
                <SelectItem value="4" className="text-xs">4 períodos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 ml-auto"
            onClick={handleExport}
            disabled={periods.length === 0 || loading}
            title="Export local para revisión. No usar como archivo final de pago."
          >
            <Download className="h-4 w-4" /> Exportar CSV batch
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card><CardContent className="py-6 text-sm text-destructive">
          {error}
        </CardContent></Card>
      )}

      {!loading && periods.length === 0 && !error && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay períodos suficientes para comparar.
        </CardContent></Card>
      )}

      {periods.length > 0 && periods.length < count && (
        <p className="text-[11px] text-muted-foreground">
          Solo hay {periods.length} período{periods.length === 1 ? "" : "s"}{" "}
          disponible{periods.length === 1 ? "" : "s"} para esta compañía.
        </p>
      )}

      {/* Desktop: comparison table */}
      {periods.length > 0 && (
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Período</TableHead>
                    <TableHead className="text-xs text-right">Workers</TableHead>
                    <TableHead className="text-xs text-right">% comparable</TableHead>
                    <TableHead className="text-xs text-right">Horas Connecteam</TableHead>
                    <TableHead className="text-xs text-right">Horas nativas</TableHead>
                    <TableHead className="text-xs text-right">Δ horas</TableHead>
                    <TableHead className="text-xs text-right">Δ %</TableHead>
                    <TableHead className="text-xs text-right">Δ crítico</TableHead>
                    <TableHead className="text-xs text-right">No cmp.</TableHead>
                    <TableHead className="text-xs text-right">Abiertas</TableHead>
                    <TableHead className="text-xs text-right">Sin shift</TableHead>
                    <TableHead className="text-xs text-right">Anormales</TableHead>
                    <TableHead className="text-xs text-right">Medianoche</TableHead>
                    <TableHead className="text-xs text-right">Overlaps</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((pm) => (
                    <TableRow key={pm.period.id}>
                      <TableCell className="text-xs font-medium whitespace-nowrap">
                        {pm.period.sequence_number
                          ? `#${pm.period.sequence_number} · `
                          : ""}
                        {pm.period.start_date} → {pm.period.end_date}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{pm.workers}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {pm.comparablePct != null ? `${pm.comparablePct}%` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{pm.connecteamHours.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{pm.nativeHours.toFixed(2)}</TableCell>
                      <TableCell className={cn(
                        "text-xs text-right tabular-nums font-semibold",
                        Math.abs(pm.deltaHours) >= 10 && "text-destructive",
                      )}>
                        {pm.deltaHours >= 0 ? "+" : ""}{pm.deltaHours.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {pm.deltaPercent != null
                          ? `${pm.deltaPercent >= 0 ? "+" : ""}${pm.deltaPercent.toFixed(1)}%`
                          : "—"}
                      </TableCell>
                      <TableCell className={cn(
                        "text-xs text-right tabular-nums",
                        pm.criticalWorkers > 0 && "text-destructive font-semibold",
                      )}>{pm.criticalWorkers}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{pm.notComparableWorkers}</TableCell>
                      <TableCell className={cn(
                        "text-xs text-right tabular-nums",
                        pm.openEntries > 0 && "text-amber-700 dark:text-amber-200",
                      )}>{pm.openEntries}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{pm.noShiftEntries}</TableCell>
                      <TableCell className={cn(
                        "text-xs text-right tabular-nums",
                        pm.abnormalEntries > 0 && "text-destructive",
                      )}>{pm.abnormalEntries}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{pm.midnightEntries}</TableCell>
                      <TableCell className={cn(
                        "text-xs text-right tabular-nums",
                        pm.overlapEntries > 0 && "text-destructive",
                      )}>{pm.overlapEntries}</TableCell>
                      <TableCell><StatusBadge status={pm.status} /></TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                          <Link
                            to={`/app/payroll-native-dry-run?period=${pm.period.id}`}
                            title="Abrir en dry-run individual"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile: cards */}
      {periods.length > 0 && (
        <div className="grid gap-3 md:hidden">
          {periods.map((pm) => (
            <Card key={pm.period.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">
                    {pm.period.sequence_number ? `#${pm.period.sequence_number} · ` : ""}
                    {pm.period.start_date}
                    <div className="text-[10px] text-muted-foreground">→ {pm.period.end_date}</div>
                  </div>
                  <StatusBadge status={pm.status} />
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <Field label="Workers" value={pm.workers} />
                  <Field label="% comparable" value={pm.comparablePct != null ? `${pm.comparablePct}%` : "—"} />
                  <Field label="Horas Connecteam" value={pm.connecteamHours.toFixed(2)} />
                  <Field label="Horas nativas" value={pm.nativeHours.toFixed(2)} />
                  <Field
                    label="Δ horas"
                    value={`${pm.deltaHours >= 0 ? "+" : ""}${pm.deltaHours.toFixed(2)}`}
                    tone={Math.abs(pm.deltaHours) >= 10 ? "danger" : "muted"}
                  />
                  <Field
                    label="Δ %"
                    value={pm.deltaPercent != null ? `${pm.deltaPercent >= 0 ? "+" : ""}${pm.deltaPercent.toFixed(1)}%` : "—"}
                  />
                  <Field label="Δ crítico" value={pm.criticalWorkers} tone={pm.criticalWorkers > 0 ? "danger" : "muted"} />
                  <Field label="No comparables" value={pm.notComparableWorkers} tone={pm.notComparableWorkers > 0 ? "warn" : "muted"} />
                  <Field label="Abiertas" value={pm.openEntries} tone={pm.openEntries > 0 ? "warn" : "muted"} />
                  <Field label="Sin shift" value={pm.noShiftEntries} tone={pm.noShiftEntries > 0 ? "warn" : "muted"} />
                  <Field label="Anormales" value={pm.abnormalEntries} tone={pm.abnormalEntries > 0 ? "danger" : "muted"} />
                  <Field label="Overlaps" value={pm.overlapEntries} tone={pm.overlapEntries > 0 ? "danger" : "muted"} />
                </div>
                <Button asChild variant="outline" size="sm" className="w-full h-8 text-xs">
                  <Link to={`/app/payroll-native-dry-run?period=${pm.period.id}`}>
                    Abrir en dry-run individual
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Repeat offenders */}
      {periods.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-xs font-semibold">
              Workers reincidentes en delta crítico
              <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                (2 o más períodos)
              </span>
            </div>
            {repeatOffenders.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">
                Sin workers reincidentes en la ventana comparada.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Worker</TableHead>
                      <TableHead className="text-[11px] text-right"># períodos</TableHead>
                      <TableHead className="text-[11px] text-right">Δ acumulado</TableHead>
                      <TableHead className="text-[11px]">Razones frecuentes</TableHead>
                      <TableHead className="text-[11px]">Último estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repeatOffenders.map((r) => {
                      const emp = emps.get(r.employee_id);
                      const name = emp
                        ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "Sin nombre"
                        : r.employee_id.slice(0, 8);
                      const topReasons = Object.entries(r.reasonCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4);
                      return (
                        <TableRow key={r.employee_id}>
                          <TableCell className="text-[11px] font-medium">{name}</TableCell>
                          <TableCell className="text-[11px] text-right tabular-nums font-semibold text-destructive">
                            {r.periodsCritical}
                          </TableCell>
                          <TableCell className="text-[11px] text-right tabular-nums">
                            {r.totalDelta >= 0 ? "+" : ""}{r.totalDelta.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {topReasons.map(([k, n]) => (
                                <Badge
                                  key={k}
                                  variant="outline"
                                  className="text-[9px]"
                                >
                                  {REASON_LABEL[k] ?? k} · {n}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell><StatusBadge status={r.lastStatus} /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recurring issues */}
      {periods.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-xs font-semibold">Problemas recurrentes</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Problema</TableHead>
                    {periods.map((pm) => (
                      <TableHead key={pm.period.id} className="text-[11px] text-right whitespace-nowrap">
                        {pm.period.sequence_number ? `#${pm.period.sequence_number}` : pm.period.start_date}
                      </TableHead>
                    ))}
                    <TableHead className="text-[11px] text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ISSUE_KEYS.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-[11px]">{row.label}</TableCell>
                      {periods.map((pm) => {
                        const v = pm[row.key] as number;
                        return (
                          <TableCell
                            key={pm.period.id}
                            className={cn(
                              "text-[11px] text-right tabular-nums",
                              v > 0 && row.tone === "danger" && "text-destructive font-semibold",
                              v > 0 && row.tone === "warn" && "text-amber-700 dark:text-amber-200",
                            )}
                          >
                            {v}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-[11px] text-right tabular-nums font-semibold">
                        {issueTotals[row.key] ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Usa esta tabla para separar: calidad de datos (abiertas, anormales,
              overlaps), linkeo shift↔entry (sin shift), reconciliación
              (workers no comparables), fichajes que cruzan día (medianoche).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PeriodStatus }) {
  switch (status) {
    case "stable":
      return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">Estable</Badge>;
    case "review":
      return <Badge className="bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30 text-[10px]">Revisar</Badge>;
    case "high_risk":
      return <Badge className="bg-destructive/10 text-destructive border-destructive/40 text-[10px]">Riesgo alto</Badge>;
  }
}

function Field({ label, value, tone = "muted" }: {
  label: string;
  value: string | number;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "text-amber-700 dark:text-amber-200"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/30 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", toneCls)}>{value}</span>
    </div>
  );
}
