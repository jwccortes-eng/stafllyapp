/**
 * PayrollNativeDryRun — /app/payroll-native-dry-run
 *
 * READ-ONLY comparison utility. Compares native `time_entries` hours vs the
 * current official payroll source (Connecteam reconciliation, surfaced via
 * `period_base_pay.total_work_hours`) per worker for a selected pay period.
 *
 * HARD RULES — do NOT change without explicit sprint approval:
 *  - No writes anywhere (no upserts, no RPC mutations, no inserts).
 *  - No payroll calculation — only comparison of already-persisted hours.
 *  - Does NOT change the official payroll source. Connecteam / reconciliation
 *    remains authoritative.
 *  - Does NOT use `scheduled_shifts` as source of truth for pay.
 *  - Read-only queries only: pay_periods, period_base_pay, time_entries,
 *    employees (name lookup). No RLS/auth/edge/RPC changes.
 *  - Rows lacking data on either side are marked "No comparable" — never
 *    fabricated.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { PayrollSourceGuardrailBanner } from "@/components/payroll/PayrollSourceGuardrailBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, ShieldAlert, ArrowLeft, Info } from "lucide-react";

interface Period {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  sequence_number: number | null;
}

interface PBP {
  employee_id: string;
  total_work_hours: number | null;
  base_total_pay: number | null;
}

interface TE {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number | null;
}

interface EmpLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface RowResult {
  employee_id: string;
  name: string;
  connecteamHours: number | null;
  nativeHours: number | null;
  entries: number;
  openEntries: number;
  deltaHours: number | null;
  status: "match" | "minor" | "critical" | "not_comparable";
  reason?: string;
}

const MINOR_DELTA_HOURS = 0.5;
const CRITICAL_DELTA_HOURS = 2;

export default function PayrollNativeDryRun() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [pbp, setPbp] = useState<PBP[]>([]);
  const [entries, setEntries] = useState<TE[]>([]);
  const [emps, setEmps] = useState<EmpLite[]>([]);
  const [openNoCompany, setOpenNoCompany] = useState<number>(0);

  // Load recent periods for the company (read-only).
  useEffect(() => {
    let cancelled = false;
    if (!selectedCompanyId) {
      setPeriods([]);
      setPeriodId("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date, status, sequence_number")
        .eq("company_id", selectedCompanyId)
        .order("start_date", { ascending: false })
        .limit(24);
      if (cancelled) return;
      const list = (data ?? []) as Period[];
      setPeriods(list);
      if (list.length && !periodId) setPeriodId(list[0].id);
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === periodId) ?? null,
    [periods, periodId],
  );

  // Load comparison data for the selected period.
  useEffect(() => {
    let cancelled = false;
    if (!selectedCompanyId || !selectedPeriod) {
      setPbp([]); setEntries([]); setEmps([]);
      return;
    }
    setLoading(true);
    (async () => {
      const startIso = `${selectedPeriod.start_date}T00:00:00`;
      const endIso = `${selectedPeriod.end_date}T23:59:59`;

      const [pbpRes, teRes, empsRes] = await Promise.all([
        supabase
          .from("period_base_pay")
          .select("employee_id, total_work_hours, base_total_pay")
          .eq("company_id", selectedCompanyId)
          .eq("period_id", selectedPeriod.id),
        supabase
          .from("time_entries")
          .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes")
          .eq("company_id", selectedCompanyId)
          .gte("clock_in", startIso)
          .lte("clock_in", endIso)
          .limit(5000),
        supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("company_id", selectedCompanyId)
          .limit(3000),
      ]);
      if (cancelled) return;
      setPbp((pbpRes.data ?? []) as PBP[]);
      setEntries((teRes.data ?? []) as TE[]);
      setEmps((empsRes.data ?? []) as EmpLite[]);
      // Diagnostic: entries in range without a company (should be 0 due to filter,
      // but keep placeholder for future orphan detection).
      setOpenNoCompany(0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId, selectedPeriod]);

  const empMap = useMemo(
    () => new Map(emps.map((e) => [e.id, e])),
    [emps],
  );

  // Aggregate native hours per employee from time_entries (closed only).
  // Open entries are counted separately and never converted to hours.
  const nativeAgg = useMemo(() => {
    const map = new Map<
      string,
      { hours: number; entries: number; open: number; noShiftLink: number }
    >();
    for (const e of entries) {
      const row = map.get(e.employee_id) ?? { hours: 0, entries: 0, open: 0, noShiftLink: 0 };
      row.entries += 1;
      if (!e.clock_out) {
        row.open += 1;
      } else {
        const ms = new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime();
        const min = Math.max(0, Math.round(ms / 60000) - (e.break_minutes ?? 0));
        row.hours += min / 60;
      }
      if (!e.shift_id) row.noShiftLink += 1;
      map.set(e.employee_id, row);
    }
    return map;
  }, [entries]);

  const pbpMap = useMemo(
    () => new Map(pbp.map((r) => [r.employee_id, r])),
    [pbp],
  );

  const rows: RowResult[] = useMemo(() => {
    const ids = new Set<string>([
      ...pbpMap.keys(),
      ...nativeAgg.keys(),
    ]);
    const out: RowResult[] = [];
    ids.forEach((id) => {
      const emp = empMap.get(id);
      const name = emp
        ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "Sin nombre"
        : "Empleado desconocido";
      const p = pbpMap.get(id);
      const n = nativeAgg.get(id);
      const connecteamHours = p?.total_work_hours ?? null;
      const nativeHours = n ? Number(n.hours.toFixed(2)) : null;
      const entriesCount = n?.entries ?? 0;
      const openEntries = n?.open ?? 0;

      if (connecteamHours == null && nativeHours == null) {
        out.push({
          employee_id: id, name, connecteamHours, nativeHours,
          entries: entriesCount, openEntries,
          deltaHours: null, status: "not_comparable",
          reason: "Sin datos en ninguna fuente",
        });
        return;
      }
      if (connecteamHours == null || nativeHours == null) {
        out.push({
          employee_id: id, name, connecteamHours, nativeHours,
          entries: entriesCount, openEntries,
          deltaHours: null, status: "not_comparable",
          reason: connecteamHours == null
            ? "Falta fila en reconciliación (Connecteam)"
            : "Sin fichajes nativos en el período",
        });
        return;
      }
      const delta = Number((nativeHours - connecteamHours).toFixed(2));
      const abs = Math.abs(delta);
      let status: RowResult["status"] = "match";
      if (abs >= CRITICAL_DELTA_HOURS) status = "critical";
      else if (abs >= MINOR_DELTA_HOURS) status = "minor";
      out.push({
        employee_id: id, name, connecteamHours, nativeHours,
        entries: entriesCount, openEntries,
        deltaHours: delta, status,
        reason: openEntries > 0 ? `${openEntries} fichaje(s) abierto(s) no contados` : undefined,
      });
    });
    // Sort: critical > minor > not_comparable > match; then |delta| desc
    const order = { critical: 0, minor: 1, not_comparable: 2, match: 3 } as const;
    out.sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return Math.abs(b.deltaHours ?? 0) - Math.abs(a.deltaHours ?? 0);
    });
    return out;
  }, [empMap, pbpMap, nativeAgg]);

  const totals = useMemo(() => {
    let connecteam = 0, native = 0, comparable = 0, notCmp = 0;
    let openTotal = 0, noShiftLinkTotal = 0;
    for (const r of rows) {
      if (r.status === "not_comparable") notCmp += 1;
      else {
        comparable += 1;
        connecteam += r.connecteamHours ?? 0;
        native += r.nativeHours ?? 0;
      }
      openTotal += r.openEntries;
    }
    for (const [, v] of nativeAgg) noShiftLinkTotal += v.noShiftLink;
    const delta = Number((native - connecteam).toFixed(2));
    const pct = connecteam > 0 ? (delta / connecteam) * 100 : null;
    return {
      workers: rows.length,
      comparable, notCmp,
      connecteam: Number(connecteam.toFixed(2)),
      native: Number(native.toFixed(2)),
      delta,
      pct,
      openTotal,
      noShiftLinkTotal,
    };
  }, [rows, nativeAgg]);

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <PageHeader
            title="Payroll nativo · Dry-run"
            subtitle="Comparación read-only: time_entries nativos vs Connecteam / reconciliación."
          />
          <p className="text-[11px] text-muted-foreground/80 max-w-2xl leading-relaxed">
            Dry-run read-only. Este análisis compara <code>time_entries</code> nativos contra
            Connecteam / reconciliación. No calcula payroll oficial, no escribe pagos y no
            cambia la fuente actual de pago.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline" size="sm" className="rounded-xl gap-1.5">
            <Link to="/app/payroll-reconciliation">
              <ArrowLeft className="h-4 w-4" /> Reconciliación
            </Link>
          </Button>
        </div>
      </div>

      {/* Permanent guardrail */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2.5">
        <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-destructive">
            Dry-run read-only. No calcula payroll oficial. No escribe pagos.
          </p>
          <p className="text-muted-foreground mt-0.5">
            Fuente oficial actual: Connecteam / Reconciliación externa. Los time entries
            nativos aún no son fuente final de pago. Modo seguro: no calcular payroll
            nativo desde <code>time_entries</code>.
          </p>
        </div>
      </div>

      <PayrollSourceGuardrailBanner />

      {!selectedCompanyId ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Selecciona una compañía para ejecutar el dry-run.
        </CardContent></Card>
      ) : (
        <>
          {/* Period picker */}
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center gap-3">
              <div className="text-xs text-muted-foreground">Compañía</div>
              <Badge variant="outline" className="text-xs">
                {selectedCompany?.name ?? "—"}
              </Badge>
              <div className="text-xs text-muted-foreground ml-2">Período</div>
              <div className="min-w-[280px]">
                <Select value={periodId} onValueChange={setPeriodId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecciona un período" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.sequence_number ? `#${p.sequence_number} · ` : ""}
                        {p.start_date} → {p.end_date} · {p.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardContent>
          </Card>

          {selectedPeriod && (
            <>
              {/* KPI strip */}
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                <Kpi label="Workers" value={totals.workers} />
                <Kpi label="Comparables" value={totals.comparable} tone="ok" />
                <Kpi label="No comparables" value={totals.notCmp} tone={totals.notCmp > 0 ? "warn" : "muted"} />
                <Kpi label="Horas Connecteam" value={totals.connecteam.toFixed(2)} />
                <Kpi label="Horas nativas (TE)" value={totals.native.toFixed(2)} />
                <Kpi
                  label="Δ horas"
                  value={`${totals.delta >= 0 ? "+" : ""}${totals.delta.toFixed(2)}`}
                  hint={totals.pct != null ? `${totals.pct >= 0 ? "+" : ""}${totals.pct.toFixed(1)}%` : undefined}
                  tone={Math.abs(totals.delta) >= CRITICAL_DELTA_HOURS * 5 ? "danger" : Math.abs(totals.delta) >= MINOR_DELTA_HOURS * 5 ? "warn" : "ok"}
                />
              </div>

              {/* Diagnostic */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline">Fichajes abiertos: {totals.openTotal}</Badge>
                <Badge variant="outline">Sin shift link: {totals.noShiftLinkTotal}</Badge>
                <Badge variant="outline" className="gap-1">
                  <Info className="h-3 w-3" /> Fichajes abiertos NO se convierten en horas
                </Badge>
              </div>

              {/* Comparison table */}
              <Card>
                <CardContent className="p-0">
                  {loading && rows.length === 0 ? (
                    <div className="py-12 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : rows.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Sin datos para comparar en este período.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Worker</TableHead>
                            <TableHead className="text-xs text-right">Horas Connecteam</TableHead>
                            <TableHead className="text-xs text-right">Horas nativas</TableHead>
                            <TableHead className="text-xs text-right">Δ horas</TableHead>
                            <TableHead className="text-xs text-center">Fichajes</TableHead>
                            <TableHead className="text-xs">Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.employee_id}>
                              <TableCell className="text-xs font-medium">{r.name}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">
                                {r.connecteamHours != null ? r.connecteamHours.toFixed(2) : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums">
                                {r.nativeHours != null ? r.nativeHours.toFixed(2) : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums">
                                {r.deltaHours != null
                                  ? `${r.deltaHours >= 0 ? "+" : ""}${r.deltaHours.toFixed(2)}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-center tabular-nums">
                                {r.entries}
                                {r.openEntries > 0 && (
                                  <span className="text-amber-700 font-semibold"> · {r.openEntries} abiertos</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                <StatusBadge status={r.status} />
                                {r.reason && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">{r.reason}</div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-[10px] text-muted-foreground text-center">
                Solo lectura · Este dry-run no escribe en <code>period_base_pay</code>,
                <code> pay_periods</code>, <code>reconciliation_*</code>,
                <code> payroll_adjustments</code> ni <code>movements</code>.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone = "muted" }: {
  label: string; value: string | number; hint?: string;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "text-amber-700 dark:text-amber-200"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${toneCls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: RowResult["status"] }) {
  switch (status) {
    case "match":
      return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">Match</Badge>;
    case "minor":
      return <Badge className="bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30 text-[10px]">Delta menor</Badge>;
    case "critical":
      return <Badge className="bg-destructive/10 text-destructive border-destructive/40 text-[10px]">Delta crítico</Badge>;
    case "not_comparable":
      return <Badge variant="outline" className="text-[10px]">No comparable</Badge>;
  }
}
