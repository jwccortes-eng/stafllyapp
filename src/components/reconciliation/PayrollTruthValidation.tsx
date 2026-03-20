import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { DollarSign, CheckCircle2, AlertTriangle, Upload, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import {
  parsePayrollTruthWorkbook,
  type PayrollTruthParseResult,
  type PayrollTruthRow,
} from "@/lib/payroll-truth-parser";

type LedgerCategory = "hourly" | "daily" | "ride" | "weekend" | "manual" | "other";
type CompositionRole = "authoritative" | "informational_only" | "inferred" | "excluded_from_total";
type LedgerSourceType = "payroll_row" | "period_base_pay" | "movement";

interface LedgerEntry {
  id: string;
  sourceType: LedgerSourceType;
  sourcePayrollRowId: string | null;
  movementLabel: string;
  concept: string;
  qty: number;
  rate: number;
  value: number;
  included: boolean;
  compositionRole: CompositionRole;
  reason: string;
  category: LedgerCategory;
}

interface PayrollSourceRow {
  id: string;
  employee_id: string;
  pay_type: string | null;
  total_pay: number;
  total_hours: number;
  hourly_rate: number | null;
  notes: string | null;
}

interface ReconBreakdown {
  employee_id: string;
  employee_name: string;
  hourly_pay: number;
  daily_pay: number;
  ride_pay: number;
  weekend_pay: number;
  manual_adj: number;
  other_pay: number;
  total_final: number;
  authoritative_total: number;
  authoritative_source: string | null;
  inferred_total: number;
  movement_unique_total: number;
  naive_total: number;
  total_raw: number;
  total_suppressed: number;
  overlap_excluded_total: number;
  base_pay: number;
  schedule_count: number;
  clock_count: number;
  payroll_row_count: number;
  ledger: LedgerEntry[];
  flags: string[];
}

interface ComparisonRow {
  employee: string;
  truth: PayrollTruthRow;
  recon: ReconBreakdown | null;
  totalVariance: number;
  status: "match" | "close" | "mismatch" | "missing";
  compositionError: boolean;
  compositionReason: string | null;
}

interface Props {
  companyId: string | null;
  periodStatusId?: string;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function classifyMovement(conceptName: string): LedgerCategory {
  const n = conceptName.toLowerCase();
  if (n.includes("hourly") || n.includes("hora") || n.includes("regular") || n.includes("base pay")) return "hourly";
  if (n.includes("daily") || n.includes("diario")) return "daily";
  if (n.includes("ride") || n.includes("ryde") || n.includes("transporte")) return "ride";
  if (n.includes("weekend") || n.includes("doble") || n.includes("double")) return "weekend";
  if (n.includes("adjust") || n.includes("manual") || n.includes("correction") || n.includes("reintegro") || n.includes("bonus")) return "manual";
  return "other";
}

function classifyPayrollType(payType: string | null | undefined, notes: string | null | undefined): LedgerCategory {
  const t = (payType || "").toLowerCase().trim();
  if (t === "hourly" || t === "regular" || t === "regular pay" || t === "base" || t === "base pay" || t === "hora") return "hourly";
  if (t === "daily" || t === "daily pay" || t === "diario") return "daily";
  if (t === "pay_ride" || t === "ride" || t === "ryde" || t === "transporte") return "ride";
  if (t === "weekend_job" || t === "weekend" || t === "doble" || t === "double" || t === "paga doble") return "weekend";
  if (t === "manual_adjustment" || t === "manual" || t === "adjustment" || t === "bonus" || t === "reintegro" || t === "correction") return "manual";

  const n = (notes || "").toLowerCase();
  if (n.includes("weekend") || n.includes("doble") || n.includes("double")) return "weekend";
  if (n.includes("ride") || n.includes("ryde") || n.includes("transporte")) return "ride";
  if (n.includes("manual") || n.includes("adjust") || n.includes("reintegro") || n.includes("bonus")) return "manual";
  if (n.includes("daily") || n.includes("diario")) return "daily";
  if (n.includes("hourly") || n.includes("regular") || n.includes("hora")) return "hourly";

  return "other";
}

function payTypeLabel(payType: string | null | undefined): string {
  const t = (payType || "").toLowerCase();
  if (t === "hourly") return "Hourly/Base";
  if (t === "daily") return "Daily Pay";
  if (t === "pay_ride" || t === "ride") return "Ride Pay";
  if (t === "weekend_job") return "Weekend/Double";
  if (t === "manual_adjustment") return "Manual Adjustment";
  return "Payroll Row";
}

function addCategoryAmount(row: ReconBreakdown, category: LedgerCategory, value: number) {
  if (category === "hourly") row.hourly_pay += value;
  else if (category === "daily") row.daily_pay += value;
  else if (category === "ride") row.ride_pay += value;
  else if (category === "weekend") row.weekend_pay += value;
  else if (category === "manual") row.manual_adj += value;
  else row.other_pay += value;
}

function isExplicitSeparateMovement(note: string | null | undefined): boolean {
  if (!note) return false;
  return /(outside payroll|off[\s-]?cycle|separate payment|not in payroll|extra independiente|pago separado)/i.test(note);
}

function getConceptName(movement: any): string {
  const concepts = movement?.concepts;
  if (Array.isArray(concepts)) return String(concepts[0]?.name || "Unknown");
  return String(concepts?.name || "Unknown");
}

function findSourcePayrollRowId(
  movementCategory: LedgerCategory,
  value: number,
  payrollRows: PayrollSourceRow[]
): string | null {
  if (payrollRows.length === 0) return null;

  const exact = payrollRows.find(pr => {
    const c = classifyPayrollType(pr.pay_type, pr.notes);
    return c === movementCategory && Math.abs((Number(pr.total_pay) || 0) - value) < 0.01;
  });
  if (exact) return exact.id;

  const byCategory = payrollRows.find(pr => classifyPayrollType(pr.pay_type, pr.notes) === movementCategory);
  if (byCategory) return byCategory.id;

  return payrollRows[0].id;
}

export default function PayrollTruthValidation({ companyId, periodStatusId }: Props) {
  const [truthData, setTruthData] = useState<PayrollTruthRow[]>([]);
  const [truthParse, setTruthParse] = useState<PayrollTruthParseResult | null>(null);
  const [reconData, setReconData] = useState<ReconBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [truthLoaded, setTruthLoaded] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtVar = (v: number) => `${v >= 0 ? "+" : ""}${fmt(v)}`;

  const toggleRow = (name: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const loadTruthFile = async () => {
    setLoading(true);
    setTruthLoaded(false);
    setTruthData([]);
    setTruthParse(null);
    try {
      const res = await fetch(`/temp-import/payroll_truth_2025-12-24_to_2025-12-30.xlsx?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`No se pudo cargar (${res.status})`);
      const parsed = parsePayrollTruthWorkbook(await res.arrayBuffer());
      setTruthParse(parsed);
      setTruthData(parsed.rows);
      setTruthLoaded(true);
    } catch (err: any) {
      console.error("Error loading truth file:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId || !periodStatusId) {
      setReconData([]);
      return;
    }

    (async () => {
      const { data: periodStatusData } = await supabase
        .from("reconciliation_period_status" as any)
        .select("period_id, period_start, period_end, payroll_batch_id")
        .eq("id", periodStatusId)
        .eq("company_id", companyId)
        .maybeSingle();

      const periodStatus = periodStatusData as unknown as {
        period_id: string | null;
        period_start: string;
        period_end: string;
        payroll_batch_id: string | null;
      } | null;

      if (!periodStatus) {
        setReconData([]);
        return;
      }

      let effectivePeriodId: string | null = periodStatus.period_id ?? null;
      if (!effectivePeriodId) {
        const { data: matchedPeriodData } = await supabase
          .from("pay_periods" as any)
          .select("id")
          .eq("company_id", companyId)
          .eq("start_date", periodStatus.period_start)
          .eq("end_date", periodStatus.period_end)
          .maybeSingle();
        const matchedPeriod = matchedPeriodData as unknown as { id: string } | null;
        effectivePeriodId = matchedPeriod?.id ?? null;
      }

      const employeesPromise = supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("is_active", true);

      const basePayPromise = effectivePeriodId
        ? supabase
            .from("period_base_pay" as any)
            .select("id, employee_id, base_total_pay, total_work_hours, import_id")
            .eq("company_id", companyId)
            .eq("period_id", effectivePeriodId)
            .limit(1000)
        : Promise.resolve({ data: [] as any[] });

      const movementsPromise = effectivePeriodId
        ? supabase
            .from("movements" as any)
            .select("id, employee_id, quantity, rate, total_value, note, approval_status, concepts!inner(name)")
            .eq("company_id", companyId)
            .eq("period_id", effectivePeriodId)
            .limit(2000)
        : Promise.resolve({ data: [] as any[] });

      let payrollRowsQuery = supabase
        .from("normalized_payroll_rows" as any)
        .select("id, matched_employee_id, pay_type, total_pay, total_hours, hourly_rate, notes")
        .eq("company_id", companyId);

      if (periodStatus.payroll_batch_id) {
        payrollRowsQuery = payrollRowsQuery.eq("batch_id", periodStatus.payroll_batch_id);
      } else {
        payrollRowsQuery = payrollRowsQuery
          .gte("work_date", periodStatus.period_start)
          .lte("work_date", periodStatus.period_end);
      }

      let schedulesQuery = supabase
        .from("shifts" as any)
        .select("employee_id")
        .eq("company_id", companyId)
        .limit(2000);

      if (effectivePeriodId) {
        schedulesQuery = schedulesQuery.eq("period_id", effectivePeriodId);
      } else {
        schedulesQuery = schedulesQuery
          .gte("shift_start_date", periodStatus.period_start)
          .lte("shift_start_date", periodStatus.period_end);
      }

      const clocksQuery = supabase
        .from("time_entries" as any)
        .select("employee_id")
        .eq("company_id", companyId)
        .gte("clock_in", `${periodStatus.period_start}T00:00:00`)
        .lte("clock_in", `${periodStatus.period_end}T23:59:59`)
        .limit(2000);

      const [employeesRes, basePayRes, movementsRes, payrollRowsRes, schedulesRes, clocksRes] = await Promise.all([
        employeesPromise,
        basePayPromise,
        movementsPromise,
        payrollRowsQuery,
        schedulesQuery,
        clocksQuery,
      ]);

      const employees = (employeesRes.data || []) as any[];
      const basePay = (basePayRes.data || []) as any[];
      const movements = (movementsRes.data || []) as any[];
      const payrollRows = ((payrollRowsRes.data || []) as any[])
        .filter(pr => pr.matched_employee_id)
        .map(pr => ({
          id: String(pr.id),
          employee_id: String(pr.matched_employee_id),
          pay_type: pr.pay_type,
          total_pay: Number(pr.total_pay) || 0,
          total_hours: Number(pr.total_hours) || 0,
          hourly_rate: pr.hourly_rate == null ? null : Number(pr.hourly_rate),
          notes: pr.notes,
        })) as PayrollSourceRow[];
      const schedules = (schedulesRes.data || []) as any[];
      const clocks = (clocksRes.data || []) as any[];

      const empMap = new Map<string, string>();
      employees.forEach((e: any) => empMap.set(e.id, `${e.first_name || ""} ${e.last_name || ""}`.trim()));

      const breakdowns = new Map<string, ReconBreakdown>();
      const payrollRowsByEmployee = new Map<string, PayrollSourceRow[]>();

      for (const pr of payrollRows) {
        const arr = payrollRowsByEmployee.get(pr.employee_id) || [];
        arr.push(pr);
        payrollRowsByEmployee.set(pr.employee_id, arr);
      }

      const getOrCreate = (empId: string): ReconBreakdown => {
        if (!breakdowns.has(empId)) {
          breakdowns.set(empId, {
            employee_id: empId,
            employee_name: empMap.get(empId) || empId,
            hourly_pay: 0,
            daily_pay: 0,
            ride_pay: 0,
            weekend_pay: 0,
            manual_adj: 0,
            other_pay: 0,
            total_final: 0,
            authoritative_total: 0,
            authoritative_source: null,
            inferred_total: 0,
            movement_unique_total: 0,
            naive_total: 0,
            total_raw: 0,
            total_suppressed: 0,
            overlap_excluded_total: 0,
            base_pay: 0,
            schedule_count: 0,
            clock_count: 0,
            payroll_row_count: 0,
            ledger: [],
            flags: [],
          });
        }
        return breakdowns.get(empId)!;
      };

      for (const pr of payrollRows) {
        const row = getOrCreate(pr.employee_id);
        const category = classifyPayrollType(pr.pay_type, pr.notes);
        const value = round2(pr.total_pay);
        const qty = pr.total_hours > 0 ? pr.total_hours : 1;
        const rate = pr.hourly_rate != null ? pr.hourly_rate : qty > 0 ? round2(value / qty) : value;

        row.payroll_row_count += 1;
        row.authoritative_total = round2(row.authoritative_total + value);
        row.authoritative_source = "payroll_rows_total";
        addCategoryAmount(row, category, value);

        row.ledger.push({
          id: `payroll-${pr.id}`,
          sourceType: "payroll_row",
          sourcePayrollRowId: pr.id,
          movementLabel: payTypeLabel(pr.pay_type),
          concept: `Payroll row: ${payTypeLabel(pr.pay_type)}`,
          qty,
          rate,
          value,
          included: true,
          compositionRole: "authoritative",
          reason: "Included in authoritative payroll-row total for this period.",
          category,
        });
      }

      for (const bp of basePay) {
        const row = getOrCreate(bp.employee_id);
        const value = round2(Number(bp.base_total_pay) || 0);
        const hours = Number(bp.total_work_hours) || 0;

        row.base_pay = value;

        if (row.authoritative_total <= 0) {
          row.authoritative_total = value;
          row.authoritative_source = "period_base_pay";
          addCategoryAmount(row, "hourly", value);
          row.ledger.push({
            id: `base-${bp.id || row.employee_id}`,
            sourceType: "period_base_pay",
            sourcePayrollRowId: null,
            movementLabel: "Base Pay",
            concept: "Base Pay (period_base_pay)",
            qty: hours,
            rate: hours > 0 ? round2(value / hours) : value,
            value,
            included: true,
            compositionRole: "authoritative",
            reason: "Used as authoritative total because no payroll rows were available.",
            category: "hourly",
          });
        } else {
          row.ledger.push({
            id: `base-info-${bp.id || row.employee_id}`,
            sourceType: "period_base_pay",
            sourcePayrollRowId: null,
            movementLabel: "Base Pay",
            concept: "Base Pay (period_base_pay)",
            qty: hours,
            rate: hours > 0 ? round2(value / hours) : value,
            value,
            included: false,
            compositionRole: "informational_only",
            reason: "Informational only: payroll rows are authoritative for this employee/period.",
            category: "hourly",
          });
        }

        if (bp.import_id) row.flags.push("imported_base");
      }

      const movementsByEmployee = new Map<string, any[]>();
      for (const movement of movements) {
        const empId = String(movement.employee_id || "");
        if (!empId) continue;
        const arr = movementsByEmployee.get(empId) || [];
        arr.push(movement);
        movementsByEmployee.set(empId, arr);
      }

      movementsByEmployee.forEach((empMovements, empId) => {
        const row = getOrCreate(empId);
        const seen = new Map<string, number>();
        const sourcePayrollRows = payrollRowsByEmployee.get(empId) || [];

        for (const movement of empMovements) {
          const conceptName = getConceptName(movement);
          const category = classifyMovement(conceptName);
          const value = round2(Number(movement.total_value) || 0);
          const movementNote = String(movement.note || "");
          const dedupKey = `${conceptName}|${value}|${normalizeName(movementNote || "-")}`;
          const dedupCount = seen.get(dedupKey) || 0;
          const sourcePayrollRowId = findSourcePayrollRowId(category, value, sourcePayrollRows);

          row.total_raw = round2(row.total_raw + value);

          if (dedupCount > 0) {
            seen.set(dedupKey, dedupCount + 1);
            row.total_suppressed = round2(row.total_suppressed + value);
            row.flags.push(`dup_suppressed: ${conceptName} ${fmt(value)}`);

            row.ledger.push({
              id: `movement-${movement.id}`,
              sourceType: "movement",
              sourcePayrollRowId,
              movementLabel: conceptName,
              concept: conceptName,
              qty: Number(movement.quantity) || 0,
              rate: Number(movement.rate) || 0,
              value,
              included: false,
              compositionRole: "excluded_from_total",
              reason: `Duplicate movement suppressed (#${dedupCount + 1} for same concept/value/note).`,
              category,
            });
            continue;
          }

          seen.set(dedupKey, 1);
          row.movement_unique_total = round2(row.movement_unique_total + value);

          const hasAuthoritative = row.authoritative_total > 0;
          const explicitSeparate = isExplicitSeparateMovement(movementNote);

          let include = false;
          let compositionRole: CompositionRole = "excluded_from_total";
          let reason = "Excluded from total.";

          if (!hasAuthoritative) {
            include = true;
            compositionRole = "inferred";
            reason = "Included as inferred payable amount (no authoritative payroll total present).";
          } else if (explicitSeparate) {
            include = true;
            compositionRole = "inferred";
            reason = "Included as separate payable component due to explicit movement note evidence.";
          } else {
            include = false;
            compositionRole = "informational_only";
            reason = `Excluded from total: already accounted for in ${row.authoritative_source === "payroll_rows_total" ? "authoritative payroll TOTAL" : "authoritative base pay"}.`;
            row.overlap_excluded_total = round2(row.overlap_excluded_total + value);
          }

          if (include) {
            row.inferred_total = round2(row.inferred_total + value);
            addCategoryAmount(row, category, value);
          }

          row.ledger.push({
            id: `movement-${movement.id}`,
            sourceType: "movement",
            sourcePayrollRowId,
            movementLabel: conceptName,
            concept: conceptName,
            qty: Number(movement.quantity) || 0,
            rate: Number(movement.rate) || 0,
            value,
            included: include,
            compositionRole,
            reason,
            category,
          });
        }
      });

      const scheduleCounts = new Map<string, number>();
      for (const s of schedules) {
        if (!s.employee_id) continue;
        scheduleCounts.set(s.employee_id, (scheduleCounts.get(s.employee_id) || 0) + 1);
      }
      scheduleCounts.forEach((count, empId) => {
        getOrCreate(empId).schedule_count = count;
      });

      const clockCounts = new Map<string, number>();
      for (const c of clocks) {
        if (!c.employee_id) continue;
        clockCounts.set(c.employee_id, (clockCounts.get(c.employee_id) || 0) + 1);
      }
      clockCounts.forEach((count, empId) => {
        getOrCreate(empId).clock_count = count;
      });

      breakdowns.forEach(row => {
        row.total_final = round2(row.authoritative_total + row.inferred_total);
        row.naive_total = round2(row.authoritative_total + row.movement_unique_total + (row.authoritative_source === "payroll_rows_total" ? row.base_pay : 0));

        if (row.schedule_count === 0 && row.clock_count === 0 && row.payroll_row_count <= 1 && row.movement_unique_total > 0) {
          row.flags.push("no_work_evidence_guardrail_active");
        }

        if (row.overlap_excluded_total > 0) {
          row.flags.push(`overlap_excluded: ${fmt(row.overlap_excluded_total)}`);
        }

        if (row.total_suppressed > 0) {
          row.flags.push(`duplicate_suppressed_total: ${fmt(row.total_suppressed)}`);
        }

        // Safety threshold: flag if "other" exceeds 20% of total
        if (row.other_pay > 0 && row.total_final > 0) {
          const otherPct = (row.other_pay / row.total_final) * 100;
          if (otherPct > 20) {
            row.flags.push(`⚠️ CRITICAL: "Otros" is ${otherPct.toFixed(1)}% of total (${fmt(row.other_pay)} of ${fmt(row.total_final)})`);
          }
          // Log unmapped details
          const otherLedger = row.ledger.filter(l => l.category === "other" && l.included);
          if (otherLedger.length > 0) {
            console.warn(`[OTROS] ${row.employee_name}: ${otherLedger.length} "other" entries, $${row.other_pay.toFixed(2)}`,
              otherLedger.map(l => ({ concept: l.concept, value: l.value, id: l.id, sourceType: l.sourceType }))
            );
          }
        }
      });

      setReconData(Array.from(breakdowns.values()));
    })();
  }, [companyId, periodStatusId]);

  const comparison = useMemo<ComparisonRow[]>(() => {
    if (truthData.length === 0) return [];

    return truthData
      .map(t => {
        const recon = reconData.find(r => normalizeName(r.employee_name) === normalizeName(t.employee));
        if (!recon) {
          return {
            employee: t.employee,
            truth: t,
            recon: null,
            totalVariance: t.total,
            status: "missing" as const,
            compositionError: false,
            compositionReason: null,
          };
        }

        const totalVariance = round2(recon.total_final - t.total);
        const absTotal = Math.abs(totalVariance);
        const status = (absTotal < 1 ? "match" : absTotal < 50 ? "close" : "mismatch") as ComparisonRow["status"];

        const compositionError =
          recon.naive_total - t.total > 50 &&
          recon.overlap_excluded_total > 0 &&
          recon.authoritative_total > 0;

        const compositionReason = compositionError
          ? `Naive additive total ${fmt(recon.naive_total)} would overstate truth by ${fmtVar(round2(recon.naive_total - t.total))}; overlap guardrail excluded ${fmt(recon.overlap_excluded_total)}.`
          : null;

        return {
          employee: t.employee,
          truth: t,
          recon,
          totalVariance,
          status,
          compositionError,
          compositionReason,
        };
      })
      .sort((a, b) => {
        if (a.recon && !b.recon) return -1;
        if (!a.recon && b.recon) return 1;
        if (b.totalVariance !== a.totalVariance) return b.totalVariance - a.totalVariance;
        return Math.abs(b.totalVariance) - Math.abs(a.totalVariance);
      });
  }, [truthData, reconData]);

  const stats = useMemo(() => {
    const matched = comparison.filter(c => c.status === "match").length;
    const close = comparison.filter(c => c.status === "close").length;
    const mismatch = comparison.filter(c => c.status === "mismatch").length;
    const missing = comparison.filter(c => c.status === "missing").length;
    const compositionErrors = comparison.filter(c => c.compositionError).length;
    const totalTruth = truthData.reduce((sum, row) => sum + row.total, 0);
    const totalRecon = comparison.reduce((sum, row) => sum + (row.recon?.total_final || 0), 0);
    const totalSuppressed = comparison.reduce((sum, row) => sum + (row.recon?.total_suppressed || 0), 0);
    const totalOther = reconData.reduce((sum, row) => sum + (row.other_pay || 0), 0);
    return {
      matched,
      close,
      mismatch,
      missing,
      compositionErrors,
      totalTruth,
      totalRecon,
      variance: totalRecon - totalTruth,
      totalSuppressed,
      totalOther,
    };
  }, [comparison, truthData, reconData]);

  const [showRawRecords, setShowRawRecords] = useState(false);

  const statusBadge = (s: ComparisonRow["status"]) => {
    switch (s) {
      case "match":
        return <Badge variant="default" className="text-xs">✓ Exacto</Badge>;
      case "close":
        return <Badge variant="secondary" className="text-xs">≈ Cercano</Badge>;
      case "mismatch":
        return <Badge variant="destructive" className="text-xs">✗ Diferente</Badge>;
      case "missing":
        return <Badge variant="outline" className="text-xs">? No encontrado</Badge>;
    }
  };

  const explainVariance = (c: ComparisonRow): string => {
    if (!c.recon) return "Empleado no encontrado en reconciliación";

    const parts: string[] = [];
    const r = c.recon;
    const t = c.truth;

    parts.push(`Truth TOTAL is authoritative: ${fmt(t.total)}.`);

    if (r.authoritative_source === "payroll_rows_total") {
      parts.push(`Recon uses payroll-row TOTAL as authoritative: ${fmt(r.authoritative_total)}.`);
    } else if (r.authoritative_source === "period_base_pay") {
      parts.push(`Recon uses period base pay as authoritative: ${fmt(r.authoritative_total)}.`);
    } else {
      parts.push("Recon has no authoritative payroll/base total; inferred components are used.");
    }

    if (r.inferred_total > 0) parts.push(`Explicitly inferred separate components included: ${fmt(r.inferred_total)}.`);
    if (r.overlap_excluded_total > 0) parts.push(`Overlapping components excluded from total: ${fmt(r.overlap_excluded_total)}.`);
    if (r.total_suppressed > 0) parts.push(`Duplicate movements suppressed: ${fmt(r.total_suppressed)}.`);

    const variance = round2(r.total_final - t.total);
    parts.push(`Final variance: ${fmtVar(variance)}.`);

    if (c.compositionReason) parts.push(c.compositionReason);

    return parts.join(" ");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Validación vs. Nómina Pagada (12/24–12/30/2025)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!truthLoaded ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">Carga el archivo de nómina pagada para comparar.</p>
              <Button onClick={loadTruthFile} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                Cargar Payroll Truth Set
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <details className="text-xs rounded-md border border-border p-3 bg-muted/30">
                <summary className="cursor-pointer font-medium text-foreground">Debug parser</summary>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Sheet:</span> {truthParse?.sheetUsed ?? "N/A"}</p>
                  <p><span className="font-medium text-foreground">Columns:</span> {JSON.stringify(truthParse?.detectedColumns ?? {})}</p>
                </div>
              </details>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
                <KpiCard label="Empleados (Truth)" value={truthData.length} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard label="Exactos" value={stats.matched} icon={<CheckCircle2 className="h-4 w-4" />} accent="primary" />
                <KpiCard label="Cercanos" value={stats.close} icon={<AlertTriangle className="h-4 w-4" />} accent="warning" />
                <KpiCard label="Diferentes" value={stats.mismatch} icon={<AlertTriangle className="h-4 w-4" />} accent="deduction" />
                <KpiCard label="No encontrados" value={stats.missing} icon={<AlertTriangle className="h-4 w-4" />} accent="muted" />
                <KpiCard label="Comp. Error" value={stats.compositionErrors} icon={<AlertTriangle className="h-4 w-4" />} accent="deduction" />
                <KpiCard label="Total Truth" value={fmt(stats.totalTruth)} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard
                  label="Varianza Neta"
                  value={fmtVar(stats.variance)}
                  icon={<DollarSign className="h-4 w-4" />}
                  accent={Math.abs(stats.variance) > 100 ? "deduction" : "primary"}
                />
                <KpiCard label="Dups Suprimidos" value={fmt(stats.totalSuppressed)} icon={<AlertTriangle className="h-4 w-4" />} accent="deduction" />
                <KpiCard label="Otros / Sin clasificar" value={fmt(stats.totalOther)} icon={<AlertTriangle className="h-4 w-4" />} accent={stats.totalOther > 0 ? "deduction" : "muted"} />
              </div>

              {/* Safety threshold warning for "Otros" */}
              {stats.totalOther > 0 && stats.totalRecon > 0 && (stats.totalOther / stats.totalRecon) > 0.20 && (
                <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm">
                  <p className="font-semibold text-destructive">⚠️ ALERTA CRÍTICA: "Otros / Sin clasificar" representa {((stats.totalOther / stats.totalRecon) * 100).toFixed(1)}% del total reconciliado</p>
                  <p className="text-muted-foreground mt-1">Esto indica que hay registros de nómina que no están siendo clasificados correctamente. Revisa los registros crudos para identificar los conceptos no mapeados.</p>
                </div>
              )}

              {/* Raw records debug button */}
              <Button variant="outline" size="sm" onClick={() => setShowRawRecords(!showRawRecords)}>
                {showRawRecords ? "Ocultar" : "Ver"} registros crudos ({reconData.reduce((s, r) => s + r.ledger.length, 0)})
              </Button>

              {showRawRecords && (
                <div className="overflow-auto max-h-[400px] rounded border border-border bg-muted/30">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Tipo fuente</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Incluido</TableHead>
                        <TableHead>Rol</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconData.flatMap(r => 
                        r.ledger
                          .filter(l => l.category === "other" || !l.included || l.compositionRole === "excluded_from_total")
                          .map(l => (
                            <TableRow key={l.id} className={l.category === "other" ? "bg-destructive/5" : ""}>
                              <TableCell className="text-xs">{r.employee_name}</TableCell>
                              <TableCell className="text-xs font-mono">{l.concept}</TableCell>
                              <TableCell><Badge variant={l.category === "other" ? "destructive" : "outline"} className="text-xs">{l.category}</Badge></TableCell>
                              <TableCell className="text-xs">{l.sourceType}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{fmt(l.value)}</TableCell>
                              <TableCell className="text-xs">{l.included ? "✓" : "✗"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{l.compositionRole}</TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Truth TOTAL</TableHead>
                      <TableHead className="text-right">Recon Hourly</TableHead>
                      <TableHead className="text-right">Recon Daily</TableHead>
                      <TableHead className="text-right">Recon Ride</TableHead>
                      <TableHead className="text-right">Recon Wknd</TableHead>
                      <TableHead className="text-right">Recon Adj</TableHead>
                      <TableHead className="text-right text-destructive">Otros</TableHead>
                      <TableHead className="text-right">Recon TOTAL</TableHead>
                      <TableHead className="text-right">Varianza</TableHead>
                      <TableHead className="text-center">Sched</TableHead>
                      <TableHead className="text-center">Clocks</TableHead>
                      <TableHead className="text-center">Dups</TableHead>
                      <TableHead className="text-center">Comp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map(c => {
                      const isExpanded = expandedRows.has(c.employee);
                      const r = c.recon;
                      const dupsCount = r ? r.ledger.filter(l => l.compositionRole === "excluded_from_total").length : 0;

                      return (
                        <>
                          <TableRow
                            key={c.employee}
                            className={`cursor-pointer ${
                              c.status === "mismatch" ? "bg-destructive/5" :
                              c.status === "missing" ? "bg-warning/10" :
                              c.status === "match" ? "bg-primary/5" : ""
                            }`}
                            onClick={() => toggleRow(c.employee)}
                          >
                            <TableCell className="w-8 px-2">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{c.employee}</TableCell>
                            <TableCell>{statusBadge(c.status)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium">{fmt(c.truth.total)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r ? fmt(r.hourly_pay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r && r.daily_pay > 0 ? fmt(r.daily_pay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r && r.ride_pay > 0 ? fmt(r.ride_pay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r && r.weekend_pay > 0 ? fmt(r.weekend_pay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r && r.manual_adj !== 0 ? fmt(r.manual_adj) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium">{r ? fmt(r.total_final) : "—"}</TableCell>
                            <TableCell className={`text-right font-mono text-sm font-medium ${
                              Math.abs(c.totalVariance) > 50 ? "text-destructive" :
                              Math.abs(c.totalVariance) < 1 ? "text-primary" : "text-warning"
                            }`}>
                              {r ? fmtVar(c.totalVariance) : "N/A"}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">{r?.schedule_count ?? "—"}</TableCell>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">{r?.clock_count ?? "—"}</TableCell>
                            <TableCell className="text-center">
                              {dupsCount > 0 && <Badge variant="destructive" className="text-xs">{dupsCount}</Badge>}
                            </TableCell>
                            <TableCell className="text-center">
                              {c.compositionError && <Badge variant="destructive" className="text-xs">⚠</Badge>}
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${c.employee}-detail`} className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={15} className="p-3">
                                <div className="space-y-3 text-xs">
                                  <div className="rounded bg-background border border-border p-2">
                                    <p className="font-medium text-foreground mb-1">Explicación de varianza:</p>
                                    <p className="text-muted-foreground">{explainVariance(c)}</p>
                                    {c.compositionReason && (
                                      <p className="mt-2 text-destructive font-medium">Composition Error: {c.compositionReason}</p>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="font-medium text-foreground mb-1">Truth breakdown (TOTAL autoritativo):</p>
                                      <div className="space-y-0.5 text-muted-foreground font-mono">
                                        <p>Total Pay: {fmt(c.truth.totalPay)}</p>
                                        <p>PayperDay: {fmt(c.truth.payperDay)}</p>
                                        <p>Ryde: {fmt(c.truth.ryde)}</p>
                                        <p className="font-medium text-foreground">TOTAL: {fmt(c.truth.total)}</p>
                                      </div>
                                    </div>
                                    {r && (
                                      <div>
                                        <p className="font-medium text-foreground mb-1">Recon composition:</p>
                                        <div className="space-y-0.5 text-muted-foreground font-mono">
                                          <p>Authoritative source: {r.authoritative_source || "none"}</p>
                                          <p>Authoritative total: {fmt(r.authoritative_total)}</p>
                                          <p>Inferred included total: {fmt(r.inferred_total)}</p>
                                          <p>Excluded overlap total: {fmt(r.overlap_excluded_total)}</p>
                                          <p>Naive additive total (guardrail): {fmt(r.naive_total)}</p>
                                          <p className="font-medium text-foreground">TOTAL (final): {fmt(r.total_final)}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {r && r.ledger.length > 0 && (
                                    <div>
                                      <p className="font-medium text-foreground mb-1">
                                        Source Ledger ({r.ledger.length} entries, {r.ledger.filter(l => l.included).length} included)
                                      </p>
                                      <div className="overflow-auto max-h-56 border border-border rounded">
                                        <table className="w-full text-xs font-mono">
                                          <thead className="bg-muted/50 sticky top-0">
                                            <tr>
                                              <th className="p-1 text-left">Role</th>
                                              <th className="p-1 text-left">Source Row</th>
                                              <th className="p-1 text-left">Movement</th>
                                              <th className="p-1 text-left">Concept</th>
                                              <th className="p-1 text-left">Category</th>
                                              <th className="p-1 text-right">Qty</th>
                                              <th className="p-1 text-right">Rate</th>
                                              <th className="p-1 text-right">Value</th>
                                              <th className="p-1 text-left">Reason</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {r.ledger.map((l, i) => (
                                              <tr key={i} className={!l.included ? "bg-destructive/5" : ""}>
                                                <td className="p-1">{l.compositionRole}</td>
                                                <td className="p-1">{l.sourcePayrollRowId || "—"}</td>
                                                <td className="p-1 max-w-[180px] truncate">{l.movementLabel}</td>
                                                <td className="p-1 max-w-[180px] truncate">{l.concept}</td>
                                                <td className="p-1">{l.category}</td>
                                                <td className="p-1 text-right">{l.qty}</td>
                                                <td className="p-1 text-right">{fmt(l.rate)}</td>
                                                <td className="p-1 text-right">{fmt(l.value)}</td>
                                                <td className="p-1 max-w-[260px] truncate text-muted-foreground">{l.reason}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}

                                  {r && (
                                    <div className="flex gap-4 text-muted-foreground">
                                      <span>Schedules: {r.schedule_count}</span>
                                      <span>Clocks: {r.clock_count}</span>
                                      <span>Payroll rows: {r.payroll_row_count}</span>
                                      <span>Flags: {r.flags.length}</span>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
