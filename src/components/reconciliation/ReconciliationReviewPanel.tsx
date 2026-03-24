import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitCompareArrows, CheckCircle2, AlertTriangle, Link2, XCircle, User, Loader2, Eye } from "lucide-react";
import { matchScheduleToClock, type NormalizedScheduleRow, type NormalizedClockRow } from "@/lib/reconciliation-engine";
import MatchDetailDrawer from "./MatchDetailDrawer";
import MatchingConflictSummary from "./MatchingConflictSummary";
import UnmatchedScheduleBreakdown from "./UnmatchedScheduleBreakdown";
import ClockWithoutScheduleBreakdown from "./ClockWithoutScheduleBreakdown";
import CaseSamplingDiagnostic from "./CaseSamplingDiagnostic";

/** Fetch all rows from a table, scoped by batch_id if available, otherwise by date range, otherwise by company_id */
async function fetchAllByBatch(table: string, companyId: string, batchId: string | null, periodStart?: string | null, periodEnd?: string | null) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from(table as any)
      .select("*")
      .eq("company_id", companyId);
    if (batchId) {
      q = q.eq("batch_id", batchId);
    } else if (periodStart && periodEnd) {
      // Fallback: filter by work_date range when no batch scoping
      q = q.gte("work_date", periodStart).lte("work_date", periodEnd);
      console.log(`[fetchAllByBatch] ${table}: no batch_id, using date range ${periodStart} → ${periodEnd}`);
    }
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) { console.error(`[fetchAll] ${table} error:`, error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`[fetchAllByBatch] ${table}: ${all.length} rows fetched (batch: ${batchId || "NONE"}, dates: ${periodStart || "NONE"}→${periodEnd || "NONE"})`);
  return all;
}

interface PeriodScope {
  schedule_batch_id: string | null;
  clock_batch_id: string | null;
  payroll_batch_id: string | null;
  period_start: string;
  period_end: string;
  period_label: string;
}

interface Props {
  companyId: string | null;
  onRefresh: () => void;
  periodScope?: PeriodScope | null;
}

interface MatchRow {
  id: string;
  match_type: string;
  match_status: string;
  confidence_score: number;
  hours_variance: number | null;
  pay_variance: number | null;
  conflict_flags: any;
  employee_id: string | null;
  schedule_row_id: string | null;
  clock_row_id: string | null;
  payroll_row_id: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export default function ReconciliationReviewPanel({ companyId, onRefresh, periodScope }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [runningMatch, setRunningMatch] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scopeDebug, setScopeDebug] = useState<{ schedules: number; clocks: number; scheduleBatch: string | null; clockBatch: string | null; scopeMethod: string } | null>(null);
  const [preflightCounts, setPreflightCounts] = useState<{ schedules: number; clocks: number; loading: boolean } | null>(null);

  // Pre-flight: count rows that would be processed, scoped by date range
  useEffect(() => {
    if (!companyId || !periodScope) return;
    const pStart = periodScope.period_start;
    const pEnd = periodScope.period_end;
    if (!pStart || !pEnd) return;

    setPreflightCounts({ schedules: 0, clocks: 0, loading: true });

    const countScoped = async (table: string, batchId: string | null) => {
      let q = supabase.from(table as any).select("id", { count: "exact", head: true }).eq("company_id", companyId);
      if (batchId) {
        q = q.eq("batch_id", batchId);
      } else {
        q = q.gte("work_date", pStart).lte("work_date", pEnd);
      }
      const { count } = await q;
      return count || 0;
    };

    Promise.all([
      countScoped("normalized_schedule_rows", periodScope.schedule_batch_id),
      countScoped("normalized_clock_rows", periodScope.clock_batch_id),
    ]).then(([s, c]) => setPreflightCounts({ schedules: s, clocks: c, loading: false }));
  }, [companyId, periodScope]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    let q = supabase
      .from("reconciliation_matches" as any)
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (filter === "compensation") {
      q = q.contains("conflict_flags", ["clock_exempt"]);
    } else if (filter !== "all") {
      q = q.eq("match_status", filter);
    }

    q.then(({ data }) => {
      setMatches((data || []) as any);
      setLoading(false);
    });
  }, [companyId, filter]);

  const runMatching = async () => {
    if (!companyId) return;
    setRunningMatch(true);
    try {
      const schedBatch = periodScope?.schedule_batch_id || null;
      const clockBatch = periodScope?.clock_batch_id || null;
      console.log("[Matching] Scope:", {
        companyId,
        schedBatch,
        clockBatch,
        periodStart: periodScope?.period_start,
        periodEnd: periodScope?.period_end,
      });

      const pStart = periodScope?.period_start || null;
      const pEnd = periodScope?.period_end || null;
      const [schedules, clocks] = await Promise.all([
        fetchAllByBatch("normalized_schedule_rows", companyId, schedBatch, pStart, pEnd),
        fetchAllByBatch("normalized_clock_rows", companyId, clockBatch, pStart, pEnd),
      ]) as [NormalizedScheduleRow[], NormalizedClockRow[]];

      const scopeMethod = schedBatch ? "batch_id" : (pStart && pEnd ? "date_range" : "global");
      setScopeDebug({ schedules: schedules.length, clocks: clocks.length, scheduleBatch: schedBatch, clockBatch: clockBatch, scopeMethod });
      console.log("[Matching] Scoped rows — schedules:", schedules.length, "clocks:", clocks.length,
        `(scope: ${scopeMethod})`,
        schedBatch ? `(batch: ${schedBatch})` : `(date: ${pStart} → ${pEnd})`,
        clockBatch ? `(batch: ${clockBatch})` : `(date: ${pStart} → ${pEnd})`);

      if (schedules.length === 0 && clocks.length === 0) {
        toast({ title: "Sin datos", description: "Importa turnos y fichajes primero desde la pestaña Importar.", variant: "destructive" });
        return;
      }

      // Clear previous matches before re-running
      const { error: delErr } = await supabase
        .from("reconciliation_matches" as any)
        .delete()
        .eq("company_id", companyId);
      if (delErr) console.warn("[Matching] Could not clear old matches:", delErr);

      const results = matchScheduleToClock(schedules, clocks);
      const specialCount = results.filter(r => r.conflict_flags.includes("clock_exempt")).length;
      const structuralCount = results.filter(r => r.conflict_flags.includes("structural_no_context")).length;
      const availBlockCount = results.filter(r => r.conflict_flags.includes("availability_block")).length;
      const unmatchedSchedCount = results.filter(r => r.conflict_flags.includes("unmatched_schedule")).length;
      console.log("[Matching] Generated", results.length, "match results");
      console.log("[Matching] clock-exempt total:", specialCount, "| structural_no_context:", structuralCount, "| availability_block:", availBlockCount);
      console.log("[Matching] unmatched_schedule:", unmatchedSchedCount);

      // Context coverage stats + per-row debug
      const realScheds = schedules.filter((s: any) => !s._is_system);
      const debugRows = realScheds.map((s: any) => {
        const shiftTitle = String(s.shift_title || "").trim();
        const clientName = String(s.client_name || "").trim();
        const locationName = String(s.location_name || "").trim();
        const availabilityStatus = String(s.availability_status || "").trim();
        const lowered = `${shiftTitle} ${clientName} ${locationName} ${String(s.notes || "")}`.toLowerCase();

        let shiftCategory = "regular";
        if (availabilityStatus.toLowerCase() === "unavailable" || availabilityStatus.toLowerCase().includes("block")) shiftCategory = "availability_block";
        else if (!shiftTitle && !clientName && !locationName) shiftCategory = "structural_no_context";
        else if (lowered.includes("weekend job")) shiftCategory = "daily_pay";
        else if (lowered.includes("pay ride") || lowered.includes("ride")) shiftCategory = "ride_pay";

        return {
          work_date: s.work_date || "(null)",
          employee: s.employee_name_raw || s.employee_name_normalized || s.matched_employee_id || "(null)",
          shift_title: shiftTitle || "(null)",
          client_name: clientName || "(null)",
          location_name: locationName || "(null)",
          availability_status: availabilityStatus || "(null)",
          shift_category: shiftCategory,
        };
      });

      const nullTitle = debugRows.filter(r => r.shift_title === "(null)").length;
      const nullLoc = debugRows.filter(r => r.location_name === "(null)").length;
      const nullClient = debugRows.filter(r => r.client_name === "(null)").length;
      const availabilityRows = debugRows.filter(r => r.shift_category === "availability_block").length;
      const realNoContext = debugRows.filter(r => r.shift_category === "structural_no_context").length;

      console.log("[Matching] Schedule context coverage:", {
        total: debugRows.length,
        withShiftTitle: debugRows.length - nullTitle,
        withClientName: debugRows.length - nullClient,
        withLocationName: debugRows.length - nullLoc,
        availabilityBlock: availabilityRows,
        realNoContext,
      });
      console.log("[Matching] Per-row normalized schedule debug (Connecteam):");
      console.table(debugRows);

      // Debug: show examples of structural_no_context matches
      const structExamples = results.filter(r => r.conflict_flags.includes("structural_no_context")).slice(0, 10);
      if (structExamples.length > 0) {
        console.log("[Matching] structural_no_context examples:");
        structExamples.forEach((ex, i) => {
          const sched = schedules.find(s => s.id === ex.schedule_id);
          console.log(`  [${i}]`, {
            employee: ex.employee_id || "(none)",
            shift_title: sched?.shift_title || "(null)",
            job_title: sched?.job_title || "(null)",
            client: sched?.client_name || "(null)",
            location: sched?.location_name || "(null)",
            notes: sched?.notes || "(null)",
            availability_status: (sched as any)?.availability_status || "(null)",
            date: sched?.work_date || "(null)",
          });
        });
      } else {
        console.log("[Matching] structural_no_context: 0 rows matched — rule did not fire for this batch");
        // Debug: show 5 unmatched_schedule rows to understand why
        const unmatchedExamples = results.filter(r => r.conflict_flags.includes("unmatched_schedule")).slice(0, 5);
        console.log("[Matching] Sample unmatched_schedule rows for investigation:");
        unmatchedExamples.forEach((ex, i) => {
          const sched = schedules.find(s => s.id === ex.schedule_id);
          console.log(`  [${i}]`, {
            shift_title: sched?.shift_title || "(null)",
            job_title: sched?.job_title || "(null)",
            client: sched?.client_name || "(null)",
            location: sched?.location_name || "(null)",
            notes: sched?.notes || "(null)",
          });
        });
      }

      // Save matches
      const inserts = results.map(r => ({
        company_id: companyId,
        match_type: r.match_type,
        schedule_row_id: r.schedule_id,
        clock_row_id: r.clock_id,
        payroll_row_id: r.payroll_id,
        employee_id: r.employee_id,
        confidence_score: r.confidence,
        match_status: r.match_status,
        hours_variance: r.hours_variance,
        pay_variance: r.pay_variance,
        conflict_flags: r.conflict_flags,
      }));

      for (let i = 0; i < inserts.length; i += 100) {
        const { error } = await supabase.from("reconciliation_matches" as any).insert(inserts.slice(i, i + 100) as any);
        if (error) {
          console.error("[Matching] Match insert error:", error);
          throw error;
        }
      }

      // Create exceptions for unmatched
      const unmatched = results.filter(r => r.match_status === "unmatched");
      if (unmatched.length > 0) {
        const exceptions = unmatched.map(r => ({
          company_id: companyId,
          exception_type: r.conflict_flags.includes("clock_without_schedule") ? "unmatched_clock" : "unmatched_schedule",
          severity: "medium",
          source_type: r.schedule_id ? "schedule" : "clock",
          source_row_id: r.schedule_id || r.clock_id,
          employee_id: r.employee_id,
          description: `Unmatched ${r.schedule_id ? "schedule" : "clock"} record`,
          source_data: { flags: r.conflict_flags },
          status: "open",
        }));
        const { error: excErr } = await supabase.from("reconciliation_exceptions" as any).insert(exceptions as any);
        if (excErr) console.error("[Matching] Exception insert error:", excErr);
      }

      toast({ title: "Matching completado", description: `${results.length} emparejamientos generados, ${unmatched.length} sin match.` });
      onRefresh();

      // Reload matches
      const { data: newMatches } = await supabase
        .from("reconciliation_matches" as any)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      setMatches((newMatches || []) as any);
    } catch (err: any) {
      console.error("[Matching] Error:", err);
      toast({ title: "Error en matching", description: err.message, variant: "destructive" });
    } finally {
      setRunningMatch(false);
    }
  };

  const resolveMatch = async (id: string, status: string, note?: string) => {
    const { error } = await supabase
      .from("reconciliation_matches" as any)
      .update({ match_status: status, resolved_by: user?.id, resolved_at: new Date().toISOString(), resolution_note: note || null } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMatches(prev => prev.map(m => m.id === id ? { ...m, match_status: status, resolution_note: note || null } : m));
      toast({ title: `Match ${status === "approved" ? "aprobado" : status === "rejected" ? "rechazado" : "resuelto como " + status}` });
    }
  };

  const openDetail = (m: MatchRow) => {
    setSelectedMatch(m);
    setDrawerOpen(true);
  };

  const isCompensationRow = (flags: any) => {
    const f = Array.isArray(flags) ? flags : [];
    return f.includes("clock_exempt");
  };

  const compensationLabel = (flags: any): string | null => {
    const f = Array.isArray(flags) ? flags : [];
    if (f.includes("daily_pay_weekend_job")) return "Daily Pay (Weekend Job)";
    if (f.includes("ride_pay")) return "Ride Pay (Pay Ride)";
    return null;
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "exact": return "default";
      case "probable": return "secondary";
      case "ambiguous": return "outline";
      case "approved": return "default";
      case "rejected": return "destructive";
      default: return "destructive";
    }
  };

  return (
    <div className="space-y-4">
      {/* Scope debug banner */}
      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-2 text-xs space-y-1">
        <p className="font-medium text-sm">🔍 Scope del Matching</p>
        {periodScope ? (
          <>
            <p>Periodo: <span className="font-mono">{periodScope.period_label}</span> ({periodScope.period_start} → {periodScope.period_end})</p>
            <p>Schedule batch: <span className="font-mono">
              {periodScope.schedule_batch_id 
                ? periodScope.schedule_batch_id 
                : `Filtrado por fechas: ${periodScope.period_start} → ${periodScope.period_end}`}
            </span>
              {!periodScope.schedule_batch_id && <Badge variant="outline" className="ml-2 text-[10px]">date-range scope</Badge>}
            </p>
            <p>Clock batch: <span className="font-mono">
              {periodScope.clock_batch_id 
                ? periodScope.clock_batch_id 
                : `Filtrado por fechas: ${periodScope.period_start} → ${periodScope.period_end}`}
            </span>
              {!periodScope.clock_batch_id && <Badge variant="outline" className="ml-2 text-[10px]">date-range scope</Badge>}
            </p>
            <p>Payroll batch: <span className="font-mono">{periodScope.payroll_batch_id || "—"}</span></p>
            {preflightCounts && !preflightCounts.loading && (
              <div className="mt-1 flex items-center gap-3">
                <Badge variant="secondary" className="text-[10px]">
                  📋 {preflightCounts.schedules} schedules en periodo
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  ⏱ {preflightCounts.clocks} clocks en periodo
                </Badge>
                <Badge variant="default" className="text-[10px] bg-primary/80">
                  ✅ Scoped — solo datos del periodo activo
                </Badge>
              </div>
            )}
            {preflightCounts?.loading && (
              <p className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Contando filas del periodo…</p>
            )}
          </>
        ) : (
          <p className="text-destructive font-medium">⚠️ Sin periodo activo — matching cargará TODOS los rows de la empresa (puede incluir datos históricos)</p>
        )}
        {scopeDebug && (
          <p className="mt-1 text-muted-foreground">
            Último matching: <span className="font-mono">{scopeDebug.schedules}</span> schedules, <span className="font-mono">{scopeDebug.clocks}</span> clocks
            {scopeDebug.scopeMethod === "date_range" && <Badge variant="outline" className="ml-2 text-[10px]">filtrado por fechas</Badge>}
            {scopeDebug.scopeMethod === "batch_id" && <Badge variant="outline" className="ml-2 text-[10px]">filtrado por batch</Badge>}
            {scopeDebug.scopeMethod === "global" && <span className="text-destructive ml-2">⚠️ Global — sin filtro</span>}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="exact">Exactos</SelectItem>
            <SelectItem value="probable">Probables</SelectItem>
            <SelectItem value="ambiguous">Ambiguos</SelectItem>
            <SelectItem value="unmatched">Sin match</SelectItem>
            <SelectItem value="compensation">Compensación especial</SelectItem>
            <SelectItem value="approved">Aprobados</SelectItem>
            <SelectItem value="valid_unscheduled">Trabajo sin agenda</SelectItem>
            <SelectItem value="linked">Vinculados</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={runMatching} disabled={runningMatch}>
          {runningMatch ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <GitCompareArrows className="h-4 w-4 mr-1" />}
          Ejecutar Matching
        </Button>
        <Badge variant="secondary">{matches.length} resultados</Badge>
      </div>

      <MatchingConflictSummary companyId={companyId} />
      <CaseSamplingDiagnostic companyId={companyId} />
      <ClockWithoutScheduleBreakdown companyId={companyId} onRefresh={onRefresh} />
      <UnmatchedScheduleBreakdown companyId={companyId} onRefresh={onRefresh} />

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : matches.length === 0 ? (
        <EmptyState icon={GitCompareArrows} title="Sin emparejamientos" description="Importa datos y ejecuta el matching para ver resultados." />
      ) : (
        <Card>
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Confianza</TableHead>
                  <TableHead>Var. Horas</TableHead>
                  <TableHead>Var. Pago</TableHead>
                  <TableHead>Conflictos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map(m => {
                  const compLabel = compensationLabel(m.conflict_flags);
                  return (
                  <TableRow key={m.id} className={`cursor-pointer hover:bg-accent/50 ${m.match_status === "unmatched" ? "bg-destructive/5" : m.match_status === "ambiguous" ? "bg-amber-500/5" : isCompensationRow(m.conflict_flags) ? "bg-primary/5" : ""}`} onClick={() => openDetail(m)}>
                    <TableCell>
                      {compLabel ? (
                        <Badge className="text-xs bg-primary/10 text-primary border-primary/20">{compLabel}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{m.match_type.replace("_", " → ")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColor(m.match_status) as any} className="text-xs">
                        {m.match_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{m.confidence_score}%</TableCell>
                    <TableCell className={m.hours_variance && Math.abs(m.hours_variance) > 0.5 ? "text-destructive font-medium" : ""}>
                      {m.hours_variance != null ? `${m.hours_variance > 0 ? "+" : ""}${m.hours_variance.toFixed(1)}h` : "—"}
                    </TableCell>
                    <TableCell className={m.pay_variance && Math.abs(m.pay_variance) > 10 ? "text-destructive font-medium" : ""}>
                      {m.pay_variance != null ? `$${m.pay_variance.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {Array.isArray(m.conflict_flags) && m.conflict_flags.length > 0
                        ? m.conflict_flags.map((f: string) => (
                            <Badge key={f} variant="outline" className="text-xs mr-1">{f}</Badge>
                          ))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(m)} title="Inspeccionar">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {m.match_status !== "approved" && m.match_status !== "rejected" && !["linked","created_shift","valid_unscheduled","ignored_duplicate"].includes(m.match_status) && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => resolveMatch(m.id, "approved")}>
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => resolveMatch(m.id, "rejected")}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      <MatchDetailDrawer
        match={selectedMatch}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onResolve={resolveMatch}
        companyId={companyId}
      />
    </div>
  );
}
