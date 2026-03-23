import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { parseTruthFile, type TruthParseResult } from "@/lib/truth-file-parser";
import {
  runReconciliation,
  normalizeName,
  generateExecutiveCSV,
  generateMismatchCSV,
  generateCriticalCSV,
  type TruthRow,
  type SystemEmployeeData,
  type ReconciliationRowResult,
  type BatchSummary,
  type ToleranceConfig,
} from "@/lib/payroll-reconciliation-engine";

export interface ReconciliationBatch {
  id: string;
  company_id: string;
  status: string;
  truth_source_file_name: string | null;
  employees_truth_count: number;
  matched_count: number;
  exact_match_count: number;
  mismatch_count: number;
  critical_mismatch_count: number;
  total_variance_amount: number;
  payroll_period_start: string | null;
  payroll_period_end: string | null;
  created_at: string;
  tolerance_hours: number;
  tolerance_money: number;
  tolerance_tips: number;
  approved_at: string | null;
  approved_by: string | null;
  locked_at: string | null;
  notes: string | null;
  checklist_json: Record<string, boolean> | null;
  health_score: number | null;
  health_grade: string | null;
}

export interface ApprovalChecklist {
  all_critical_reviewed: boolean;
  all_unmatched_resolved: boolean;
  low_confidence_confirmed: boolean;
  variance_acknowledged: boolean;
  identity_issues_reviewed: boolean;
  manual_adjustments_checked: boolean;
}

export const DEFAULT_CHECKLIST: ApprovalChecklist = {
  all_critical_reviewed: false,
  all_unmatched_resolved: false,
  low_confidence_confirmed: false,
  variance_acknowledged: false,
  identity_issues_reviewed: false,
  manual_adjustments_checked: false,
};

export function usePayrollReconciliation() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();

  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<ReconciliationBatch | null>(null);
  const [truthParseResult, setTruthParseResult] = useState<TruthParseResult | null>(null);
  const [reconciliationRows, setReconciliationRows] = useState<ReconciliationRowResult[]>([]);
  const [systemOnlyEmployees, setSystemOnlyEmployees] = useState<SystemEmployeeData[]>([]);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadBatches = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("reconciliation_batches")
      .select("*")
      .eq("company_id", selectedCompanyId)
      .order("created_at", { ascending: false });
    setBatches((data as any[]) || []);
    setLoading(false);
  }, [selectedCompanyId]);

  const createBatch = useCallback(async (periodStart?: string, periodEnd?: string) => {
    if (!selectedCompanyId || !user?.id) return null;
    const { data, error } = await supabase
      .from("reconciliation_batches")
      .insert({
        company_id: selectedCompanyId,
        created_by: user.id,
        payroll_period_start: periodStart || null,
        payroll_period_end: periodEnd || null,
        status: "DRAFT",
      } as any)
      .select()
      .single();
    if (error) { toast({ title: "Error creando batch", variant: "destructive" }); return null; }
    const batch = data as any as ReconciliationBatch;
    setActiveBatch(batch);
    await loadBatches();
    return batch;
  }, [selectedCompanyId, user?.id, toast, loadBatches]);

  const uploadTruth = useCallback(async (file: File, batchId: string) => {
    setProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = parseTruthFile(new Uint8Array(buffer));
      setTruthParseResult(result);

      const rowsToInsert = result.rows.map(r => ({
        batch_id: batchId,
        employer_identification: r.employer_identification || null,
        verification_ssn_ein: r.verification_ssn_ein || null,
        employer_identification_normalized: r.employer_identification ? normalizeName(r.employer_identification) : null,
        verification_ssn_ein_normalized: r.verification_ssn_ein ? r.verification_ssn_ein.replace(/[^0-9]/g, "") : null,
        first_name: r.first_name,
        last_name: r.last_name,
        full_name_normalized: normalizeName(`${r.first_name} ${r.last_name}`),
        truth_total_hours: r.total_hours,
        truth_total_pay: r.total_pay,
        truth_pay_per_day: r.pay_per_day,
        truth_ryde: r.ryde,
        truth_tips: r.tips,
        truth_reimbursements: r.reimbursements,
        truth_total: r.total,
        truth_observaciones: r.observaciones || null,
        truth_date: r.date || null,
        truth_corte: r.corte || null,
        truth_raw_json: r.raw,
        match_status: "UNMATCHED",
      }));

      await supabase.from("reconciliation_employee_rows").delete().eq("batch_id", batchId);

      for (let i = 0; i < rowsToInsert.length; i += 50) {
        await supabase.from("reconciliation_employee_rows").insert(rowsToInsert.slice(i, i + 50) as any[]);
      }

      await supabase.from("reconciliation_batches").update({
        status: "TRUTH_UPLOADED",
        truth_source_file_name: file.name,
        truth_source_uploaded_at: new Date().toISOString(),
        employees_truth_count: result.rows.length,
      } as any).eq("id", batchId);

      toast({ title: "Archivo importado", description: `${result.rows.length} empleados parseados` });
    } catch (err: any) {
      toast({ title: "Error al parsear archivo", description: err.message, variant: "destructive" });
    }
    setProcessing(false);
  }, [toast]);

  const runReconciliationForBatch = useCallback(async (batchId: string) => {
    if (!selectedCompanyId) return;
    setProcessing(true);

    try {
      // 1. Load truth rows
      const { data: dbRows } = await supabase
        .from("reconciliation_employee_rows")
        .select("*")
        .eq("batch_id", batchId);

      if (!dbRows || dbRows.length === 0) {
        toast({ title: "No hay filas de verdad cargadas", variant: "destructive" });
        setProcessing(false);
        return;
      }

      const truthRows: TruthRow[] = (dbRows as any[]).map(r => ({
        employer_identification: r.employer_identification,
        verification_ssn_ein: r.verification_ssn_ein,
        first_name: r.first_name || "",
        last_name: r.last_name || "",
        total_hours: r.truth_total_hours,
        total_pay: r.truth_total_pay,
        pay_per_day: r.truth_pay_per_day,
        ryde: r.truth_ryde,
        tips: r.truth_tips,
        reimbursements: r.truth_reimbursements,
        total: r.truth_total,
        observaciones: r.truth_observaciones,
        date: r.truth_date,
        corte: r.truth_corte,
        raw: (r.truth_raw_json as any) || {},
      }));

      // 2. Load system employees
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name, phone_number, email, connecteam_employee_id")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true);

      const systemData: SystemEmployeeData[] = (employees || []).map((e: any) => ({
        employee_id: e.id,
        first_name: e.first_name || "",
        last_name: e.last_name || "",
        phone: e.phone_number,
        email: e.email,
        external_id: e.connecteam_employee_id,
        total_hours: 0,
        total_pay: 0,
        pay_per_day: 0,
        ryde: 0,
        tips: 0,
        reimbursements: 0,
        total: 0,
        shift_count: 0,
        clock_count: 0,
        source_tags: [],
      }));

      // 3. Enrich system data from normalized_schedule_rows or reconciliation data if available
      const batch = activeBatch || batches.find(b => b.id === batchId);
      if (batch?.payroll_period_start && batch?.payroll_period_end) {
        try {
          const { data: periodPayroll } = await supabase
            .from("normalized_schedule_rows" as any)
            .select("employee_id, total_hours, total_pay")
            .eq("company_id", selectedCompanyId)
            .gte("work_date", batch.payroll_period_start)
            .lte("work_date", batch.payroll_period_end);

          if (periodPayroll && (periodPayroll as any[]).length > 0) {
            const byEmployee = new Map<string, { hours: number; pay: number; total: number }>();
            for (const row of periodPayroll as any[]) {
              if (!row.employee_id) continue;
              const existing = byEmployee.get(row.employee_id) || { hours: 0, pay: 0, total: 0 };
              existing.hours += row.total_hours || 0;
              existing.pay += row.total_pay || 0;
              existing.total += row.total_pay || 0;
              byEmployee.set(row.employee_id, existing);
            }

            for (const sd of systemData) {
              const enrichment = byEmployee.get(sd.employee_id);
              if (enrichment) {
                sd.total_hours = enrichment.hours;
                sd.total_pay = enrichment.pay;
                sd.total = enrichment.total;
                sd.source_tags.push("schedule_rows");
              }
            }
          }
        } catch {
          // Table may not exist, continue with empty system data
        }
      }

      // 4. Load aliases
      const { data: aliasData } = await supabase
        .from("employee_aliases")
        .select("alias_name_normalized, real_employee_id, confidence")
        .eq("company_id", selectedCompanyId);

      const aliases = (aliasData || []).map((a: any) => ({
        alias_normalized: a.alias_name_normalized,
        employee_id: a.real_employee_id,
        confidence: a.confidence || 80,
      }));

      // 5. Get tolerances
      const { data: batchData } = await supabase
        .from("reconciliation_batches")
        .select("tolerance_hours, tolerance_money, tolerance_tips")
        .eq("id", batchId)
        .single();

      const tolerance: ToleranceConfig = {
        hours: (batchData as any)?.tolerance_hours ?? 0.1,
        money: (batchData as any)?.tolerance_money ?? 1.0,
        tips: (batchData as any)?.tolerance_tips ?? 0.5,
      };

      // 6. Run engine
      const result = runReconciliation(truthRows, systemData, aliases, tolerance);
      setReconciliationRows(result.rows);
      setSystemOnlyEmployees(result.systemOnly);
      setBatchSummary(result.summary);

      // 7. Update DB rows
      for (const row of result.rows) {
        const dbRow = (dbRows as any[]).find(
          (d: any) => normalizeName(`${d.first_name} ${d.last_name}`) === normalizeName(`${row.truth.first_name} ${row.truth.last_name}`)
        );
        if (!dbRow) continue;

        await supabase.from("reconciliation_employee_rows").update({
          matched_system_employee_id: row.match.system_employee_id,
          match_status: row.match.match_status,
          match_confidence: row.match.match_confidence,
          matched_by: row.match.matched_by,
          match_notes: row.match.match_notes,
          system_total_hours: row.system?.total_hours ?? null,
          system_total_pay: row.system?.total_pay ?? null,
          system_pay_per_day: row.system?.pay_per_day ?? null,
          system_ryde: row.system?.ryde ?? null,
          system_tips: row.system?.tips ?? null,
          system_reimbursements: row.system?.reimbursements ?? null,
          system_total: row.system?.total ?? null,
          variance_hours: row.variances.hours,
          variance_total_pay: row.variances.total_pay,
          variance_pay_per_day: row.variances.pay_per_day,
          variance_ryde: row.variances.ryde,
          variance_tips: row.variances.tips,
          variance_reimbursements: row.variances.reimbursements,
          variance_total: row.variances.total,
          row_status: row.classification.row_status,
          is_exact_match: row.classification.is_exact_match,
          has_component_mismatch: row.classification.has_component_mismatch,
          has_critical_mismatch: row.classification.has_critical_mismatch,
          has_manual_adjustment: row.classification.has_manual_adjustment,
          anomaly_flags_json: row.anomaly_flags,
          shift_count: row.system?.shift_count ?? 0,
          clock_count: row.system?.clock_count ?? 0,
          source_tags: row.system?.source_tags ?? [],
        } as any).eq("id", dbRow.id);
      }

      // 8. Update batch summary
      await supabase.from("reconciliation_batches").update({
        status: result.summary.batch_status === "MATCHED" ? "RECONCILED" : result.summary.batch_status === "CRITICAL" ? "CRITICAL" : "NEEDS_REVIEW",
        matched_count: result.summary.matched,
        unmatched_truth_count: result.summary.unmatched_truth,
        unmatched_system_count: result.summary.unmatched_system,
        exact_match_count: result.summary.exact_match,
        mismatch_count: result.summary.mismatch,
        component_mismatch_count: result.summary.component_mismatch,
        critical_mismatch_count: result.summary.critical_mismatch,
        total_variance_amount: result.summary.total_variance,
        employees_system_count: result.summary.system_count,
        totals_truth_json: result.summary.totals_truth as any,
        totals_system_json: result.summary.totals_system as any,
        totals_variance_json: result.summary.totals_variance as any,
        health_score: result.summary.health.score,
        health_grade: result.summary.health.grade,
      } as any).eq("id", batchId);

      toast({ title: "Reconciliación completada", description: `${result.summary.exact_match} exactos, ${result.summary.critical_mismatch} críticos, Health: ${result.summary.health.grade}` });
    } catch (err: any) {
      toast({ title: "Error en reconciliación", description: err.message, variant: "destructive" });
    }
    setProcessing(false);
  }, [selectedCompanyId, toast, activeBatch, batches]);

  const saveChecklist = useCallback(async (batchId: string, checklist: ApprovalChecklist) => {
    await supabase.from("reconciliation_batches").update({
      checklist_json: checklist as any,
    } as any).eq("id", batchId);
  }, []);

  const approveBatch = useCallback(async (batchId: string, checklist: ApprovalChecklist) => {
    if (!user?.id) return;

    // Log audit
    await supabase.from("reconciliation_audit_log").insert({
      batch_id: batchId,
      action_type: "batch_approve",
      new_value: JSON.stringify(checklist),
      performed_by: user.id,
      note: `Approved with checklist. Health: ${batchSummary?.health.grade || "N/A"}`,
    } as any);

    await supabase.from("reconciliation_batches").update({
      status: "APPROVED",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      checklist_json: checklist as any,
    } as any).eq("id", batchId);

    toast({ title: "Batch aprobado" });
    await loadBatches();
  }, [user?.id, toast, loadBatches, batchSummary]);

  const lockBatch = useCallback(async (batchId: string) => {
    if (!user?.id) return;

    await supabase.from("reconciliation_audit_log").insert({
      batch_id: batchId,
      action_type: "batch_lock",
      performed_by: user.id,
      note: "Batch locked — no further changes allowed",
    } as any);

    await supabase.from("reconciliation_batches").update({
      status: "LOCKED",
      locked_at: new Date().toISOString(),
    } as any).eq("id", batchId);

    toast({ title: "Batch bloqueado" });
    await loadBatches();
  }, [user?.id, toast, loadBatches]);

  const resolveMatch = useCallback(async (rowId: string, employeeId: string, batchId: string) => {
    if (!user?.id) return;
    await supabase.from("reconciliation_employee_rows").update({
      matched_system_employee_id: employeeId,
      match_status: "MATCHED",
      matched_by: "manual",
      match_confidence: 100,
      match_notes: "Manual match by user",
    } as any).eq("id", rowId);

    await supabase.from("reconciliation_audit_log").insert({
      batch_id: batchId,
      employee_row_id: rowId,
      action_type: "manual_match",
      new_value: employeeId,
      performed_by: user.id,
      note: "Manual employee match",
    } as any);

    toast({ title: "Match resuelto" });
  }, [user?.id, toast]);

  const addReviewNote = useCallback(async (rowId: string, note: string, batchId: string) => {
    if (!user?.id) return;
    await supabase.from("reconciliation_employee_rows").update({
      review_note: note,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    } as any).eq("id", rowId);

    await supabase.from("reconciliation_audit_log").insert({
      batch_id: batchId,
      employee_row_id: rowId,
      action_type: "review_note",
      new_value: note,
      performed_by: user.id,
    } as any);
  }, [user?.id]);

  const exportCSV = useCallback((rows: ReconciliationRowResult[]): string[][] => {
    const headers = [
      "Employee", "Match Status", "Confidence", "Matched By",
      "Truth Hours", "System Hours", "Var Hours",
      "Truth Pay", "System Pay", "Var Pay",
      "Truth PayPerDay", "System PayPerDay", "Var PayPerDay",
      "Truth Ryde", "System Ryde", "Var Ryde",
      "Truth Tips", "System Tips", "Var Tips",
      "Truth Reimb", "System Reimb", "Var Reimb",
      "Truth Total", "System Total", "Var Total",
      "Status", "Exception", "Flags", "Observaciones",
    ];

    const dataRows = rows.map(r => [
      `${r.truth.first_name} ${r.truth.last_name}`,
      r.match.match_status, String(r.match.match_confidence), r.match.matched_by,
      String(r.truth.total_hours ?? ""), String(r.system?.total_hours ?? ""), String(r.variances.hours ?? ""),
      String(r.truth.total_pay ?? ""), String(r.system?.total_pay ?? ""), String(r.variances.total_pay ?? ""),
      String(r.truth.pay_per_day ?? ""), String(r.system?.pay_per_day ?? ""), String(r.variances.pay_per_day ?? ""),
      String(r.truth.ryde ?? ""), String(r.system?.ryde ?? ""), String(r.variances.ryde ?? ""),
      String(r.truth.tips ?? ""), String(r.system?.tips ?? ""), String(r.variances.tips ?? ""),
      String(r.truth.reimbursements ?? ""), String(r.system?.reimbursements ?? ""), String(r.variances.reimbursements ?? ""),
      String(r.truth.total ?? ""), String(r.system?.total ?? ""), String(r.variances.total ?? ""),
      r.classification.row_status, r.exception_type || "", r.anomaly_flags.join("; "), r.truth.observaciones || "",
    ]);

    return [headers, ...dataRows];
  }, []);

  const exportExecutive = useCallback(() => {
    if (!batchSummary) return [];
    return generateExecutiveCSV(reconciliationRows, batchSummary);
  }, [reconciliationRows, batchSummary]);

  const exportMismatches = useCallback(() => {
    return generateMismatchCSV(reconciliationRows);
  }, [reconciliationRows]);

  const exportCritical = useCallback(() => {
    return generateCriticalCSV(reconciliationRows);
  }, [reconciliationRows]);

  return {
    batches, activeBatch, setActiveBatch,
    truthParseResult, reconciliationRows, systemOnlyEmployees, batchSummary,
    loading, processing,
    loadBatches, createBatch, uploadTruth,
    runReconciliationForBatch, approveBatch, lockBatch,
    resolveMatch, addReviewNote,
    exportCSV, exportExecutive, exportMismatches, exportCritical,
    saveChecklist,
  };
}
