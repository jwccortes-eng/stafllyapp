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
}

export function useReconciliationPeriod(companyId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PeriodStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePeriod, setActivePeriod] = useState<PeriodStatus | null>(null);
  const [finalRecords, setFinalRecords] = useState<EmployeeFinalRecord[]>([]);

  const loadPeriods = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("reconciliation_period_status" as any)
      .select("*")
      .eq("company_id", companyId)
      .order("period_start", { ascending: false })
      .limit(50);
    setPeriods((data || []) as any);
    setLoading(false);
  }, [companyId]);

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
    const { error } = await supabase
      .from("reconciliation_period_status" as any)
      .update(update as any)
      .eq("id", periodStatusId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    await loadPeriods();
  }, [user?.id, toast, loadPeriods]);

  const loadFinalRecords = useCallback(async (periodStatusId: string) => {
    if (!companyId) return;
    const { data } = await supabase
      .from("reconciliation_final_records" as any)
      .select("*")
      .eq("period_status_id", periodStatusId)
      .order("created_at");
    setFinalRecords((data || []) as any);
  }, [companyId]);

  const generateFinalRecords = useCallback(async (periodStatusId: string) => {
    if (!companyId || !user?.id) return;

    // Get period info
    const period = periods.find(p => p.id === periodStatusId);
    if (!period) return;

    // Fetch all normalized data for this company within period dates
    const [schedRes, clockRes, payrollRes, matchRes] = await Promise.all([
      supabase.from("normalized_schedule_rows" as any).select("*").eq("company_id", companyId),
      supabase.from("normalized_clock_rows" as any).select("*").eq("company_id", companyId),
      supabase.from("normalized_payroll_rows" as any).select("*").eq("company_id", companyId),
      supabase.from("reconciliation_matches" as any).select("*").eq("company_id", companyId),
    ]);

    const schedules = (schedRes.data || []) as any[];
    const clocks = (clockRes.data || []) as any[];
    const payrolls = (payrollRes.data || []) as any[];
    const matches = (matchRes.data || []) as any[];

    // Get employees
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("company_id", companyId);
    const empMap = new Map((employees || []).map(e => [e.id, `${e.first_name} ${e.last_name}`]));

    // Collect all employee IDs involved
    const employeeIds = new Set<string>();
    schedules.forEach(s => { if (s.matched_employee_id) employeeIds.add(s.matched_employee_id); });
    clocks.forEach(c => { if (c.matched_employee_id) employeeIds.add(c.matched_employee_id); });
    payrolls.forEach(p => { if (p.matched_employee_id) employeeIds.add(p.matched_employee_id); });

    // Build records per employee
    const records: any[] = [];
    for (const empId of employeeIds) {
      const empSchedules = schedules.filter(s => s.matched_employee_id === empId);
      const empClocks = clocks.filter(c => c.matched_employee_id === empId);
      const empPayrolls = payrolls.filter(p => p.matched_employee_id === empId);
      const empMatches = matches.filter(m => m.employee_id === empId);

      const totalScheduledHours = empSchedules.reduce((sum, s) => sum + (Number(s.total_hours) || 0), 0);
      const totalWorkedHours = empClocks.reduce((sum, c) => sum + (Number(c.total_hours) || 0), 0);
      const totalPayrollHours = empPayrolls.reduce((sum, p) => sum + (Number(p.total_hours) || 0), 0);
      const totalPayrollAmount = empPayrolls.reduce((sum, p) => sum + (Number(p.total_pay) || 0), 0);

      const rideRows = empPayrolls.filter(p => p.pay_type === "pay_ride");
      const weekendRows = empPayrolls.filter(p => p.pay_type === "weekend_job");
      const manualRows = empPayrolls.filter(p => p.pay_type === "manual_adjustment");
      const baseRows = empPayrolls.filter(p => !["pay_ride", "weekend_job", "manual_adjustment"].includes(p.pay_type));

      const rideAmount = rideRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
      const weekendAmount = weekendRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
      const manualAmount = manualRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
      const basePay = baseRows.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);

      // Determine dominant pay classification
      const payTypes = empPayrolls.map(p => p.pay_type).filter(Boolean);
      const classification = payTypes.length > 0
        ? [...new Set(payTypes)].length === 1 ? payTypes[0] : "mixed"
        : "unknown";

      // Count conflicts
      const unresolvedMatches = empMatches.filter(m => m.match_status === "ambiguous" || m.match_status === "unmatched");
      const conflictCount = unresolvedMatches.length;

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
        ride_amount: Math.round(rideAmount * 100) / 100,
        weekend_amount: Math.round(weekendAmount * 100) / 100,
        manual_amount: Math.round(manualAmount * 100) / 100,
        base_pay: Math.round(basePay * 100) / 100,
        final_total_pay: Math.round(totalPayrollAmount * 100) / 100,
        reconciliation_status: conflictCount > 0 ? "partial" : "resolved",
        conflict_count: conflictCount,
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
      status: "reviewing",
      updated_at: new Date().toISOString(),
    } as any).eq("id", periodStatusId);

    await loadFinalRecords(periodStatusId);
    await loadPeriods();
    toast({ title: "Registros generados", description: `${records.length} empleados procesados.` });
  }, [companyId, user?.id, periods, toast, loadFinalRecords, loadPeriods]);

  const postFinalRecords = useCallback(async (periodStatusId: string) => {
    if (!companyId || !user?.id) return;
    // Mark all resolved records as posted
    await supabase.from("reconciliation_final_records" as any)
      .update({ reconciliation_status: "posted", approved_by: user.id, approved_at: new Date().toISOString() } as any)
      .eq("period_status_id", periodStatusId)
      .in("reconciliation_status", ["resolved", "approved"] as any);

    await updatePeriodStatus(periodStatusId, "posted");
    toast({ title: "Periodo publicado", description: "Los registros finales han sido creados." });
  }, [companyId, user?.id, updatePeriodStatus, toast]);

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

  return {
    periods, loading, activePeriod, setActivePeriod,
    finalRecords, loadPeriods, createPeriod, updatePeriodStatus,
    loadFinalRecords, generateFinalRecords, postFinalRecords,
    saveMappingCorrection,
  };
}
