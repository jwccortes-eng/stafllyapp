import { useState, useEffect, useMemo, useCallback } from "react";
import NoTitleDiagnostics from "./NoTitleDiagnostics";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { detectShiftCategory, isClockExemptCategory, hasDoublePay, type ShiftCategory } from "@/lib/reconciliation-engine";
import {
  AlertTriangle, Clock, Users, Copy, Ban,
  CheckCircle2, FileQuestion, Loader2, ChevronDown, ChevronUp,
  Filter, Layers, ShieldOff,
} from "lucide-react";

/* ── Types ── */

interface ScheduleDetail {
  id: string;
  employee_name_raw: string | null;
  matched_employee_id: string | null;
  shift_title: string | null;
  pay_type: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
  client_name: string | null;
  location_name: string | null;
  notes: string | null;
  match_id: string;
}

type SubCategory =
  | "availability_block"
  | "no_times"
  | "duplicate"
  | "no_employee"
  | "has_payroll"
  | "real_missing"
  | "low_info";

interface SubBucket {
  key: SubCategory;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  action: string;
  bulkAction?: string;
}

interface DebugRow extends ScheduleDetail {
  subCategory: SubCategory;
  detectedCategory: ShiftCategory;
  requiresClock: boolean;
  excludedFromClockLogic: boolean;
  rawTitle: string;
  rawJob: string;
  rawLabel: string;
  recommendedClassification: string;
}

interface LabelStat {
  label: string;
  count: number;
  requiresClock: "yes" | "no";
  detectedCategory: string;
  recommendedClassification: string;
}

const SUB_BUCKETS: SubBucket[] = [
  {
    key: "availability_block",
    label: "Bloqueo / No disponible",
    icon: <ShieldOff className="h-4 w-4" />,
    color: "text-muted-foreground",
    description: "Filas de disponibilidad, bloqueo de turno o monitoreo — NO son turnos trabajados reales",
    action: "Excluir automáticamente — no requiere reloj ni reconciliación",
    bulkAction: "non_executable",
  },
  {
    key: "no_times",
    label: "Sin horario programado",
    icon: <Clock className="h-4 w-4" />,
    color: "text-amber-500",
    description: "Filas de agenda sin hora de inicio/fin — probablemente resúmenes o placeholders de Connecteam",
    action: "Marcar como agenda no ejecutable",
    bulkAction: "non_executable",
  },
  {
    key: "duplicate",
    label: "Duplicado de agenda",
    icon: <Copy className="h-4 w-4" />,
    color: "text-muted-foreground",
    description: "Mismo empleado + fecha + título aparece múltiples veces (importaciones duplicadas)",
    action: "Ignorar duplicados, conservar solo uno",
    bulkAction: "ignored_duplicate",
  },
  {
    key: "no_employee",
    label: "Sin empleado matcheado",
    icon: <Users className="h-4 w-4" />,
    color: "text-amber-500",
    description: "La fila tiene horario pero no se pudo vincular a ningún empleado del roster",
    action: "Resolver employee matching primero (alias o corrección manual)",
    bulkAction: undefined,
  },
  {
    key: "has_payroll",
    label: "Con evidencia de nómina",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-primary",
    description: "Existe un registro de nómina para este empleado en esta fecha — el trabajo sí fue pagado",
    action: "Validar que el pago es correcto y marcar como reconciliado sin reloj",
    bulkAction: "valid_unscheduled",
  },
  {
    key: "real_missing",
    label: "Fichaje realmente faltante",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-destructive",
    description: "Agenda con horario, empleado matcheado, sin fichaje ni evidencia de nómina",
    action: "Investigar: ¿ausencia? ¿turno cancelado? ¿fichaje con nombre diferente?",
    bulkAction: undefined,
  },
  {
    key: "low_info",
    label: "Información insuficiente",
    icon: <FileQuestion className="h-4 w-4" />,
    color: "text-muted-foreground",
    description: "Fila con datos incompletos que no permite clasificación confiable",
    action: "Revisar fuente de importación o marcar como no clasificable",
    bulkAction: "non_executable",
  },
];

/* ── Helpers ── */

const AVAILABILITY_BLOCK_PATTERN = /\b(unavailable|no\s*disponible|shift\s*block(ing)?|block(ed|ing)\s*(shift|schedule)?|breaking\s*policy|policy\s*block|monitoring|no[- ]?show\s*block(ing)?|not\s*available|day\s*off|off\s*day|blocked|disponibilidad|bloqueo|restricci[oó]n)\b/i;
// PAGA DOBLE is a pay modifier, not a separate category — kept for display only
const DOUBLE_PAY_PATTERN = /\b(paga\s*doble|double\s*pay)\b/i;

function isAvailabilityBlock(row: ScheduleDetail): boolean {
  const fields = [row.shift_title, row.client_name, row.location_name, row.notes].map(f => f || "");
  return AVAILABILITY_BLOCK_PATTERN.test(fields.join(" "));
}

function classifyScheduleRow(
  row: ScheduleDetail,
  duplicateKeys: Set<string>,
  payrollEmployeeDates: Set<string>,
): SubCategory {
  if (isAvailabilityBlock(row)) return "availability_block";
  if (!row.matched_employee_id) return "no_employee";
  if (!row.start_time && !row.end_time) return "no_times";

  const dupeKey = `${row.matched_employee_id || row.employee_name_raw}|${row.work_date}|${row.shift_title || ""}`;
  if (duplicateKeys.has(dupeKey)) return "duplicate";

  const payKey = `${row.matched_employee_id}|${row.work_date}`;
  if (payrollEmployeeDates.has(payKey)) return "has_payroll";

  if (!row.shift_title && !row.location_name && !row.client_name) return "low_info";
  return "real_missing";
}

function buildDuplicateKeys(rows: ScheduleDetail[]): Set<string> {
  const counts = new Map<string, number>();
  rows.forEach(r => {
    const key = `${r.matched_employee_id || r.employee_name_raw}|${r.work_date}|${r.shift_title || ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const dupes = new Set<string>();
  const seen = new Set<string>();
  rows.forEach(r => {
    const key = `${r.matched_employee_id || r.employee_name_raw}|${r.work_date}|${r.shift_title || ""}`;
    if ((counts.get(key) || 0) > 1) {
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    }
  });
  return dupes;
}

function normalizeValue(value: string | null | undefined, fallback = "(empty)"): string {
  const v = (value || "").trim();
  return v.length > 0 ? v : fallback;
}

function buildRawTitle(row: ScheduleDetail): string {
  return normalizeValue(row.shift_title, "(sin título)");
}

function buildRawJob(row: ScheduleDetail): string {
  return normalizeValue(row.pay_type, "(sin job/pay_type)");
}

function buildRawLabel(row: ScheduleDetail): string {
  const rawTitle = buildRawTitle(row);
  const rawJob = buildRawJob(row);
  return rawJob === "(sin job/pay_type)" ? rawTitle : `${rawTitle} · ${rawJob}`;
}

function mostFrequentKey(counter: Record<string, number>): string {
  return Object.entries(counter).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
}

function getRecommendedClassification(row: ScheduleDetail, subCategory: SubCategory, detectedCategory: ShiftCategory): string {
  if (detectedCategory === "availability_block") return "non_work_schedule";
  if (detectedCategory === "daily_pay") return "daily_pay_special_comp";
  if (detectedCategory === "ride_pay") return "ride_pay_special_comp";
  if (subCategory === "duplicate") return "ignore_duplicate_schedule";
  if (subCategory === "no_times") return "non_executable_schedule";
  if (subCategory === "has_payroll") return "paid_without_clock";
  if (subCategory === "no_employee") return "resolve_employee_matching";
  if (subCategory === "low_info") return "insufficient_context";

  // PAGA DOBLE is a pay modifier — these are normal worked shifts, classify as true_missing_clock
  // (the double_pay flag is handled separately in the engine)
  const combined = `${row.shift_title || ""} ${row.notes || ""}`;
  const isDP = hasDoublePay(combined);
  return isDP ? "true_missing_clock (double_pay)" : "true_missing_clock";
}

function aggregateLabelStats(rows: DebugRow[], keySelector: (row: DebugRow) => string, limit = 20): LabelStat[] {
  const map = new Map<string, {
    count: number;
    requiresClockYes: number;
    detectedCategoryCount: Record<string, number>;
    recommendedCount: Record<string, number>;
  }>();

  rows.forEach(row => {
    const key = keySelector(row);
    if (!map.has(key)) {
      map.set(key, {
        count: 0,
        requiresClockYes: 0,
        detectedCategoryCount: {},
        recommendedCount: {},
      });
    }
    const bucket = map.get(key)!;
    bucket.count += 1;
    if (row.requiresClock) bucket.requiresClockYes += 1;
    bucket.detectedCategoryCount[row.detectedCategory] = (bucket.detectedCategoryCount[row.detectedCategory] || 0) + 1;
    bucket.recommendedCount[row.recommendedClassification] = (bucket.recommendedCount[row.recommendedClassification] || 0) + 1;
  });

  return Array.from(map.entries())
    .map(([label, info]) => ({
      label,
      count: info.count,
      requiresClock: (info.requiresClockYes >= info.count / 2 ? "yes" : "no") as "yes" | "no",
      detectedCategory: mostFrequentKey(info.detectedCategoryCount),
      recommendedClassification: mostFrequentKey(info.recommendedCount),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/* ── Component ── */

interface Props {
  companyId: string | null;
  onRefresh: () => void;
}

export default function UnmatchedScheduleBreakdown({ companyId, onRefresh }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ScheduleDetail[]>([]);
  const [payrollDates, setPayrollDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    loadData(companyId);
  }, [companyId]);

  async function loadData(cid: string) {
    setLoading(true);

    // Fetch unmatched schedule match IDs + their schedule details
    const PAGE = 1000;
    let allRows: ScheduleDetail[] = [];
    let from = 0;

    while (true) {
      const { data } = await supabase
        .from("reconciliation_matches" as any)
        .select("id, schedule_row_id")
        .eq("company_id", cid)
        .contains("conflict_flags", ["unmatched_schedule"])
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;

      const schedIds = data.map((d: any) => d.schedule_row_id).filter(Boolean);
      if (schedIds.length > 0) {
        const { data: schedData } = await supabase
          .from("normalized_schedule_rows" as any)
          .select("id, employee_name_raw, matched_employee_id, shift_title, pay_type, work_date, start_time, end_time, total_hours, client_name, location_name, notes")
          .in("id", schedIds);

        const schedMap = new Map((schedData || []).map((s: any) => [s.id, s]));
        data.forEach((m: any) => {
          const s = schedMap.get(m.schedule_row_id);
          if (s) {
            allRows.push({ ...s, match_id: m.id } as ScheduleDetail);
          }
        });
      }

      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Fetch payroll evidence (employee+date combos)
    const payDates = new Set<string>();
    let pFrom = 0;
    while (true) {
      const { data } = await supabase
        .from("normalized_payroll_rows" as any)
        .select("matched_employee_id, work_date")
        .eq("company_id", cid)
        .not("matched_employee_id", "is", null)
        .range(pFrom, pFrom + PAGE - 1);
      if (!data || data.length === 0) break;
      data.forEach((r: any) => {
        if (r.matched_employee_id && r.work_date) {
          payDates.add(`${r.matched_employee_id}|${r.work_date}`);
        }
      });
      if (data.length < PAGE) break;
      pFrom += PAGE;
    }

    setPayrollDates(payDates);
    setRows(allRows);
    setLoading(false);
  }

  const duplicateKeys = useMemo(() => buildDuplicateKeys(rows), [rows]);

  const classified = useMemo(() => {
    const buckets: Record<SubCategory | "other", ScheduleDetail[]> = {
      availability_block: [], no_times: [], duplicate: [], no_employee: [], has_payroll: [],
      real_missing: [], low_info: [], other: [],
    };
    rows.forEach(r => {
      const cat = classifyScheduleRow(r, duplicateKeys, payrollDates);
      buckets[cat].push(r);
    });
    return buckets;
  }, [rows, duplicateKeys, payrollDates]);

  const debugRows = useMemo<DebugRow[]>(() => {
    return rows.map((row) => {
      const detectedCategory = detectShiftCategory(
        row.pay_type,
        row.shift_title,
        row.client_name,
        row.location_name,
        row.notes,
      );
      const requiresClock = !isClockExemptCategory(detectedCategory);
      const subCategory = classifyScheduleRow(row, duplicateKeys, payrollDates);
      const rawTitle = buildRawTitle(row);
      const rawJob = buildRawJob(row);
      const rawLabel = buildRawLabel(row);
      const recommendedClassification = getRecommendedClassification(row, subCategory, detectedCategory);
      const excludedFromClockLogic = !requiresClock || subCategory !== "real_missing";

      return {
        ...row,
        subCategory,
        detectedCategory,
        requiresClock,
        excludedFromClockLogic,
        rawTitle,
        rawJob,
        rawLabel,
        recommendedClassification,
      };
    });
  }, [rows, duplicateKeys, payrollDates]);

  const topShiftJobLabels = useMemo(
    () => aggregateLabelStats(debugRows, (row) => row.rawLabel, 20),
    [debugRows],
  );

  const topMissingClockTitles = useMemo(
    () => aggregateLabelStats(debugRows.filter((row) => row.subCategory === "real_missing"), (row) => row.rawTitle, 20),
    [debugRows],
  );

  const spotlightRows = useMemo(
    () => debugRows.filter((row) => DOUBLE_PAY_PATTERN.test(`${row.rawTitle} ${row.notes || ""}`)),
    [debugRows],
  );

  const spotlightStats = useMemo(
    () => aggregateLabelStats(spotlightRows, (row) => row.rawTitle, 20),
    [spotlightRows],
  );

  const debugTableRows = useMemo(() => {
    const prioritized = [...spotlightRows, ...debugRows.filter((row) => row.subCategory === "real_missing")];
    const seen = new Set<string>();
    const uniqueRows: DebugRow[] = [];
    for (const row of prioritized) {
      if (seen.has(row.match_id)) continue;
      seen.add(row.match_id);
      uniqueRows.push(row);
      if (uniqueRows.length >= 120) break;
    }
    return uniqueRows;
  }, [debugRows, spotlightRows]);

  const total = rows.length;

  const toggleSelect = (matchId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  };

  const selectBucket = (key: string) => {
    const bucketRows = classified[key as SubCategory] || [];
    const allSelected = bucketRows.every(r => selectedIds.has(r.match_id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      bucketRows.forEach(r => {
        if (allSelected) next.delete(r.match_id);
        else next.add(r.match_id);
      });
      return next;
    });
  };

  const applyBulkAction = async (status: string) => {
    if (selectedIds.size === 0) return;
    setApplying(true);
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const { error } = await supabase
          .from("reconciliation_matches" as any)
          .update({
            match_status: status,
            resolved_at: new Date().toISOString(),
            resolution_note: `Bulk: ${status}`,
          } as any)
          .in("id", batch);
        if (error) throw error;
      }
      toast({
        title: "Acción aplicada",
        description: `${ids.length} filas marcadas como "${status}"`,
      });
      setSelectedIds(new Set());
      onRefresh();
      if (companyId) loadData(companyId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analizando agendas sin fichaje...
        </CardContent>
      </Card>
    );
  }

  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Desglose: Agenda sin fichaje — {total.toLocaleString()} filas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
            <Badge variant="info">{selectedIds.size} seleccionadas</Badge>
            <Button size="sm" variant="outline" onClick={() => applyBulkAction("non_executable")} disabled={applying}>
              <Ban className="h-3 w-3 mr-1" /> No requiere reloj
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyBulkAction("ignored_duplicate")} disabled={applying}>
              <Copy className="h-3 w-3 mr-1" /> Ignorar duplicado
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyBulkAction("valid_unscheduled")} disabled={applying}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Trabajo válido sin reloj
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyBulkAction("expected_no_show")} disabled={applying}>
              <AlertTriangle className="h-3 w-3 mr-1" /> No-show esperado
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Limpiar
            </Button>
          </div>
        )}

        {/* Dominant root-cause diagnostics */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <div className="px-3 py-2 border-b border-border/60 bg-muted/30">
              <p className="text-sm font-medium flex items-center gap-2"><Filter className="h-4 w-4" /> Top 20 raw shift/job labels in Agenda sin fichaje</p>
            </div>
            <div className="overflow-auto max-h-[280px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead>Clock?</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Recommended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topShiftJobLabels.map((stat) => (
                    <TableRow key={`all-${stat.label}`}>
                      <TableCell className="text-xs max-w-[220px] truncate">{stat.label}</TableCell>
                      <TableCell className="text-right font-mono">{stat.count}</TableCell>
                      <TableCell>
                        <Badge variant={stat.requiresClock === "yes" ? "warning" : "success"} className="text-[10px]">
                          {stat.requiresClock}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{stat.detectedCategory}</TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate">{stat.recommendedClassification}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 overflow-hidden">
            <div className="px-3 py-2 border-b border-border/60 bg-muted/30">
              <p className="text-sm font-medium">Top 20 raw schedule titles still classified as missing-clock</p>
            </div>
            <div className="overflow-auto max-h-[280px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Raw title</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead>Clock?</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Recommended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topMissingClockTitles.map((stat) => (
                    <TableRow key={`missing-${stat.label}`}>
                      <TableCell className="text-xs max-w-[220px] truncate">{stat.label}</TableCell>
                      <TableCell className="text-right font-mono">{stat.count}</TableCell>
                      <TableCell>
                        <Badge variant={stat.requiresClock === "yes" ? "warning" : "success"} className="text-[10px]">
                          {stat.requiresClock}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{stat.detectedCategory}</TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate">{stat.recommendedClassification}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 p-3 bg-muted/20">
          <p className="text-sm font-medium mb-2">Spotlight check: 9877 PAGA DOBLE / repeated dominant labels</p>
          {spotlightStats.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {spotlightStats.slice(0, 10).map((stat) => (
                <Badge key={`spot-${stat.label}`} variant="outline" className="text-xs">
                  {stat.label}: {stat.count} · clock {stat.requiresClock} · {stat.detectedCategory}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No rows with "PAGA DOBLE / DOUBLE PAY" detected in current unmatched sample.</p>
          )}
        </div>

        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 bg-muted/30">
            <p className="text-sm font-medium">Temporary debug table (current period unmatched rows)</p>
          </div>
          <div className="overflow-auto max-h-[320px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw title</TableHead>
                  <TableHead>Raw job/pay_type</TableHead>
                  <TableHead>Raw notes</TableHead>
                  <TableHead>Raw location/client</TableHead>
                  <TableHead>Detected category</TableHead>
                  <TableHead>Excluded from clock-required?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {debugTableRows.map((row) => (
                  <TableRow key={`dbg-${row.match_id}`}>
                    <TableCell className="text-xs max-w-[180px] truncate">{row.rawTitle}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{row.rawJob}</TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate">{row.notes || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate">{row.location_name || row.client_name || "—"}</TableCell>
                    <TableCell className="text-xs">{row.detectedCategory}</TableCell>
                    <TableCell>
                      <Badge variant={row.excludedFromClockLogic ? "success" : "warning"} className="text-[10px]">
                        {row.excludedFromClockLogic ? "yes" : "no"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border/60">
            Showing {debugTableRows.length} prioritized rows (PAGA DOBLE + real missing) for proof-level debugging.
          </p>
        </div>

        {/* Sub-category breakdown */}
        {SUB_BUCKETS.map(b => {
          const bucketRows = classified[b.key] || [];
          if (bucketRows.length === 0) return null;
          const pct = total > 0 ? (bucketRows.length / total) * 100 : 0;
          const isExpanded = expandedBucket === b.key;
          const allChecked = bucketRows.every(r => selectedIds.has(r.match_id));

          return (
            <div key={b.key} className="border border-border/50 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-accent/30 transition-colors">
                {b.bulkAction && (
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={() => selectBucket(b.key)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <button
                  className="flex items-center gap-3 flex-1 text-left"
                  onClick={() => setExpandedBucket(isExpanded ? null : b.key)}
                >
                  <span className={b.color}>{b.icon}</span>
                  <span className="font-medium flex-1">{b.label}</span>
                  <Badge variant="secondary" className="font-mono">
                    {bucketRows.length.toLocaleString()}
                  </Badge>
                  <span className="text-xs text-muted-foreground w-14 text-right">
                    {pct.toFixed(1)}%
                  </span>
                  <Progress value={pct} className="w-20 h-2" />
                  {isExpanded
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-border/30 bg-muted/20">
                  <div className="px-4 pt-2 pb-1">
                    <p className="text-xs text-muted-foreground">{b.description}</p>
                    <p className="text-xs mt-1"><span className="font-semibold">Acción:</span> {b.action}</p>
                  </div>
                  <div className="overflow-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Empleado</TableHead>
                          <TableHead>Título</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Horario</TableHead>
                          <TableHead>Ubicación</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bucketRows.slice(0, 50).map(r => (
                          <TableRow key={r.match_id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(r.match_id)}
                                onCheckedChange={() => toggleSelect(r.match_id)}
                              />
                            </TableCell>
                            <TableCell className="text-sm max-w-[150px] truncate">
                              {r.employee_name_raw || "—"}
                              {!r.matched_employee_id && (
                                <Badge variant="outline" className="ml-1 text-[10px]">sin match</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm max-w-[120px] truncate">
                              {r.shift_title || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {r.work_date || "—"}
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {r.start_time && r.end_time
                                ? `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`
                                : <span className="text-muted-foreground">sin horario</span>}
                            </TableCell>
                            <TableCell className="text-xs max-w-[180px] truncate">
                              {r.location_name || r.client_name || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {bucketRows.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Mostrando 50 de {bucketRows.length} filas
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
