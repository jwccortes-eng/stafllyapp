/**
 * Weekly Pay Breakdown — read-only adapter (Phase 1).
 *
 * Resolves the best available trace level for a worker's weekly pay total.
 * NEVER recalculates payroll. NEVER uses scheduled hours as payment.
 * NEVER writes. Only reads:
 *   - period_base_pay   (final amount)
 *   - imports           (source file metadata)
 *   - historical_payroll_entries.concept_payload (if present, JSON breakdown)
 *
 * Truth rule:
 *   If concept-level detail exists → return concept rows.
 *   Otherwise return ONE row { pay_type: 'final_total', trace_level: 'final_total_only' }.
 */

import { supabase } from "@/integrations/supabase/client";

export type PayType =
  | "final_total"
  | "hourly"
  | "daily_day_pay"
  | "weekend_day_pay"
  | "adjustment"
  | "bonus"
  | "deduction"
  | "reimbursement"
  | "ride"
  | "unknown";

export type TraceLevel =
  | "final_total_only"
  | "concept_breakdown"
  | "row_detail"
  | "matched_time_entry"
  | "matched_shift"
  | "matched_schedule";

export type Confidence = "exact" | "high" | "medium" | "low" | "manual_review";

export interface WeeklyPayBreakdownRow {
  company_id: string;
  period_id: string;
  employee_id: string;
  import_id: string | null;
  source_system: "Stafly" | "Connecteam" | "Unknown";
  source_file: string | null;
  source_row_number: number | null;
  date: string | null;
  job_client_location_text: string | null;
  shift_title: string | null;
  pay_concept: string;
  pay_type: PayType;
  hours_source: string | null;
  hours: number | null;
  rate: number | null;
  amount: number;
  total_component_amount: number;
  matched_shift_id: string | null;
  matched_time_entry_id: string | null;
  matched_assignment_id: string | null;
  trace_level: TraceLevel;
  confidence: Confidence;
  notes: string | null;
}

export interface WeeklyPayBreakdownSummary {
  final_total: number;
  traced_total: number;
  untraced_total: number;
  trace_coverage_pct: number;
  trace_level: TraceLevel;
  source_system: WeeklyPayBreakdownRow["source_system"];
  source_file: string | null;
  rows: WeeklyPayBreakdownRow[];
  status: "balanced" | "partial_trace" | "needs_review";
  notes: string | null;
}

const HISTORICAL_FILE_HINTS = ["untitled_report", "payroll", "connecteam"];

function classifySource(fileName: string | null | undefined): WeeklyPayBreakdownRow["source_system"] {
  if (!fileName) return "Stafly";
  const fn = fileName.toLowerCase();
  if (HISTORICAL_FILE_HINTS.some((h) => fn.includes(h))) return "Connecteam";
  return "Stafly";
}

function classifyConcept(label: string): { pay_type: PayType; concept: string } {
  const k = label.toLowerCase();
  if (k.includes("ryde") || k.includes("ride")) return { pay_type: "ride", concept: label };
  if (k.includes("tip")) return { pay_type: "bonus", concept: label };
  if (k.includes("reimb")) return { pay_type: "reimbursement", concept: label };
  if (k.includes("discount") || k.includes("deduction") || k.includes("descuento")) return { pay_type: "deduction", concept: label };
  if (k.includes("weekend")) return { pay_type: "weekend_day_pay", concept: label };
  if (k.includes("day pay") || k.includes("payper day") || k.includes("pay per day")) return { pay_type: "daily_day_pay", concept: label };
  if (k.includes("travel")) return { pay_type: "hourly", concept: label };
  if (k.includes("hour") || k.includes("hora")) return { pay_type: "hourly", concept: label };
  if (k.includes("bonus") || k.includes("otros") || k.includes("other")) return { pay_type: "bonus", concept: label };
  if (k.includes("adjust")) return { pay_type: "adjustment", concept: label };
  if (k === "total" || k === "total pay") return { pay_type: "final_total", concept: label };
  return { pay_type: "unknown", concept: label };
}

/**
 * Try to extract concept rows from `historical_payroll_entries.concept_payload`.
 * Returns null if no usable detail exists.
 */
function extractConceptRows(
  payload: Record<string, unknown> | null | undefined,
): { concept: string; pay_type: PayType; amount: number }[] | null {
  if (!payload || typeof payload !== "object") return null;

  // Option A: explicit array of concept rows
  const arr = (payload as any).concepts ?? (payload as any).rows ?? (payload as any).breakdown;
  if (Array.isArray(arr) && arr.length > 0) {
    const out: { concept: string; pay_type: PayType; amount: number }[] = [];
    for (const r of arr) {
      const label = String(r?.concept ?? r?.label ?? r?.name ?? "").trim();
      const amt = Number(r?.amount ?? r?.value ?? 0);
      if (!label || !Number.isFinite(amt) || amt === 0) continue;
      const cls = classifyConcept(label);
      out.push({ concept: cls.concept, pay_type: cls.pay_type, amount: amt });
    }
    if (out.length > 0) return out;
  }

  // Option B: flat object of label -> amount (skip TOTAL itself & non-numeric)
  const SKIP = new Set(["total", "first name", "last name", "employer identification", "verification ssn ein", "verification ssn - ein", "ssn", "ein", "date", "corte", "observaciones"]);
  const flat: { concept: string; pay_type: PayType; amount: number }[] = [];
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const key = k.toLowerCase().trim();
    if (SKIP.has(key)) continue;
    const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(num) || num === 0) continue;
    const cls = classifyConcept(k);
    if (cls.pay_type === "final_total") continue;
    flat.push({ concept: cls.concept, pay_type: cls.pay_type, amount: num });
  }
  return flat.length > 0 ? flat : null;
}

export interface FetchBreakdownInput {
  companyId: string;
  periodId: string;
  employeeId: string;
}

/**
 * Fetch a worker's weekly pay breakdown for a given period.
 * Read-only. Always returns the safest representation possible.
 */
export async function fetchWeeklyPayBreakdown(
  input: FetchBreakdownInput,
): Promise<WeeklyPayBreakdownSummary | null> {
  const { companyId, periodId, employeeId } = input;
  if (!companyId || !periodId || !employeeId) return null;

  // 1) period_base_pay → final amount
  const { data: bp, error: bpErr } = await supabase
    .from("period_base_pay")
    .select("base_total_pay, import_id, total_regular, total_overtime, total_paid_hours, total_work_hours, weekly_total_hours")
    .eq("company_id", companyId)
    .eq("period_id", periodId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (bpErr || !bp) return null;

  const finalTotal = Number(bp.base_total_pay) || 0;
  const importId = (bp as any).import_id as string | null;

  // 2) imports → file metadata
  let sourceFile: string | null = null;
  if (importId) {
    const { data: imp } = await supabase
      .from("imports")
      .select("file_name")
      .eq("id", importId)
      .maybeSingle();
    sourceFile = (imp as any)?.file_name ?? null;
  }
  const sourceSystem = classifySource(sourceFile);

  // 3) Try historical_payroll_entries.concept_payload for breakdown detail
  let conceptRows: { concept: string; pay_type: PayType; amount: number }[] | null = null;
  try {
    const { data: hist } = await supabase
      .from("historical_payroll_entries")
      .select("concept_payload, source_file, source_system, import_id")
      .eq("company_id", companyId)
      .eq("period_id", periodId)
      .eq("matched_employee_id", employeeId)
      .maybeSingle();
    if (hist) {
      conceptRows = extractConceptRows((hist as any).concept_payload);
      if (!sourceFile) sourceFile = (hist as any).source_file ?? null;
    }
  } catch {
    // historical_payroll_entries may have admin-only RLS — silently skip for workers.
    conceptRows = null;
  }

  const baseRow = {
    company_id: companyId,
    period_id: periodId,
    employee_id: employeeId,
    import_id: importId,
    source_system: sourceSystem,
    source_file: sourceFile,
    source_row_number: null,
    date: null,
    job_client_location_text: null,
    shift_title: null,
    matched_shift_id: null,
    matched_time_entry_id: null,
    matched_assignment_id: null,
  };

  if (conceptRows && conceptRows.length > 0) {
    const rows: WeeklyPayBreakdownRow[] = conceptRows.map((c) => ({
      ...baseRow,
      pay_concept: c.concept,
      pay_type: c.pay_type,
      hours_source: null,
      hours: null,
      rate: null,
      amount: c.amount,
      total_component_amount: c.amount,
      trace_level: "concept_breakdown",
      confidence: "high",
      notes: null,
    }));
    const traced = rows.reduce((s, r) => s + r.amount, 0);
    const coverage = finalTotal > 0 ? Math.min(100, Math.round((traced / finalTotal) * 100)) : 0;
    return {
      final_total: finalTotal,
      traced_total: traced,
      untraced_total: Math.max(0, finalTotal - traced),
      trace_coverage_pct: coverage,
      trace_level: "concept_breakdown",
      source_system: sourceSystem,
      source_file: sourceFile,
      rows,
      status: Math.abs(finalTotal - traced) <= 0.01 ? "balanced" : "partial_trace",
      notes: null,
    };
  }

  // Fallback: final_total_only
  const fallback: WeeklyPayBreakdownRow = {
    ...baseRow,
    pay_concept: "Final paid amount",
    pay_type: "final_total",
    hours_source: null,
    hours: null,
    rate: null,
    amount: finalTotal,
    total_component_amount: finalTotal,
    trace_level: "final_total_only",
    confidence: "exact",
    notes: "Final total only — source detail unavailable.",
  };

  return {
    final_total: finalTotal,
    traced_total: finalTotal,
    untraced_total: 0,
    trace_coverage_pct: 0,
    trace_level: "final_total_only",
    source_system: sourceSystem,
    source_file: sourceFile,
    rows: [fallback],
    status: "balanced",
    notes:
      sourceSystem === "Connecteam"
        ? "Historical payroll record imported from Connecteam. Final paid amount. Some rows may not link to Stafly shifts."
        : "Final total only — source detail unavailable.",
  };
}
