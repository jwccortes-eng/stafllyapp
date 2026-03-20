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
  // Shift-based compensation fields
  shift_full_day_count: number;
  shift_half_day_count: number;
  shift_calculated_total: number;
  shift_daily_rate_used: number | null;
  shift_half_day_rate_used: number | null;
  shift_calculation_source: string;
  payroll_reference_total: number;
  shift_vs_payroll_diff: number;
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

    const unresolved = records.filter(r => ["pending", "partial", "blocked"].includes(r.reconciliation_status));
    if (unresolved.length > 0) {
      errors.push(`${unresolved.length} empleado(s) con conflictos sin resolver.`);
    }

    const withConflicts = records.filter(r => r.conflict_count > 0 && r.reconciliation_status !== "approved");
    if (withConflicts.length > 0) {
      errors.push(`${withConflicts.length} empleado(s) con conflictos críticos no aprobados.`);
    }

    const blockedByUnmapped = records.filter(r => Array.isArray(r.warnings) && r.warnings.some((w: any) => String(w).startsWith("CRITICAL_UNMAPPED_RATIO:")));
    if (blockedByUnmapped.length > 0) {
      errors.push(`${blockedByUnmapped.length} empleado(s) bloqueados por unmapped > 20%.`);
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

    // Load company-specific payroll concept mappings
    const { data: dbMappings } = await supabase
      .from("payroll_concept_mappings" as any)
      .select("pattern, target_type, priority, is_active, match_field")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("priority", { ascending: true });
    const activeMappings = (dbMappings || []) as unknown as { pattern: string; target_type: string; priority: number; is_active: boolean; match_field: string }[];
    console.log(`[generateFinalRecords] Loaded ${activeMappings.length} payroll concept mappings from DB`);

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

    const [empRes, compProfilesRes] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name").eq("company_id", companyId),
      supabase.from("compensation_profiles").select("employee_id, default_daily_rate, default_half_day_rate, default_hourly_rate, payment_mode, is_active").eq("company_id", companyId).eq("is_active", true),
    ]);
    const employees = empRes.data || [];
    const empMap = new Map(employees.map(e => [e.id, `${e.first_name} ${e.last_name}`]));

    // Build compensation rate map: employee_id -> { daily_rate, half_day_rate, hourly_rate }
    const compRateMap = new Map<string, { daily_rate: number | null; half_day_rate: number | null; hourly_rate: number | null; payment_mode: string }>();
    for (const cp of (compProfilesRes.data || []) as any[]) {
      compRateMap.set(cp.employee_id, {
        daily_rate: cp.default_daily_rate,
        half_day_rate: cp.default_half_day_rate,
        hourly_rate: cp.default_hourly_rate,
        payment_mode: cp.payment_mode,
      });
    }

    // Also load company-level compensation rules as fallback rates
    const { data: compRules } = await supabase
      .from("company_compensation_rules" as any)
      .select("rule_type, amount, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true);
    const rulesArr = (compRules || []) as any[];
    const fallbackDailyRate = rulesArr.find(r => r.rule_type === "daily_full")?.amount || null;
    const fallbackHalfDayRate = rulesArr.find(r => r.rule_type === "daily_half")?.amount || null;

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

      // For full_day shifts with 0 hours, count as 8h equivalent per shift for H.Prog
      const FULL_DAY_EQUIVALENT_HOURS = 8;
      const HALF_DAY_EQUIVALENT_HOURS = 4;
      const totalScheduledHours = empSchedules.reduce((sum, s) => {
        const rawHours = Number(s.total_hours) || 0;
        if (rawHours > 0) return sum + rawHours;
        // If hours=0 but it's a real shift (not availability block), count equivalent
        const avail = String((s as any).availability_status || "").trim().toLowerCase();
        const isAvailBlock = avail === "unavailable" || avail === "no disponible" || avail.includes("block");
        const shiftTitle = String(s.shift_title || "").trim();
        const hasContext = shiftTitle || String(s.location_name || "").trim() || String(s.client_name || "").trim();
        if (!isAvailBlock && hasContext) {
          // Check if it's a half-day shift
          return sum + (/half|media|1\/2/i.test(shiftTitle) ? HALF_DAY_EQUIVALENT_HOURS : FULL_DAY_EQUIVALENT_HOURS);
        }
        return sum;
      }, 0);
      const totalWorkedHours = empClocks.reduce((sum, c) => sum + (Number(c.total_hours) || 0), 0);
      const totalPayrollHours = empPayrolls.reduce((sum, p) => sum + (Number(p.total_hours) || 0), 0);
      const totalPayrollAmount = empPayrolls.reduce((sum, p) => sum + (Number(p.total_pay) || 0), 0);

      // ── Build schedule context per employee+date (Connecteam shift-first) ──
      const scheduleContextMap = new Map<string, {
        shift_names: string[];
        location_names: string[];
        job_names: string[];
        client_locations: string[];
        client_names: string[];
        shift_count: number;
        full_day_units: number;
        half_day_units: number;
      }>();

      // Also build employee-level aggregate context for fallback when payroll work_date doesn't match
      const empLevelContext = {
        all_shift_names: [] as string[],
        has_weekend_job: false,
        total_full_day_shifts: 0,
        total_half_day_shifts: 0,
        total_shift_count: 0,
      };

      for (const s of empSchedules) {
        const dateKey = s.work_date || "no-date";
        const existing = scheduleContextMap.get(dateKey) || {
          shift_names: [],
          location_names: [],
          job_names: [],
          client_locations: [],
          client_names: [],
          shift_count: 0,
          full_day_units: 0,
          half_day_units: 0,
        };

        const shiftTitleRaw = String(s.shift_title || "").trim();
        const locationRaw = String(s.location_name || "").trim();
        const clientRaw = String(s.client_name || "").trim();
        const availabilityRaw = String((s as any).availability_status || "").trim().toLowerCase();

        const isAvailabilityBlock = availabilityRaw === "unavailable" || availabilityRaw === "no disponible" || availabilityRaw.includes("block");
        const isNoContext = !shiftTitleRaw && !locationRaw && !clientRaw;
        if (isAvailabilityBlock || isNoContext) continue;

        const shiftName = shiftTitleRaw.toLowerCase();
        const locationName = locationRaw.toLowerCase();
        const clientName = clientRaw.toLowerCase();
        const jobName = clientName || shiftName; // Job secundario desde cliente/proyecto
        const clientLocation = [clientName, locationName].filter(Boolean).join(" ").trim();
        const hours = Number(s.total_hours) || 0;

        if (shiftName) {
          existing.shift_names.push(shiftName);
          existing.job_names.push(jobName);
          empLevelContext.all_shift_names.push(shiftName);
          if (/weekend\s*(job|shift)/i.test(shiftName)) empLevelContext.has_weekend_job = true;
        }
        if (locationName) existing.location_names.push(locationName);
        if (clientName) existing.client_names.push(clientName);
        if (clientLocation) existing.client_locations.push(clientLocation);

        existing.shift_count += 1;
        empLevelContext.total_shift_count += 1;
        if (hours > 0 && hours <= 4) {
          existing.half_day_units += 0.5;
          empLevelContext.total_half_day_shifts += 1;
        } else {
          existing.full_day_units += 1;
          empLevelContext.total_full_day_shifts += 1;
        }

        scheduleContextMap.set(dateKey, existing);
      }

      type ClassificationDecision = {
        classifiedType: string;
        assignedTargetType: "hourly" | "full_day" | "half_day" | "ride" | "bonus" | "other" | "unmapped";
        source: string;
        matchedValue?: string;
      };

      const mapTargetType = (tt: string): ClassificationDecision => {
        if (tt === "hourly") return { classifiedType: "hourly", assignedTargetType: "hourly", source: "mapping" };
        if (tt === "full_day") return { classifiedType: "daily", assignedTargetType: "full_day", source: "mapping" };
        if (tt === "half_day") return { classifiedType: "daily", assignedTargetType: "half_day", source: "mapping" };
        if (tt === "ride") return { classifiedType: "pay_ride", assignedTargetType: "ride", source: "mapping" };
        if (tt === "bonus") return { classifiedType: "manual_adjustment", assignedTargetType: "bonus", source: "mapping" };
        if (tt === "other") return { classifiedType: "unmapped", assignedTargetType: "other", source: "mapping" };
        return { classifiedType: tt, assignedTargetType: "unmapped", source: "mapping" };
      };

      // ── Classification with strict priority: mapping DB -> shift/location -> fallback legacy ──
      const classifyPayType = (p: any): ClassificationDecision => {
        const rowShiftName = String(p.shift_name || p.shift_title || p.title || "").toLowerCase().trim();
        const rowLocationName = String(p.location_name || "").toLowerCase().trim();
        const rowJobName = String(p.job_name || "").toLowerCase().trim();
        const rowClientLocation = String(p.client_location || "").toLowerCase().trim();

        const rowFields = [
          String(p.pay_type || "").toLowerCase().trim(),
          String(p.concept_name || "").toLowerCase().trim(),
          String(p.original_concept_name || "").toLowerCase().trim(),
          String(p.notes || "").toLowerCase().trim(),
          rowShiftName,
          rowLocationName,
          rowJobName,
          rowClientLocation,
        ].filter(Boolean);

        const schedCtx = scheduleContextMap.get(p.work_date || "no-date");
        const shiftFields = schedCtx ? [...schedCtx.shift_names, ...schedCtx.job_names] : [];
        const locationFields = schedCtx ? [...schedCtx.location_names, ...schedCtx.client_locations] : [];
        const clientFields = schedCtx ? [...schedCtx.client_names] : [];

        // CRITICAL FIX: When payroll work_date doesn't match any schedule date,
        // include employee-level shift names so DB mappings and weekend detection still work
        const empShiftNames = !schedCtx && empLevelContext.total_shift_count > 0
          ? empLevelContext.all_shift_names
          : [];

        const allFields = [...rowFields, ...shiftFields, ...locationFields, ...clientFields, ...empShiftNames];

        // 1) Explicit DB mappings (manual priority)
        if (activeMappings.length > 0) {
          for (const mapping of activeMappings) {
            const pat = String(mapping.pattern || "").toLowerCase().trim();
            if (!pat) continue;
            const mf = String(mapping.match_field || "any").toLowerCase().trim();

            let fieldsForMatch = allFields;
            if (["shift_title", "shift_name", "job_name"].includes(mf)) fieldsForMatch = [...shiftFields, rowShiftName, rowJobName].filter(Boolean);
            else if (["location_name", "client_location"].includes(mf)) fieldsForMatch = [...locationFields, rowLocationName, rowClientLocation].filter(Boolean);
            else if (["client_name"].includes(mf)) fieldsForMatch = [...clientFields].filter(Boolean);

            const hit = fieldsForMatch.find((f) => f.includes(pat));
            if (hit) {
              const mapped = mapTargetType(mapping.target_type);
              return { ...mapped, source: `mapping:${mf || "any"}`, matchedValue: hit };
            }
          }
        }

        // 2) Shift/location mapping (Connecteam-first) — check per-date context first
        const shiftLocationPool = [...shiftFields, ...locationFields, ...empShiftNames, rowShiftName, rowLocationName, rowJobName, rowClientLocation].filter(Boolean);
        const weekendHit = shiftLocationPool.find((f) => /weekend\s*(job|shift)/i.test(f));
        if (weekendHit) {
          return { classifiedType: "daily", assignedTargetType: "full_day", source: "shift_location:weekend_job", matchedValue: weekendHit };
        }

        // 2b) Shift units heuristic: 1 shift=1 full_day, 0.5 shift=half_day
        if (schedCtx && schedCtx.shift_count > 0) {
          if ((schedCtx.full_day_units === 0 && schedCtx.half_day_units > 0) || ((Number(p.total_hours) || 0) > 0 && (Number(p.total_hours) || 0) <= 4)) {
            return { classifiedType: "daily", assignedTargetType: "half_day", source: "shift_units:half_day" };
          }
          return { classifiedType: "daily", assignedTargetType: "full_day", source: `shift_units:${schedCtx.shift_count}_shifts` };
        }

        // 2c) Employee-level shift context fallback (when payroll work_date doesn't match any schedule date)
        if (!schedCtx && empLevelContext.total_shift_count > 0) {
          // If this employee has weekend jobs in their schedule for this period, classify accordingly
          if (empLevelContext.has_weekend_job) {
            return { classifiedType: "daily", assignedTargetType: "full_day", source: "emp_context:weekend_job_period", matchedValue: "employee has weekend_job shifts in period" };
          }
          // Otherwise use aggregate shift context
          if (empLevelContext.total_full_day_shifts > 0) {
            return { classifiedType: "daily", assignedTargetType: "full_day", source: `emp_context:${empLevelContext.total_shift_count}_shifts_in_period` };
          }
          if (empLevelContext.total_half_day_shifts > 0) {
            return { classifiedType: "daily", assignedTargetType: "half_day", source: "emp_context:half_day_period" };
          }
        }

        // 3) Fallback legacy (pay_type/concept/notes)
        const t = String(p.pay_type || "").toLowerCase().trim();
        if (["hourly", "regular", "regular pay", "base", "base pay", "hora"].includes(t)) {
          // CRITICAL: Do NOT override to hourly if employee has weekend_job shifts in this period
          if (empLevelContext.has_weekend_job) {
            return { classifiedType: "daily", assignedTargetType: "full_day", source: "shift_override:weekend_job_blocks_hourly", matchedValue: `pay_type="${t}" overridden by schedule context` };
          }
          return { classifiedType: "hourly", assignedTargetType: "hourly", source: "fallback:pay_type" };
        }
        if (["daily", "daily pay", "diario"].includes(t)) {
          return { classifiedType: "daily", assignedTargetType: "full_day", source: "fallback:pay_type" };
        }
        if (["pay_ride", "ride", "ryde", "transporte"].includes(t)) {
          return { classifiedType: "pay_ride", assignedTargetType: "ride", source: "fallback:pay_type" };
        }
        if (["weekend_job", "weekend", "doble", "double", "paga doble"].includes(t)) {
          return { classifiedType: "weekend_job", assignedTargetType: "full_day", source: "fallback:pay_type" };
        }
        if (["manual_adjustment", "manual", "adjustment", "bonus", "reintegro", "correction"].includes(t)) {
          return { classifiedType: "manual_adjustment", assignedTargetType: "bonus", source: "fallback:pay_type" };
        }

        const n = String(p.notes || "").toLowerCase();
        if (n.includes("ride") || n.includes("ryde") || n.includes("transporte")) {
          return { classifiedType: "pay_ride", assignedTargetType: "ride", source: "fallback:notes" };
        }
        if (n.includes("weekend") || n.includes("doble") || n.includes("double")) {
          return { classifiedType: "weekend_job", assignedTargetType: "full_day", source: "fallback:notes" };
        }
        if (n.includes("bonus") || n.includes("manual") || n.includes("adjust") || n.includes("reintegro")) {
          return { classifiedType: "manual_adjustment", assignedTargetType: "bonus", source: "fallback:notes" };
        }
        if (n.includes("daily") || n.includes("diario")) {
          return { classifiedType: "daily", assignedTargetType: "full_day", source: "fallback:notes" };
        }
        if ((Number(p.total_hours) || 0) > 0 && (Number(p.hourly_rate) || 0) > 0) {
          // CRITICAL: Do NOT classify as hourly if employee has shift-based (full_day) context
          if (empLevelContext.has_weekend_job || empLevelContext.total_full_day_shifts > 0) {
            return { classifiedType: "daily", assignedTargetType: "full_day", source: "shift_override:schedule_blocks_hours_rate", matchedValue: `hours=${p.total_hours}, rate=${p.hourly_rate} overridden by ${empLevelContext.total_full_day_shifts} full_day shifts` };
          }
          return { classifiedType: "hourly", assignedTargetType: "hourly", source: "fallback:hours_rate" };
        }

        return { classifiedType: "unmapped", assignedTargetType: "unmapped", source: "fallback:unmapped" };
      };

      // ── DEBUG: Employee shift-calc diagnostic ──
      const scheduleDates = [...scheduleContextMap.keys()].filter(k => k !== "no-date");
      const payrollDates = [...new Set(empPayrolls.map(p => p.work_date).filter(Boolean))];
      const dateOverlap = scheduleDates.filter(d => payrollDates.includes(d));
      console.log(`[SHIFT-CALC-DEBUG] ${empMap.get(empId) || empId}`, {
        schedule_dates: scheduleDates,
        payroll_dates: payrollDates,
        date_overlap_count: dateOverlap.length,
        date_overlap: dateOverlap,
        empLevelContext: {
          has_weekend_job: empLevelContext.has_weekend_job,
          total_shift_count: empLevelContext.total_shift_count,
          total_full_day_shifts: empLevelContext.total_full_day_shifts,
          total_half_day_shifts: empLevelContext.total_half_day_shifts,
          all_shift_names: [...new Set(empLevelContext.all_shift_names)],
        },
        schedules_loaded: empSchedules.length,
        payrolls_loaded: empPayrolls.length,
      });

      // Classify all payroll rows + source trace
      const classifiedPayrolls = empPayrolls.map((p) => {
        const decision = classifyPayType(p);
        return {
          ...p,
          _classified_type: decision.classifiedType,
          _assigned_target_type: decision.assignedTargetType,
          _classification_source: decision.source,
          _classification_match: decision.matchedValue || null,
        };
      });

      // Full payment breakdown by classified type (payroll reference values)
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

      // ── SHIFT-BASED COMPENSATION CALCULATION (PRIMARY SOURCE) ──
      const empCompProfile = compRateMap.get(empId);
      const empDailyRate = empCompProfile?.daily_rate || fallbackDailyRate || null;
      const empHalfDayRate = empCompProfile?.half_day_rate || fallbackHalfDayRate || (empDailyRate ? Math.round(empDailyRate * 0.5 * 100) / 100 : null);

      // Count shifts from schedule context (aggregated across all dates)
      let shiftFullDayCount = 0;
      let shiftHalfDayCount = 0;
      for (const [, ctx] of scheduleContextMap) {
        shiftFullDayCount += ctx.full_day_units;
        shiftHalfDayCount += ctx.half_day_units * 2; // half_day_units stored as 0.5, convert to count
      }

      // ── CRITICAL FIX: If schedule-based counting gives 0 but classified payroll rows say full_day,
      // count from classified payroll rows as fallback ──
      if (shiftFullDayCount === 0 && shiftHalfDayCount === 0 && empLevelContext.total_shift_count > 0) {
        // Schedule rows exist but counting from scheduleContextMap gave 0 — use empLevelContext directly
        shiftFullDayCount = empLevelContext.total_full_day_shifts;
        shiftHalfDayCount = empLevelContext.total_half_day_shifts;
        console.log(`[SHIFT-CALC-FIX] ${empMap.get(empId)}: Using empLevelContext counts: ${shiftFullDayCount}fd, ${shiftHalfDayCount}hd (scheduleContextMap was empty)`);
      }

      // ── ADDITIONAL FALLBACK: If still 0 but classified payroll rows are full_day, count those ──
      if (shiftFullDayCount === 0 && shiftHalfDayCount === 0) {
        const classifiedFullDayRows = classifiedPayrolls.filter(p => p._assigned_target_type === "full_day");
        const classifiedHalfDayRows = classifiedPayrolls.filter(p => p._assigned_target_type === "half_day");
        if (classifiedFullDayRows.length > 0 || classifiedHalfDayRows.length > 0) {
          shiftFullDayCount = classifiedFullDayRows.length;
          shiftHalfDayCount = classifiedHalfDayRows.length;
          console.log(`[SHIFT-CALC-FIX] ${empMap.get(empId)}: Using classified payroll rows: ${shiftFullDayCount}fd, ${shiftHalfDayCount}hd`);
        }
      }

      // Calculate shift-based total
      let shiftCalculatedTotal = 0;
      let shiftCalcSource = "none";
      const hasShiftContext = empLevelContext.total_shift_count > 0 || shiftFullDayCount > 0 || shiftHalfDayCount > 0;
      const shouldForceShiftPrimary = shiftFullDayCount > 0 || shiftHalfDayCount > 0 || empLevelContext.has_weekend_job;

      if (hasShiftContext && (empDailyRate || empHalfDayRate)) {
        const fullDayAmount = shiftFullDayCount * (empDailyRate || 0);
        const halfDayAmount = shiftHalfDayCount * (empHalfDayRate || 0);
        shiftCalculatedTotal = Math.round((fullDayAmount + halfDayAmount) * 100) / 100;
        shiftCalcSource = `shift_calc:${shiftFullDayCount}fd×$${empDailyRate || 0}+${shiftHalfDayCount}hd×$${empHalfDayRate || 0}`;
      } else if (hasShiftContext && !empDailyRate) {
        // Has shifts but no rate configured — try to infer from payroll
        const totalDailyAndWeekend = dailyPayTotal + weekendPayTotal;
        const totalShiftUnits = shiftFullDayCount + shiftHalfDayCount * 0.5;
        if (totalShiftUnits > 0 && totalDailyAndWeekend > 0) {
          const inferredRate = Math.round((totalDailyAndWeekend / totalShiftUnits) * 100) / 100;
          shiftCalculatedTotal = Math.round(totalDailyAndWeekend * 100) / 100;
          shiftCalcSource = `shift_calc_inferred:${shiftFullDayCount}fd+${shiftHalfDayCount}hd, rate≈$${inferredRate}/day from payroll`;
        } else {
          shiftCalcSource = "no_rate_configured";
        }
      }

      // Hard guard: if there are full/half day shifts in period, keep shift-calc as primary path
      if (shouldForceShiftPrimary && shiftCalculatedTotal <= 0 && (empDailyRate || empHalfDayRate)) {
        const fullDayAmount = shiftFullDayCount * (empDailyRate || 0);
        const halfDayAmount = shiftHalfDayCount * (empHalfDayRate || 0);
        shiftCalculatedTotal = Math.round((fullDayAmount + halfDayAmount) * 100) / 100;
        shiftCalcSource = `forced_shift_calc:${shiftFullDayCount}fd×$${empDailyRate || 0}+${shiftHalfDayCount}hd×$${empHalfDayRate || 0}`;
      }

      // Payroll reference total (all classified rows)
      const payrollReferenceTotal = Math.round((hourlyPayTotal + dailyPayTotal + ridePayTotal + weekendPayTotal + manualTotal) * 100) / 100;

      // GRAND TOTAL: when full/half day shifts exist, always use shift-calc as primary
      let grandTotal: number;
      const calculationPrimarySource = shouldForceShiftPrimary ? "shift_calc" : "payroll";
      if (shouldForceShiftPrimary) {
        grandTotal = Math.round((shiftCalculatedTotal + ridePayTotal + manualTotal) * 100) / 100;
      } else {
        grandTotal = payrollReferenceTotal;
      }

      const shiftVsPayrollDiff = Math.round((shiftCalculatedTotal - (dailyPayTotal + weekendPayTotal)) * 100) / 100;

      console.log("[generateFinalRecords][shift_calc]", {
        employee: empMap.get(empId) || empId,
        shift_full_day_count: shiftFullDayCount,
        shift_half_day_count: shiftHalfDayCount,
        shift_calculated_total: shiftCalculatedTotal,
        daily_rate: empDailyRate,
        half_day_rate: empHalfDayRate,
        payroll_daily_weekend: dailyPayTotal + weekendPayTotal,
        diff: shiftVsPayrollDiff,
        source: shiftCalcSource,
        primary_source: calculationPrimarySource,
        grand_total: grandTotal,
      });

      // Log unmapped rows per employee with shift/location context
      if (unmappedRows.length > 0) {
        console.warn(`[UNMAPPED] ${empMap.get(empId) || empId}: ${unmappedRows.length} unmapped rows, $${unmappedTotal.toFixed(2)} excluded from total`, 
          unmappedRows.map(r => {
            const ctx = scheduleContextMap.get(r.work_date || "no-date");
            return {
              id: r.id?.substring(0, 8),
              raw_row_id: r.raw_row_id?.substring(0, 8),
              pay_type: r.pay_type,
              total_pay: r.total_pay,
              total_hours: r.total_hours,
              work_date: r.work_date,
              notes: r.notes?.substring(0, 50),
              concept_name: r.concept_name || r.original_concept_name,
              shift_source: ctx?.shift_names?.join(", ") || null,
              location_source: ctx?.location_names?.join(", ") || null,
              client_source: ctx?.client_names?.join(", ") || null,
            };
          })
        );
      }

      // Hours breakdown
      const hourlyHours = hourlyRows.reduce((s, r) => s + (Number(r.total_hours) || 0), 0);
      const regularHours = Math.min(hourlyHours, OT_THRESHOLD);
      const overtimeHours = Math.max(hourlyHours - OT_THRESHOLD, 0);

      // Hourly rate detection
      const hourlyRate = hourlyHours > 0 ? Math.round((hourlyPayTotal / hourlyHours) * 100) / 100 : null;
      const dailyRate = empDailyRate || (dailyRows.length > 0 ? Math.round((dailyPayTotal / dailyRows.length) * 100) / 100 : null);

      // Pay classification — shift-first and explicit full_day/half_day labels
      const hasShiftBasedPay = shouldForceShiftPrimary;
      let classification: string;
      if (hasShiftBasedPay) {
        if (shiftFullDayCount > 0 && shiftHalfDayCount === 0) classification = "full_day";
        else if (shiftHalfDayCount > 0 && shiftFullDayCount === 0) classification = "half_day";
        else if (shiftHalfDayCount > 0 && shiftFullDayCount > 0) classification = "mixed_daily";
        else classification = "daily";
      } else {
        const payTypes = classifiedPayrolls.filter(p => p._classified_type !== "unmapped").map(p => p._classified_type).filter(Boolean);
        const uniqueTypes = [...new Set(payTypes)];
        classification = uniqueTypes.length === 0 ? "unknown" : uniqueTypes.length === 1 ? uniqueTypes[0] : "mixed";
      }

      // Históricos: limpio (clasificado) vs total bruto (incluye unmapped)
      const historicalTotal = Math.round(totalPayrollAmount * 100) / 100;
      const sourcePayrollTotal = Math.round(grandTotal * 100) / 100;
      const unmappedCount = unmappedRows.length;
      const unmappedExcludedAmount = Math.round(unmappedTotal * 100) / 100;
      const unmappedRatio = historicalTotal > 0 ? unmappedExcludedAmount / historicalTotal : 0;
      const hasCriticalUnmapped = unmappedRatio > 0.2;

      console.log("[generateFinalRecords][historical_debug]", {
        employee_id: empId,
        employee_name: empMap.get(empId) || empId,
        historical_clean: sourcePayrollTotal,
        historical_total: historicalTotal,
        unmapped_total: unmappedExcludedAmount,
        unmapped_ratio_pct: Number((unmappedRatio * 100).toFixed(2)),
        critical_unmapped: hasCriticalUnmapped,
      });

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
      if (hasShiftContext && !empDailyRate && !fallbackDailyRate) {
        warnings.push("⚠️ Sin tarifa diaria configurada — usando payroll como fallback");
      }
      if (shiftCalculatedTotal > 0 && Math.abs(shiftVsPayrollDiff) > 10) {
        warnings.push(`SHIFT_VS_PAYROLL_DIFF:${shiftVsPayrollDiff.toFixed(2)}`);
        warnings.push(`Diferencia shift-calc vs payroll: $${shiftVsPayrollDiff.toFixed(2)}`);
      }
      if (unmappedCount > 0) {
        warnings.push(`UNMAPPED_COUNT:${unmappedCount}`);
        warnings.push(`UNMAPPED_EXCLUDED:${unmappedExcludedAmount.toFixed(2)}`);
        warnings.push(`${unmappedCount} registro(s) no clasificados (${unmappedExcludedAmount.toFixed(2)}) excluidos del cálculo`);
      }
      if (hasCriticalUnmapped) {
        warnings.push(`CRITICAL_UNMAPPED_RATIO:${(unmappedRatio * 100).toFixed(2)}`);
        warnings.push(`⚠️ CRÍTICO: No clasificados ${(unmappedRatio * 100).toFixed(1)}% (>20%) — reconciliación bloqueada`);
      }

      // Variance: compare shift-calculated total vs payroll reference
      const varianceAmount = shiftCalculatedTotal > 0
        ? Math.round(shiftVsPayrollDiff * 100) / 100
        : 0; // If no shift calc, variance is 0 (payroll = payroll)
      const varianceStatus = Math.abs(varianceAmount) < 0.01 ? "exact_match"
        : Math.abs(varianceAmount) < 10 ? "minor_variance" : "major_variance";
      const varianceReasons: string[] = [];
      if (shiftCalculatedTotal > 0 && Math.abs(varianceAmount) >= 0.01) {
        varianceReasons.push(`Shift-calc ($${shiftCalculatedTotal}) vs payroll ($${(dailyPayTotal + weekendPayTotal).toFixed(2)}): diff $${varianceAmount.toFixed(2)}`);
      }
      if (unmappedCount > 0) {
        varianceReasons.push(`Excluidos ${unmappedCount} unmapped por $${unmappedExcludedAmount.toFixed(2)} (histórico bruto: $${historicalTotal.toFixed(2)})`);
      }

      records.push({
        company_id: companyId,
        period_status_id: periodStatusId,
        employee_id: empId,
        scheduled_shifts: empSchedules.map(s => ({ id: s.id, date: s.work_date, hours: s.total_hours, title: s.shift_title })),
        worked_shifts: empClocks.map(c => ({ id: c.id, date: c.work_date, hours: c.total_hours, clock_in: c.clock_in, clock_out: c.clock_out })),
        payroll_rows: classifiedPayrolls.map(p => {
          const ctx = scheduleContextMap.get(p.work_date || "no-date");
          return {
            id: p.id,
            source_row_id: p.raw_row_id || p.external_id || null,
            employee_id: empId,
            date: p.work_date,
            hours: p.total_hours,
            pay: p.total_pay,
            type: p.pay_type,
            classified_type: p._classified_type,
            assigned_target_type: p._assigned_target_type,
            classification_source: p._classification_source,
            classification_match: p._classification_match,
            notes: p.notes?.substring(0, 60),
            concept_name: p.concept_name || p.original_concept_name,
            shift_source: ctx ? ctx.shift_names.join(", ") : null,
            location_source: ctx ? ctx.location_names.join(", ") : null,
            job_source: ctx ? ctx.job_names.join(", ") : null,
            client_location_source: ctx ? ctx.client_locations.join(", ") : null,
          };
        }),
        total_scheduled_hours: Math.round(totalScheduledHours * 100) / 100,
        total_worked_hours: Math.round(totalWorkedHours * 100) / 100,
        total_payroll_hours: Math.round(totalPayrollHours * 100) / 100,
        total_payroll_amount: historicalTotal,
        pay_classification: classification,
        hourly_rate: hourlyRate,
        daily_rate: dailyRate,
        regular_hours: Math.round(regularHours * 100) / 100,
        overtime_hours: Math.round(overtimeHours * 100) / 100,
        hourly_pay_total: shiftCalculatedTotal > 0 ? Math.round(shiftCalculatedTotal * 100) / 100 : Math.round(hourlyPayTotal * 100) / 100,
        daily_pay_total: shiftCalculatedTotal > 0 ? Math.round(shiftCalculatedTotal * 100) / 100 : Math.round(dailyPayTotal * 100) / 100,
        ride_pay_total: Math.round(ridePayTotal * 100) / 100,
        weekend_pay_total: Math.round(weekendPayTotal * 100) / 100,
        manual_adjustment_total: Math.round(manualTotal * 100) / 100,
        grand_total: grandTotal,
        ride_amount: Math.round(ridePayTotal * 100) / 100,
        weekend_amount: Math.round(weekendPayTotal * 100) / 100,
        manual_amount: Math.round(manualTotal * 100) / 100,
        base_pay: shiftCalculatedTotal > 0 ? Math.round(shiftCalculatedTotal * 100) / 100 : Math.round((hourlyPayTotal + dailyPayTotal) * 100) / 100,
        final_total_pay: grandTotal,
        source_payroll_total: Math.round(payrollReferenceTotal * 100) / 100,
        variance_amount: varianceAmount,
        variance_status: varianceStatus,
        variance_reasons: varianceReasons,
        // Shift-based compensation fields
        shift_full_day_count: shiftFullDayCount,
        shift_half_day_count: shiftHalfDayCount,
        shift_calculated_total: shiftCalculatedTotal,
        shift_daily_rate_used: empDailyRate,
        shift_half_day_rate_used: empHalfDayRate,
        shift_calculation_source: shiftCalcSource,
        payroll_reference_total: Math.round(payrollReferenceTotal * 100) / 100,
        shift_vs_payroll_diff: shiftVsPayrollDiff,
        reconciliation_status: hasCriticalUnmapped ? "blocked" : (conflictCount > 0 ? "partial" : "resolved"),
        conflict_count: conflictCount + (hasCriticalUnmapped ? 1 : 0),
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
      const sourceTotal = r.source_payroll_total || 0; // histórico limpio
      const sourceGrossTotal = r.total_payroll_amount || 0; // referencia (incluye unmapped)
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

      const unmappedWarning = Array.isArray(r.warnings)
        ? r.warnings.find((w: any) => String(w).startsWith("CRITICAL_UNMAPPED_RATIO:"))
        : null;
      if (unmappedWarning) reasons.push("Bloqueado: unmapped > 20% del histórico bruto");
      if (sourceGrossTotal > sourceTotal) {
        reasons.push(`Excluido de histórico limpio: $${(sourceGrossTotal - sourceTotal).toFixed(2)}`);
      }

      let status: EmployeeVariance["variance_status"];
      if (["pending", "partial", "blocked"].includes(r.reconciliation_status) || Boolean(unmappedWarning)) status = "unresolved";
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
