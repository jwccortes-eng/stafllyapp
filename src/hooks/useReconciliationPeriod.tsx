import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { normalizeText } from "@/lib/reconciliation-engine";

export interface PeriodStatus {
  id: string;
  company_id: string;
  period_id: string | null;
  period_label: string;
  period_start: string;
  period_end: string;
  status: string;
  schedule_batch_id: string | null;
  clock_batch_id: string | null;
  payroll_batch_id: string | null;
  total_employees: number;
  total_schedules: number;
  total_clocks: number;
  total_payroll_rows: number;
  total_exceptions: number;
  resolved_exceptions: number;
  total_matches: number;
  approved_matches: number;
  approved_by: string | null;
  approved_at: string | null;
  posted_by: string | null;
  posted_at: string | null;
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  reopen_count: number;
  publish_idempotency_key: string | null;
  notes: string | null;
  created_at: string;
}

export interface EmployeeFinalRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  scheduled_shifts: any[];
  worked_shifts: any[];
  payroll_rows: any[];
  total_scheduled_hours: number;
  total_worked_hours: number;
  total_payroll_hours: number;
  total_payroll_amount: number;
  pay_classification: string;
  hourly_rate: number | null;
  daily_rate: number | null;
  regular_hours: number;
  overtime_hours: number;
  hourly_pay_total: number;
  daily_pay_total: number;
  ride_pay_total: number;
  weekend_pay_total: number;
  manual_adjustment_total: number;
  grand_total: number;
  ride_amount: number;
  weekend_amount: number;
  manual_amount: number;
  base_pay: number;
  final_total_pay: number;
  reconciliation_status: string;
  conflict_count: number;
  resolution_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  warnings: any[];
  schedule_batch_id: string | null;
  clock_batch_id: string | null;
  payroll_batch_id: string | null;
  match_ids: string[];
  publishing_user: string | null;
  published_at: string | null;
  source_payroll_total: number;
  variance_amount: number;
  variance_status: string;
  variance_reasons: string[];
}

export interface EmployeeVariance {
  employee_id: string;
  employee_name: string;
  scheduled_count: number;
  worked_count: number;
  payroll_count: number;
  pay_classification: string;
  source_payroll_total: number;
  reconciled_total: number;
  published_total: number;
  variance_amount: number;
  variance_status: "exact_match" | "minor_variance" | "major_variance" | "unresolved";
  variance_reasons: string[];
  warnings: string[];
}

export interface ValidationResult {
  id?: string;
  period_status_id: string;
  is_dry_run: boolean;
  total_employees: number;
  employees_exact_match: number;
  employees_minor_variance: number;
  employees_major_variance: number;
  employees_unresolved: number;
  source_payroll_total: number;
  reconciled_total: number;
  published_total: number;
  total_variance: number;
  unresolved_exceptions: number;
  publish_readiness: "ready" | "ready_with_warnings" | "blocked";
  confidence_score: number;
  uat_checklist: Record<string, boolean>;
  employee_variances: EmployeeVariance[];
  notes?: string;
}

export const UAT_CHECKLIST_ITEMS = [
  { key: "hourly_employee", label: "Empleado por hora" },
  { key: "daily_employee", label: "Empleado diario" },
  { key: "ride_payment", label: "Pago de transporte (ride)" },
  { key: "weekend_job", label: "Weekend Job" },
  { key: "manual_adjustment", label: "Ajuste manual" },
  { key: "mixed_compensation", label: "Compensación mixta" },
  { key: "midnight_crossing", label: "Turno cruzando medianoche" },
  { key: "multiple_shifts_same_day", label: "Múltiples turnos mismo empleado mismo día" },
  { key: "unmatched_schedule", label: "Turno programado sin match" },
  { key: "unmatched_clock", label: "Fichaje sin match" },
  { key: "unmatched_payroll", label: "Fila de nómina sin match" },
  { key: "reopen_republish", label: "Reapertura y republicación" },
  { key: "duplicate_prevention", label: "Prevención de duplicados" },
] as const;

export interface ClosingReceipt {
  id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  total_employees: number;
  total_scheduled_shifts: number;
  total_worked_shifts: number;
  total_payroll_rows: number;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_hourly_pay: number;
  total_daily_pay: number;
  total_ride_pay: number;
  total_manual_adjustments: number;
  grand_total_posted: number;
  published_by: string;
  published_at: string;
}

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  importing: ["matching", "reviewing"],
  normalizing: ["matching", "reviewing"],
  matching: ["reviewing"],
  reviewing: ["approved"],
  approved: ["posted"],
  posted: ["locked"],
  locked: ["reopened"],
  reopened: ["reviewing"],
};

const LOCKED_STATUSES = ["posted", "locked"];

export function useReconciliationPeriod(companyId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PeriodStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePeriod, setActivePeriod] = useState<PeriodStatus | null>(null);
  const [finalRecords, setFinalRecords] = useState<EmployeeFinalRecord[]>([]);
  const [closingReceipt, setClosingReceipt] = useState<ClosingReceipt | null>(null);

  const loadPeriods = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("reconciliation_period_status" as any)
      .select("*")
      .eq("company_id", companyId)
      .order("period_start", { ascending: false })
      .limit(50);
    const loaded = (data || []) as any[];
    setPeriods(loaded);
    // Refresh activePeriod if it exists
    if (activePeriod) {
      const refreshed = loaded.find(p => p.id === activePeriod.id);
      if (refreshed) setActivePeriod(refreshed);
    }
    setLoading(false);
  }, [companyId, activePeriod?.id]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  const createPeriod = useCallback(async (label: string, start: string, end: string, periodId?: string) => {
    if (!companyId || !user?.id) return null;
    const { data, error } = await supabase
      .from("reconciliation_period_status" as any)
      .insert({
        company_id: companyId,
        period_label: label,
        period_start: start,
        period_end: end,
        period_id: periodId || null,
        status: "importing",
      } as any)
      .select("*")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return null;
    }
    await loadPeriods();
    return data as any as PeriodStatus;
  }, [companyId, user?.id, toast, loadPeriods]);

  const updatePeriodStatus = useCallback(async (periodStatusId: string, status: string, extras?: Record<string, any>) => {
    if (!user?.id) return;

    // Validate transition
    const period = periods.find(p => p.id === periodStatusId);
    if (period) {
      const allowed = VALID_TRANSITIONS[period.status];
      if (allowed && !allowed.includes(status)) {
        toast({ title: "Transición inválida", description: `No se puede pasar de "${period.status}" a "${status}".`, variant: "destructive" });
        return;
      }
    }

    const update: any = { status, updated_at: new Date().toISOString(), ...extras };
    if (status === "approved") {
      update.approved_by = user.id;
      update.approved_at = new Date().toISOString();
    }
    if (status === "posted") {
      update.posted_by = user.id;
      update.posted_at = new Date().toISOString();
    }
    if (status === "locked") {
      update.locked = true;
      update.locked_by = user.id;
      update.locked_at = new Date().toISOString();
    }
    if (status === "reopened") {
      update.locked = false;
      update.reopened_by = user.id;
      update.reopened_at = new Date().toISOString();
      update.reopen_count = (period?.reopen_count || 0) + 1;
      update.reopen_reason = extras?.reopen_reason || null;
      // After reopen, transition to reviewing
      update.status = "reviewing";
    }
    const { error } = await supabase
      .from("reconciliation_period_status" as any)
      .update(update as any)
      .eq("id", periodStatusId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    await loadPeriods();
  }, [user?.id, toast, loadPeriods, periods]);

  const reopenPeriod = useCallback(async (periodStatusId: string, reason: string) => {
    if (!user?.id || !reason.trim()) {
      toast({ title: "Se requiere una razón para reabrir", variant: "destructive" });
      return;
    }
    await updatePeriodStatus(periodStatusId, "reopened", { reopen_reason: reason });
    toast({ title: "Periodo reabierto", description: "El periodo ha vuelto a estado de revisión." });
  }, [user?.id, toast, updatePeriodStatus]);

  const loadFinalRecords = useCallback(async (periodStatusId: string) => {
    if (!companyId) return;
    const { data } = await supabase
      .from("reconciliation_final_records" as any)
      .select("*")
      .eq("period_status_id", periodStatusId)
      .order("created_at");
    setFinalRecords((data || []) as any);
  }, [companyId]);

  const loadClosingReceipt = useCallback(async (periodStatusId: string) => {
    if (!companyId) return;
    const { data } = await supabase
      .from("reconciliation_closing_receipts" as any)
      .select("*")
      .eq("period_status_id", periodStatusId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setClosingReceipt(data as any);
  }, [companyId]);

  // ── Pre-publish validation ──
  const validateBeforePublish = useCallback((records: EmployeeFinalRecord[]): { canPublish: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (records.length === 0) {
      errors.push("No hay registros de empleados para publicar.");
      return { canPublish: false, errors, warnings };
    }

    const unresolved = records.filter(r => r.reconciliation_status === "pending" || r.reconciliation_status === "partial");
    if (unresolved.length > 0) {
      errors.push(`${unresolved.length} empleado(s) con conflictos sin resolver.`);
    }

    const withConflicts = records.filter(r => r.conflict_count > 0 && r.reconciliation_status !== "approved");
    if (withConflicts.length > 0) {
      errors.push(`${withConflicts.length} empleado(s) con conflictos críticos no aprobados.`);
    }

    const unknownPay = records.filter(r => r.pay_classification === "unknown");
    if (unknownPay.length > 0) {
      errors.push(`${unknownPay.length} empleado(s) con clasificación de pago desconocida.`);
    }

    const zeroTotal = records.filter(r => (r.grand_total || r.final_total_pay) === 0);
    if (zeroTotal.length > 0) {
      warnings.push(`${zeroTotal.length} empleado(s) con total $0.`);
    }

    const highVariance = records.filter(r => {
      const diff = Math.abs(r.total_scheduled_hours - r.total_worked_hours);
      return diff > 8 && r.total_scheduled_hours > 0;
    });
    if (highVariance.length > 0) {
      warnings.push(`${highVariance.length} empleado(s) con gran variación horas programadas vs trabajadas.`);
    }

    return { canPublish: errors.length === 0, errors, warnings };
  }, []);

  // ── CORE: Generate final records with full payment breakdown ──
  const generateFinalRecords = useCallback(async (periodStatusId: string) => {
    if (!companyId || !user?.id) return;

    const period = periods.find(p => p.id === periodStatusId);
    if (!period) {
      toast({ title: "Error", description: "Periodo no encontrado", variant: "destructive" });
      return;
    }

    // Block if period is locked/posted
    if (LOCKED_STATUSES.includes(period.status)) {
      toast({ title: "Periodo bloqueado", description: "No se pueden regenerar registros de un periodo publicado/cerrado.", variant: "destructive" });
      return;
    }

    let schedQuery = supabase.from("normalized_schedule_rows" as any).select("*").eq("company_id", companyId);
    let clockQuery = supabase.from("normalized_clock_rows" as any).select("*").eq("company_id", companyId);
    let payrollQuery = supabase.from("normalized_payroll_rows" as any).select("*").eq("company_id", companyId);

    if (period.schedule_batch_id) schedQuery = schedQuery.eq("batch_id", period.schedule_batch_id);
    else schedQuery = schedQuery.gte("work_date", period.period_start).lte("work_date", period.period_end);

    if (period.clock_batch_id) clockQuery = clockQuery.eq("batch_id", period.clock_batch_id);
    else clockQuery = clockQuery.gte("work_date", period.period_start).lte("work_date", period.period_end);

    if (period.payroll_batch_id) payrollQuery = payrollQuery.eq("batch_id", period.payroll_batch_id);
    else payrollQuery = payrollQuery.gte("work_date", period.period_start).lte("work_date", period.period_end);

    // Matches should also be scoped — filter by period's batch or by created_at within period range
    let matchQuery = supabase.from("reconciliation_matches" as any).select("*").eq("company_id", companyId);

    console.log("[generateFinalRecords] Scope:", {
      periodLabel: period.period_label,
      start: period.period_start,
      end: period.period_end,
      schedBatch: period.schedule_batch_id || "DATE_RANGE",
      clockBatch: period.clock_batch_id || "DATE_RANGE",
      payrollBatch: period.payroll_batch_id || "DATE_RANGE",
    });

    const [schedRes, clockRes, payrollRes, matchRes] = await Promise.all([
      schedQuery, clockQuery, payrollQuery, matchQuery,
    ]);

    const schedules = (schedRes.data || []) as any[];
    const clocks = (clockRes.data || []) as any[];
    const payrolls = (payrollRes.data || []) as any[];
    const matches = (matchRes.data || []) as any[];

    // Debug: log actual date ranges of fetched data
    const schedDates = schedules.map(s => s.work_date).filter(Boolean).sort();
    const clockDates = clocks.map(c => c.work_date).filter(Boolean).sort();
    const payrollDates = payrolls.map(p => p.work_date).filter(Boolean).sort();
    console.log("[generateFinalRecords] Fetched:", {
      schedules: schedules.length, schedDateRange: schedDates.length ? `${schedDates[0]} → ${schedDates[schedDates.length - 1]}` : "none",
      clocks: clocks.length, clockDateRange: clockDates.length ? `${clockDates[0]} → ${clockDates[clockDates.length - 1]}` : "none",
      payrolls: payrolls.length, payrollDateRange: payrollDates.length ? `${payrollDates[0]} → ${payrollDates[payrollDates.length - 1]}` : "none",
      matches: matches.length,
    });

    if (schedules.length === 0 && clocks.length === 0 && payrolls.length === 0) {
      toast({ title: "Sin datos", description: "No hay datos importados para este periodo.", variant: "destructive" });
      return;
    }

    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("company_id", companyId);
    const empMap = new Map((employees || []).map(e => [e.id, `${e.first_name} ${e.last_name}`]));

    const employeeIds = new Set<string>();
    schedules.forEach(s => { if (s.matched_employee_id) employeeIds.add(s.matched_employee_id); });
    clocks.forEach(c => { if (c.matched_employee_id) employeeIds.add(c.matched_employee_id); });
    payrolls.forEach(p => { if (p.matched_employee_id) employeeIds.add(p.matched_employee_id); });

    const OT_THRESHOLD = 40;
    const records: any[] = [];

    // ── Deduplication helper: composite key per payroll row ──
    const makePayrollKey = (p: any): string => {
      const date = p.work_date || "no-date";
      const empId = p.matched_employee_id || "no-emp";
      const payType = p.pay_type || "unknown";
      const totalPay = Number(p.total_pay) || 0;
      const totalHours = Number(p.total_hours) || 0;
      const rawRowId = p.raw_row_id || "";
      // Use raw_row_id as primary uniqueness signal (it links to the source import row)
      if (rawRowId) return `${empId}|${rawRowId}`.toLowerCase();
      // Fallback: composite of employee + date + type + amounts
      return `${empId}|${date}|${payType}|${totalPay}|${totalHours}`.toLowerCase();
    };

    // Global deduplication of all payroll rows BEFORE per-employee processing
    const seenPayrollKeys = new Set<string>();
    const dedupedPayrolls: any[] = [];
    for (const p of payrolls) {
      const key = makePayrollKey(p);
      if (!seenPayrollKeys.has(key)) {
        seenPayrollKeys.add(key);
        dedupedPayrolls.push(p);
      }
    }
    if (dedupedPayrolls.length < payrolls.length) {
      console.warn(`[generateFinalRecords] DEDUP: removed ${payrolls.length - dedupedPayrolls.length} duplicate payroll rows (${payrolls.length} → ${dedupedPayrolls.length})`);
    }

    for (const empId of employeeIds) {
      const empSchedules = schedules.filter(s => s.matched_employee_id === empId);
      const empClocks = clocks.filter(c => c.matched_employee_id === empId);
      const empPayrolls = dedupedPayrolls.filter(p => p.matched_employee_id === empId);
      const empMatches = matches.filter(m => m.employee_id === empId);

      const totalScheduledHours = empSchedules.reduce((sum, s) => sum + (Number(s.total_hours) || 0), 0);
      const totalWorkedHours = empClocks.reduce((sum, c) => sum + (Number(c.total_hours) || 0), 0);
      const totalPayrollHours = empPayrolls.reduce((sum, p) => sum + (Number(p.total_hours) || 0), 0);
      const totalPayrollAmount = empPayrolls.reduce((sum, p) => sum + (Number(p.total_pay) || 0), 0);

      // ── Auto-classify unrecognized pay_type values ──
      const classifyPayType = (p: any): string => {
        const t = (p.pay_type || "").toLowerCase().trim();
        if (t === "hourly" || t === "regular" || t === "regular pay" || t === "base" || t === "base pay" || t === "hora") return "hourly";
        if (t === "daily" || t === "daily pay" || t === "diario") return "daily";
        if (t === "pay_ride" || t === "ride" || t === "ryde" || t === "transporte") return "pay_ride";
        if (t === "weekend_job" || t === "weekend" || t === "doble" || t === "double" || t === "paga doble") return "weekend_job";
        if (t === "manual_adjustment" || t === "manual" || t === "adjustment" || t === "bonus" || t === "reintegro" || t === "correction") return "manual_adjustment";
        // Try notes-based classification
        const n = (p.notes || "").toLowerCase();
        if (n.includes("ride") || n.includes("ryde") || n.includes("transporte")) return "pay_ride";
        if (n.includes("weekend") || n.includes("doble") || n.includes("double")) return "weekend_job";
        if (n.includes("bonus") || n.includes("manual") || n.includes("adjust") || n.includes("reintegro")) return "manual_adjustment";
        if (n.includes("daily") || n.includes("diario")) return "daily";
        // If it has hours and a rate, treat as hourly
        if (Number(p.total_hours) > 0 && Number(p.hourly_rate) > 0) return "hourly";
        return "unmapped";
      };

      // Classify all payroll rows
      const classifiedPayrolls = empPayrolls.map(p => ({ ...p, _classified_type: classifyPayType(p) }));

      // Full payment breakdown by classified type
      const hourlyRows = classifiedPayrolls.filter(p => p._classified_type === "hourly");
      const dailyRows = classifiedPayrolls.filter(p => p._classified_type === "daily");
      const rideRows = classifiedPayrolls.filter(p => p._classified_type === "pay_ride");
      const weekendRows = classifiedPayrolls.filter(p => p._classified_type === "weekend_job");
      const manualRows = classifiedPayrolls.filter(p => p._classified_type === "manual_adjustment");
      const unmappedRows = classifiedPayrolls.filter(p => p._classified_type === "unmapped");

      const hourlyPayTotal = hourlyRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
      const dailyPayTotal = dailyRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
      const ridePayTotal = rideRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
      const weekendPayTotal = weekendRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
      const manualTotal = manualRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
      const unmappedTotal = unmappedRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);

      // CRITICAL: grandTotal only includes classified rows — unmapped excluded
      const grandTotal = Math.round((hourlyPayTotal + dailyPayTotal + ridePayTotal + weekendPayTotal + manualTotal) * 100) / 100;

      // Log unmapped rows per employee
      if (unmappedRows.length > 0) {
        console.warn(`[UNMAPPED] ${empMap.get(empId) || empId}: ${unmappedRows.length} unmapped rows, $${unmappedTotal.toFixed(2)} excluded from total`, 
          unmappedRows.map(r => ({
            id: r.id?.substring(0, 8),
            raw_row_id: r.raw_row_id?.substring(0, 8),
            pay_type: r.pay_type,
            total_pay: r.total_pay,
            total_hours: r.total_hours,
            work_date: r.work_date,
            notes: r.notes?.substring(0, 50),
            concept_name: r.concept_name || r.original_concept_name,
          }))
        );
      }

      // Source payroll total (authoritative — use total_pay field directly, not sub-components)
      const sourcePayrollTotal = Math.round(totalPayrollAmount * 100) / 100;

      // Conflicts
      const unresolvedMatches = empMatches.filter(m => m.match_status === "ambiguous" || m.match_status === "unmatched");
      const conflictCount = unresolvedMatches.length;

      // Warnings
      const warnings: string[] = [];
      if (Math.abs(totalScheduledHours - totalWorkedHours) > 4 && totalScheduledHours > 0) {
        warnings.push(`Variación de ${Math.abs(totalScheduledHours - totalWorkedHours).toFixed(1)}h entre programado y trabajado`);
      }
      if (grandTotal === 0 && empPayrolls.length > 0) warnings.push("Total calculado es $0 con filas de nómina existentes");
      if (classification === "unknown") warnings.push("Clasificación de pago no determinada");

      // Variance: compare authoritative payroll total vs computed breakdown
      const varianceAmount = Math.round((grandTotal - sourcePayrollTotal) * 100) / 100;
      const varianceStatus = Math.abs(varianceAmount) < 0.01 ? "exact_match"
        : Math.abs(varianceAmount) < 10 ? "minor_variance" : "major_variance";
      const varianceReasons: string[] = [];
      if (Math.abs(varianceAmount) >= 0.01) {
        varianceReasons.push(`Breakdown sum ($${grandTotal}) vs source total ($${sourcePayrollTotal})`);
      }

      records.push({
        company_id: companyId,
        period_status_id: periodStatusId,
        employee_id: empId,
        scheduled_shifts: empSchedules.map(s => ({ id: s.id, date: s.work_date, hours: s.total_hours, title: s.shift_title })),
        worked_shifts: empClocks.map(c => ({ id: c.id, date: c.work_date, hours: c.total_hours, clock_in: c.clock_in, clock_out: c.clock_out })),
        payroll_rows: empPayrolls.map(p => ({ id: p.id, date: p.work_date, hours: p.total_hours, pay: p.total_pay, type: p.pay_type })),
        total_scheduled_hours: Math.round(totalScheduledHours * 100) / 100,
        total_worked_hours: Math.round(totalWorkedHours * 100) / 100,
        total_payroll_hours: Math.round(totalPayrollHours * 100) / 100,
        total_payroll_amount: Math.round(totalPayrollAmount * 100) / 100,
        pay_classification: classification,
        hourly_rate: hourlyRate,
        daily_rate: dailyRate,
        regular_hours: Math.round(regularHours * 100) / 100,
        overtime_hours: Math.round(overtimeHours * 100) / 100,
        hourly_pay_total: Math.round(hourlyPayTotal * 100) / 100,
        daily_pay_total: Math.round(dailyPayTotal * 100) / 100,
        ride_pay_total: Math.round(ridePayTotal * 100) / 100,
        weekend_pay_total: Math.round(weekendPayTotal * 100) / 100,
        manual_adjustment_total: Math.round(manualTotal * 100) / 100,
        grand_total: grandTotal,
        ride_amount: Math.round(ridePayTotal * 100) / 100,
        weekend_amount: Math.round(weekendPayTotal * 100) / 100,
        manual_amount: Math.round(manualTotal * 100) / 100,
        base_pay: Math.round(hourlyPayTotal * 100) / 100,
        final_total_pay: grandTotal,
        source_payroll_total: sourcePayrollTotal,
        variance_amount: varianceAmount,
        variance_status: varianceStatus,
        variance_reasons: varianceReasons,
        reconciliation_status: conflictCount > 0 ? "partial" : "resolved",
        conflict_count: conflictCount,
        warnings: warnings,
        schedule_batch_id: period.schedule_batch_id,
        clock_batch_id: period.clock_batch_id,
        payroll_batch_id: period.payroll_batch_id,
        match_ids: empMatches.map(m => m.id),
      });
    }

    // Upsert final records
    for (const rec of records) {
      await supabase.from("reconciliation_final_records" as any).upsert(rec as any, { onConflict: "period_status_id,employee_id" });
    }

    // Update period stats
    await supabase.from("reconciliation_period_status" as any).update({
      total_employees: records.length,
      total_schedules: schedules.length,
      total_clocks: clocks.length,
      total_payroll_rows: payrolls.length,
      total_matches: matches.length,
      approved_matches: matches.filter((m: any) => m.match_status === "approved" || m.match_status === "exact").length,
      total_exceptions: records.filter(r => r.conflict_count > 0).length,
      resolved_exceptions: records.filter(r => r.reconciliation_status === "resolved").length,
      status: "reviewing",
      updated_at: new Date().toISOString(),
    } as any).eq("id", periodStatusId);

    await loadFinalRecords(periodStatusId);
    await loadPeriods();
    toast({ title: "Registros generados", description: `${records.length} empleados procesados.` });
  }, [companyId, user?.id, periods, toast, loadFinalRecords, loadPeriods]);

  // ── CORE: Idempotent post final records to production ──
  const postFinalRecords = useCallback(async (periodStatusId: string) => {
    if (!companyId || !user?.id) return false;

    const period = periods.find(p => p.id === periodStatusId);
    if (!period) return false;

    // Idempotency check: block if already posted
    if (period.publish_idempotency_key) {
      toast({ title: "Ya publicado", description: "Este periodo ya fue publicado. Reabre el periodo si necesitas republicar.", variant: "destructive" });
      return false;
    }

    // Must be approved first
    if (period.status !== "approved") {
      toast({ title: "No aprobado", description: "El periodo debe estar aprobado antes de publicar.", variant: "destructive" });
      return false;
    }

    // Load records
    const { data: records } = await supabase
      .from("reconciliation_final_records" as any)
      .select("*")
      .eq("period_status_id", periodStatusId);
    const finalRecs = (records || []) as any[];

    // Pre-publish validation
    const validation = validateBeforePublish(finalRecs);
    if (!validation.canPublish) {
      toast({ title: "No se puede publicar", description: validation.errors.join(" "), variant: "destructive" });
      return false;
    }

    // Generate idempotency key
    const idempotencyKey = `${companyId}-${periodStatusId}-${Date.now()}`;

    // Set idempotency key FIRST to prevent race conditions
    const { error: lockErr } = await supabase.from("reconciliation_period_status" as any)
      .update({ publish_idempotency_key: idempotencyKey, updated_at: new Date().toISOString() } as any)
      .eq("id", periodStatusId)
      .is("publish_idempotency_key", null);

    if (lockErr) {
      toast({ title: "Error de bloqueo", description: "No se pudo bloquear el periodo para publicación.", variant: "destructive" });
      return false;
    }

    // Find or create pay_period
    let payPeriodId = period.period_id;
    if (!payPeriodId) {
      const { data: existingPeriod } = await supabase
        .from("pay_periods")
        .select("id")
        .eq("company_id", companyId)
        .eq("start_date", period.period_start)
        .eq("end_date", period.period_end)
        .maybeSingle();

      if (existingPeriod) {
        payPeriodId = existingPeriod.id;
      } else {
        const { data: newPeriod, error: ppErr } = await supabase
          .from("pay_periods")
          .insert({
            company_id: companyId,
            start_date: period.period_start,
            end_date: period.period_end,
            label: period.period_label,
            status: "closed",
          })
          .select("id")
          .single();
        if (ppErr) {
          toast({ title: "Error creando periodo", description: ppErr.message, variant: "destructive" });
          return false;
        }
        payPeriodId = newPeriod.id;
      }

      await supabase.from("reconciliation_period_status" as any)
        .update({ period_id: payPeriodId } as any)
        .eq("id", periodStatusId);
    }

    // Post to period_base_pay with full breakdown — upsert prevents duplicates
    let posted = 0;
    let receiptTotals = {
      regular_hours: 0, overtime_hours: 0,
      hourly_pay: 0, daily_pay: 0, ride_pay: 0, manual_adj: 0, weekend_pay: 0,
      grand_total: 0, scheduled_shifts: 0, worked_shifts: 0, payroll_rows: 0,
    };

    for (const rec of finalRecs) {
      const { error } = await supabase
        .from("period_base_pay")
        .upsert({
          company_id: companyId,
          period_id: payPeriodId,
          employee_id: rec.employee_id,
          total_work_hours: rec.total_worked_hours || rec.total_payroll_hours || 0,
          total_regular: rec.regular_hours || Math.min(rec.total_worked_hours || 0, 40),
          total_overtime: rec.overtime_hours || Math.max((rec.total_worked_hours || 0) - 40, 0),
          total_paid_hours: rec.total_payroll_hours || rec.total_worked_hours || 0,
          base_total_pay: rec.grand_total || rec.final_total_pay || 0,
        }, { onConflict: "period_id,employee_id" });

      if (!error) {
        posted++;
        receiptTotals.regular_hours += rec.regular_hours || 0;
        receiptTotals.overtime_hours += rec.overtime_hours || 0;
        receiptTotals.hourly_pay += rec.hourly_pay_total || 0;
        receiptTotals.daily_pay += rec.daily_pay_total || 0;
        receiptTotals.ride_pay += rec.ride_pay_total || rec.ride_amount || 0;
        receiptTotals.manual_adj += rec.manual_adjustment_total || rec.manual_amount || 0;
        receiptTotals.weekend_pay += rec.weekend_pay_total || rec.weekend_amount || 0;
        receiptTotals.grand_total += rec.grand_total || rec.final_total_pay || 0;
        receiptTotals.scheduled_shifts += (rec.scheduled_shifts || []).length;
        receiptTotals.worked_shifts += (rec.worked_shifts || []).length;
        receiptTotals.payroll_rows += (rec.payroll_rows || []).length;
      }

      // Mark as posted with traceability
      await supabase.from("reconciliation_final_records" as any)
        .update({
          reconciliation_status: "posted",
          publishing_user: user.id,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", rec.id);
    }

    // Create closing receipt
    await supabase.from("reconciliation_closing_receipts" as any).insert({
      company_id: companyId,
      period_status_id: periodStatusId,
      period_label: period.period_label,
      period_start: period.period_start,
      period_end: period.period_end,
      total_employees: posted,
      total_scheduled_shifts: receiptTotals.scheduled_shifts,
      total_worked_shifts: receiptTotals.worked_shifts,
      total_payroll_rows: receiptTotals.payroll_rows,
      total_regular_hours: Math.round(receiptTotals.regular_hours * 100) / 100,
      total_overtime_hours: Math.round(receiptTotals.overtime_hours * 100) / 100,
      total_hourly_pay: Math.round(receiptTotals.hourly_pay * 100) / 100,
      total_daily_pay: Math.round(receiptTotals.daily_pay * 100) / 100,
      total_ride_pay: Math.round(receiptTotals.ride_pay * 100) / 100,
      total_manual_adjustments: Math.round(receiptTotals.manual_adj * 100) / 100,
      grand_total_posted: Math.round(receiptTotals.grand_total * 100) / 100,
      published_by: user.id,
      receipt_data: {
        idempotency_key: idempotencyKey,
        validation_warnings: validation.warnings,
      },
    } as any);

    // Update period status to posted
    await updatePeriodStatus(periodStatusId, "posted");
    await loadFinalRecords(periodStatusId);
    await loadClosingReceipt(periodStatusId);

    toast({
      title: "✅ Periodo publicado a producción",
      description: `${posted} empleados. Total: $${Math.round(receiptTotals.grand_total * 100) / 100}`,
    });
    return true;
  }, [companyId, user?.id, periods, updatePeriodStatus, toast, loadFinalRecords, loadClosingReceipt, validateBeforePublish]);

  const saveMappingCorrection = useCallback(async (
    mappingType: string, sourceValue: string, targetId: string, targetValue: string
  ) => {
    if (!companyId || !user?.id) return;
    await supabase.from("reconciliation_learned_mappings" as any).upsert({
      company_id: companyId,
      mapping_type: mappingType,
      source_value: sourceValue,
      source_value_normalized: normalizeText(sourceValue),
      target_id: targetId,
      target_value: targetValue,
      created_by: user.id,
      usage_count: 1,
    } as any, { onConflict: "company_id,mapping_type,source_value_normalized" });
  }, [companyId, user?.id]);

  // ── Variance analysis for a set of final records ──
  const analyzeVariances = useCallback((records: EmployeeFinalRecord[], empNames: Map<string, string>): EmployeeVariance[] => {
    return records.map(r => {
      const sourceTotal = r.source_payroll_total || r.total_payroll_amount || 0;
      const reconciledTotal = r.grand_total || r.final_total_pay || 0;
      const variance = Math.round((reconciledTotal - sourceTotal) * 100) / 100;
      const absVariance = Math.abs(variance);

      const reasons: string[] = [];
      if (r.payroll_rows?.length === 0 && r.worked_shifts?.length > 0) reasons.push("Fichajes sin nómina vinculada");
      if (r.payroll_rows?.length > 0 && r.worked_shifts?.length === 0) reasons.push("Nómina sin fichajes vinculados");
      if (r.pay_classification === "unknown") reasons.push("Clasificación de pago desconocida");
      if ((r.ride_pay_total || r.ride_amount || 0) > 0 && !r.payroll_rows?.some((p: any) => p.type === "pay_ride")) reasons.push("Ride no vinculado en nómina");
      if ((r.manual_adjustment_total || r.manual_amount || 0) > 0) reasons.push("Incluye ajustes manuales");
      if (absVariance > 50) reasons.push(`Varianza de $${absVariance.toFixed(2)}`);
      const scheduled = r.scheduled_shifts || [];
      const worked = r.worked_shifts || [];
      if (scheduled.length > 0 && worked.length === 0) reasons.push("Turnos programados sin fichajes");

      let status: EmployeeVariance["variance_status"];
      if (r.reconciliation_status === "pending" || r.reconciliation_status === "partial") status = "unresolved";
      else if (absVariance <= 0.01) status = "exact_match";
      else if (absVariance <= 10) status = "minor_variance";
      else status = "major_variance";

      return {
        employee_id: r.employee_id,
        employee_name: empNames.get(r.employee_id) || "—",
        scheduled_count: scheduled.length,
        worked_count: worked.length,
        payroll_count: r.payroll_rows?.length || 0,
        pay_classification: r.pay_classification,
        source_payroll_total: Math.round(sourceTotal * 100) / 100,
        reconciled_total: Math.round(reconciledTotal * 100) / 100,
        published_total: r.reconciliation_status === "posted" ? Math.round(reconciledTotal * 100) / 100 : 0,
        variance_amount: variance,
        variance_status: status,
        variance_reasons: reasons,
        warnings: r.warnings || [],
      };
    });
  }, []);

  // ── Run full validation (dry-run or live) ──
  const runValidation = useCallback(async (
    periodStatusId: string,
    isDryRun: boolean,
    uatChecklist: Record<string, boolean>,
    empNames: Map<string, string>,
    notes?: string,
  ): Promise<ValidationResult | null> => {
    if (!companyId || !user?.id) return null;

    const period = periods.find(p => p.id === periodStatusId);
    if (!period) return null;

    // Use current finalRecords or load fresh
    let records = finalRecords;
    if (records.length === 0 || records[0]?.id === undefined) {
      const { data } = await supabase
        .from("reconciliation_final_records" as any)
        .select("*")
        .eq("period_status_id", periodStatusId);
      records = (data || []) as any;
    }

    const variances = analyzeVariances(records, empNames);
    const exactMatch = variances.filter(v => v.variance_status === "exact_match").length;
    const minor = variances.filter(v => v.variance_status === "minor_variance").length;
    const major = variances.filter(v => v.variance_status === "major_variance").length;
    const unresolved = variances.filter(v => v.variance_status === "unresolved").length;

    const sourceTotal = variances.reduce((s, v) => s + v.source_payroll_total, 0);
    const reconciledTotal = variances.reduce((s, v) => s + v.reconciled_total, 0);
    const totalVariance = Math.round((reconciledTotal - sourceTotal) * 100) / 100;
    const unresolvedExceptions = records.filter(r => r.conflict_count > 0 && !["approved", "resolved", "posted"].includes(r.reconciliation_status)).length;

    // Confidence score: 0-100
    const matchRatio = variances.length > 0 ? exactMatch / variances.length : 0;
    const noMajor = major === 0 ? 1 : 0;
    const noUnresolved = unresolved === 0 ? 1 : 0;
    const confidence = Math.round((matchRatio * 50 + noMajor * 25 + noUnresolved * 25) * 100) / 100;

    let readiness: ValidationResult["publish_readiness"];
    if (major > 0 || unresolved > 0 || unresolvedExceptions > 0) readiness = "blocked";
    else if (minor > 0) readiness = "ready_with_warnings";
    else readiness = "ready";

    const result: ValidationResult = {
      period_status_id: periodStatusId,
      is_dry_run: isDryRun,
      total_employees: variances.length,
      employees_exact_match: exactMatch,
      employees_minor_variance: minor,
      employees_major_variance: major,
      employees_unresolved: unresolved,
      source_payroll_total: Math.round(sourceTotal * 100) / 100,
      reconciled_total: Math.round(reconciledTotal * 100) / 100,
      published_total: 0,
      total_variance: totalVariance,
      unresolved_exceptions: unresolvedExceptions,
      publish_readiness: readiness,
      confidence_score: confidence,
      uat_checklist: uatChecklist,
      employee_variances: variances,
      notes,
    };

    // Store validation result
    const { data: inserted } = await supabase.from("reconciliation_validation_results" as any).insert({
      company_id: companyId,
      period_status_id: periodStatusId,
      tested_by: user.id,
      is_dry_run: isDryRun,
      total_employees: result.total_employees,
      employees_exact_match: exactMatch,
      employees_minor_variance: minor,
      employees_major_variance: major,
      employees_unresolved: unresolved,
      source_payroll_total: result.source_payroll_total,
      reconciled_total: result.reconciled_total,
      published_total: result.published_total,
      total_variance: result.total_variance,
      unresolved_exceptions: unresolvedExceptions,
      publish_readiness: readiness,
      confidence_score: confidence,
      uat_checklist: uatChecklist,
      employee_variances: variances,
      notes,
    } as any).select("id").single();

    if (inserted) result.id = (inserted as any).id;

    // Update variance fields on final records
    for (const v of variances) {
      const rec = records.find(r => r.employee_id === v.employee_id);
      if (rec) {
        await supabase.from("reconciliation_final_records" as any).update({
          source_payroll_total: v.source_payroll_total,
          variance_amount: v.variance_amount,
          variance_status: v.variance_status,
          variance_reasons: v.variance_reasons,
        } as any).eq("id", rec.id);
      }
    }

    toast({ title: isDryRun ? "Validación completada (Dry Run)" : "Validación completada", description: `Confianza: ${confidence}% — ${readiness}` });
    return result;
  }, [companyId, user?.id, periods, finalRecords, analyzeVariances, toast]);

  return {
    periods, loading, activePeriod, setActivePeriod,
    finalRecords, closingReceipt, loadPeriods, createPeriod, updatePeriodStatus,
    loadFinalRecords, generateFinalRecords, postFinalRecords,
    saveMappingCorrection, reopenPeriod, loadClosingReceipt,
    validateBeforePublish, analyzeVariances, runValidation,
  };
}
