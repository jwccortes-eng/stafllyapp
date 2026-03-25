import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DollarSign, CheckCircle2, AlertTriangle, Upload, Loader2, ChevronDown, ChevronRight, Download, Database, ArrowUpDown, Wrench } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  parsePayrollTruthWorkbook,
  type PayrollTruthParseResult,
  type PayrollTruthRow,
} from "@/lib/payroll-truth-parser";
import { matchEmployees } from "@/lib/payroll-reconciliation-engine";

type LedgerCategory = "hourly" | "daily" | "ride" | "weekend" | "manual" | "deduction" | "reimbursement" | "other";
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
  unmapped_count: number;
  unmapped_excluded_total: number;
  total_final: number;
  authoritative_total: number;
  authoritative_source: string | null;
  primary_source: "shift_calc" | "payroll" | null;
  shift_calc_total: number;
  shift_full_day_count: number;
  shift_half_day_count: number;
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
  // Hours tracking
  clocked_hours: number;
  scheduled_hours: number;
  base_pay_hours: number;
  hours_source_used: "clocked" | "truth" | "scheduled" | "none";
  ledger: LedgerEntry[];
  flags: string[];
}

type ReviewGroup =
  | "standard"
  | "missing_system_data"
  | "system_inferred_exceeds_truth"
  | "truth_override_candidate"
  | "pay_model_mismatch"
  | "true_business_mismatch";

interface ComparisonRow {
  employee: string;
  truth: PayrollTruthRow;
  recon: ReconBreakdown | null;
  matchEmployeeId?: string | null;
  matchedBy?: string;
  matchConfidence?: number;
  totalVariance: number;
  status: "match" | "close" | "mismatch" | "missing" | "identity_only";
  reviewGroup: ReviewGroup;
  closureAmount: number;
  systemInferredOnly: boolean;
  compositionError: boolean;
  compositionReason: string | null;
}

interface Props {
  companyId: string | null;
  periodStatusId?: string;
  finalRecords?: any[];
  onGenerateFinalRecords?: () => Promise<void>;
  truthAuthoritativeMode?: boolean;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isSystemInferredOnly(recon: ReconBreakdown | null): boolean {
  if (!recon) return false;
  return recon.schedule_count === 0 && recon.clock_count === 0 && recon.payroll_row_count === 0 && recon.total_final > 0;
}

function deriveOperationalStatus(
  status: ComparisonRow["status"],
  truthTotal: number,
  closureAmount: number,
  truthAuthoritativeMode: boolean,
  hasMatchedIdentity?: boolean
): ComparisonRow["status"] {
  if (!truthAuthoritativeMode) return status;

  // In truth-authoritative mode, if closure aligns with truth, the row is resolved
  // regardless of whether system-side operational data exists.
  const closureVariance = Math.abs(round2(closureAmount - truthTotal));

  if (status === "identity_only" || status === "missing") {
    // If closure == truth in truth-authoritative mode, this is a truth-validated match
    if (closureVariance < 1 && truthTotal > 0) return "match";
    return status;
  }

  if (closureVariance < 1) return "match";
  if (closureVariance < 50) return "close";
  return "mismatch";
}

function deriveReviewGroup(
  status: ComparisonRow["status"],
  recon: ReconBreakdown | null,
  truthTotal: number,
  totalVariance: number,
  truthAuthoritativeMode: boolean,
  closureAmount: number
): ReviewGroup {
  const closureAlignedToTruth = Math.abs(round2(closureAmount - truthTotal)) < 1;

  // In truth-authoritative mode, if closure == truth, the row is standard/resolved
  // even if there's no system-side data (identity_only / missing with closure).
  if (truthAuthoritativeMode && closureAlignedToTruth && truthTotal > 0) {
    if (!recon) return "standard"; // truth-validated, no system data needed
    const inferredOnly = isSystemInferredOnly(recon);
    const systemExceedsTruth = round2(recon.total_final - truthTotal) > 1;
    if (inferredOnly && systemExceedsTruth) return "truth_override_candidate";
    return "standard";
  }

  if (status === "identity_only" || status === "missing") return "missing_system_data";
  if (!recon) return "standard";

  const inferredOnly = isSystemInferredOnly(recon);
  const systemExceedsTruth = round2(recon.total_final - truthTotal) > 1;

  if (truthAuthoritativeMode && inferredOnly && systemExceedsTruth) return "truth_override_candidate";
  if (inferredOnly && systemExceedsTruth) return "system_inferred_exceeds_truth";
  if (truthAuthoritativeMode && status === "mismatch" && totalVariance > 50 && recon.authoritative_source === "period_base_pay") return "pay_model_mismatch";
  if (status === "mismatch") return "true_business_mismatch";

  return "standard";
}

function classifyMovement(conceptName: string): LedgerCategory {
  const n = conceptName.toLowerCase();
  if (n.includes("descuento") || n.includes("discount")) return "deduction";
  if (n.includes("ride") || n.includes("ryde") || n.includes("transporte")) return "ride";
  if (n.includes("hourly") || n.includes("hora") || n.includes("regular") || n.includes("base pay")) return "hourly";
  if (n.includes("daily") || n.includes("diario")) return "daily";
  if (n.includes("weekend") || n.includes("doble") || n.includes("double")) return "weekend";
  if (n.includes("tip") || n.includes("propina")) return "manual";
  if (n.includes("reintegro") || n.includes("reimburs") || n.includes("reembolso")) return "reimbursement";
  if (n.includes("viaje") || n.includes("travel")) return "manual";
  if (n.includes("otros") || n.includes("other pay")) return "manual";
  if (n.includes("adjust") || n.includes("manual") || n.includes("correction") || n.includes("bonus")) return "manual";
  return "other";
}

function classifyPayrollType(payType: string | null | undefined, notes: string | null | undefined): LedgerCategory {
  const t = (payType || "").toLowerCase().trim();
  if (t === "hourly" || t === "regular" || t === "regular pay" || t === "base" || t === "base pay" || t === "hora") return "hourly";
  if (t === "daily" || t === "daily pay" || t === "diario") return "daily";
  if (t === "pay_ride" || t === "ride" || t === "ryde" || t === "transporte") return "ride";
  if (t === "weekend_job" || t === "weekend" || t === "doble" || t === "double" || t === "paga doble") return "weekend";
  if (t === "discount" || t === "descuento" || t === "descuentos") return "deduction";
  if (t === "reimbursement" || t === "reembolso" || t === "reintegro") return "reimbursement";
  if (t === "manual_adjustment" || t === "manual" || t === "adjustment" || t === "bonus" || t === "correction") return "manual";

  const n = (notes || "").toLowerCase();
  if (n.includes("descuento") || n.includes("discount")) return "deduction";
  if (n.includes("weekend") || n.includes("doble") || n.includes("double")) return "weekend";
  if (n.includes("ride") || n.includes("ryde") || n.includes("transporte")) return "ride";
  if (n.includes("reintegro") || n.includes("reimburs") || n.includes("reembolso")) return "reimbursement";
  if (n.includes("manual") || n.includes("adjust") || n.includes("bonus")) return "manual";
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
  else if (category === "deduction") row.manual_adj += value; // negative value preserved
  else if (category === "reimbursement") row.manual_adj += value;
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

function mapPersistedRowStatus(rowStatus: string | null | undefined): ComparisonRow["status"] {
  if (rowStatus === "EXACT_MATCH") return "match";
  if (rowStatus === "WITHIN_TOLERANCE") return "close";
  if (rowStatus === "MISMATCH") return "mismatch";
  if (rowStatus === "IDENTITY_MATCH_NO_SYSTEM_DATA") return "identity_only";
  return "missing";
}

function buildTruthFromPersistedRow(row: any): PayrollTruthRow {
  const raw = (row?.truth_raw_json || {}) as Record<string, any>;
  const firstName = String(row?.first_name || "").trim();
  const lastName = String(row?.last_name || "").trim();
  const employee = `${firstName} ${lastName}`.trim() || String(raw.employee || "").trim() || "Empleado";

  return {
    employee,
    firstName,
    lastName,
    employerIdentification: String(row?.employer_identification || ""),
    verificationSsnEin: String(row?.verification_ssn_ein || ""),
    phoneNumber: String(row?.phone || raw["Phone number"] || ""),
    email: String(row?.email || raw.Email || ""),
    totalPay: Number(row?.truth_total_pay) || 0,
    hourlyRate: null,
    payperDay: Number(row?.truth_pay_per_day) || 0,
    ryde: Number(row?.truth_ryde) || 0,
    tips: Number(row?.truth_tips) || 0,
    reimbursements: Number(row?.truth_reimbursements) || 0,
    travelHours: Number(raw.travel_hours) || 0,
    otros: Number(raw.otros) || 0,
    discount: Number(raw.discount) || 0,
    total: Number(row?.truth_total) || 0,
    shiftHours: 0,
    observaciones: String(row?.truth_observaciones || ""),
  };
}

function buildReconFromPersistedRow(row: any, employeeName: string): ReconBreakdown | null {
  const hasSystemData =
    row?.system_total != null ||
    row?.system_total_pay != null ||
    row?.system_pay_per_day != null ||
    row?.system_ryde != null ||
    row?.system_tips != null;

  if (!hasSystemData) return null;

  return {
    employee_id: String(row?.matched_system_employee_id || ""),
    employee_name: employeeName,
    hourly_pay: Number(row?.system_total_pay) || 0,
    daily_pay: Number(row?.system_pay_per_day) || 0,
    ride_pay: Number(row?.system_ryde) || 0,
    weekend_pay: 0,
    manual_adj: Number(row?.system_tips) || 0,
    other_pay: 0,
    unmapped_count: 0,
    unmapped_excluded_total: 0,
    total_final: Number(row?.system_total) || 0,
    authoritative_total: Number(row?.system_total) || 0,
    authoritative_source: "persisted_truth_validation",
    primary_source: "payroll",
    shift_calc_total: 0,
    shift_full_day_count: 0,
    shift_half_day_count: 0,
    inferred_total: 0,
    movement_unique_total: 0,
    naive_total: Number(row?.system_total) || 0,
    total_raw: 0,
    total_suppressed: 0,
    overlap_excluded_total: 0,
    base_pay: Number(row?.system_total_pay) || 0,
    schedule_count: Number(row?.shift_count) || 0,
    clock_count: Number(row?.clock_count) || 0,
    payroll_row_count: 0,
    clocked_hours: 0,
    scheduled_hours: 0,
    base_pay_hours: 0,
    hours_source_used: "none",
    ledger: [],
    flags: [],
  };
}

export default function PayrollTruthValidation({ companyId, periodStatusId, finalRecords: externalFinalRecords, onGenerateFinalRecords, truthAuthoritativeMode = false }: Props) {
  const [generatingFinal, setGeneratingFinal] = useState(false);
  const { user } = useAuth();
  const [truthData, setTruthData] = useState<PayrollTruthRow[]>([]);
  const [truthParse, setTruthParse] = useState<PayrollTruthParseResult | null>(null);
  const [reconData, setReconData] = useState<ReconBreakdown[]>([]);
  const [truthMatches, setTruthMatches] = useState<Array<{ employeeId: string | null; matchedBy: string; confidence: number; status: "MATCHED" | "UNMATCHED" | "AMBIGUOUS" }>>([]);
  const [loading, setLoading] = useState(false);
  const [truthLoaded, setTruthLoaded] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [truthSource, setTruthSource] = useState<{ type: "pre-staged" | "manual" | "persisted"; fileName: string; loadedAt: string } | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [dbPersisted, setDbPersisted] = useState(false);
  const [persistingToDb, setPersistingToDb] = useState(false);
  const [persistedComparison, setPersistedComparison] = useState<ComparisonRow[] | null>(null);

  const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtVar = (v: number) => `${v >= 0 ? "+" : ""}${fmt(v)}`;

  const storagePath = companyId && periodStatusId ? `${companyId}/${periodStatusId}/truth-file.xlsx` : null;

  const toggleRow = (name: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const applyParsedTruth = (parsed: PayrollTruthParseResult, source: { type: "pre-staged" | "manual" | "persisted"; fileName: string }) => {
    setTruthParse(parsed);
    setTruthData(parsed.rows);
    setTruthLoaded(true);
    setTruthSource({ ...source, loadedAt: new Date().toLocaleTimeString() });
  };

  // Persist uploaded file to storage
  const persistToStorage = async (fileBytes: ArrayBuffer, fileName: string) => {
    if (!storagePath) return;
    try {
      // Upload/overwrite truth file
      await supabase.storage.from("payroll-truth-files").upload(storagePath, new Blob([fileBytes]), {
        upsert: true,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      // Save metadata
      const metaPath = `${storagePath}.meta.json`;
      const meta = JSON.stringify({ fileName, uploadedAt: new Date().toISOString() });
      await supabase.storage.from("payroll-truth-files").upload(metaPath, new Blob([meta], { type: "application/json" }), { upsert: true });
      setPersisted(true);
    } catch (err) {
      console.error("Failed to persist truth file:", err);
      setPersisted(false);
    }
  };

  // Auto-load persisted truth file on mount
  useEffect(() => {
    if (!storagePath || truthLoaded) return;
    let cancelled = false;

    (async () => {
      try {
        // Check if persisted file exists
        const metaPath = `${storagePath}.meta.json`;
        const { data: metaBlob } = await supabase.storage.from("payroll-truth-files").download(metaPath);
        if (!metaBlob || cancelled) return;
        const metaText = await metaBlob.text();
        const meta = JSON.parse(metaText) as { fileName: string; uploadedAt: string };

        const { data: fileBlob } = await supabase.storage.from("payroll-truth-files").download(storagePath);
        if (!fileBlob || cancelled) return;

        const buffer = await fileBlob.arrayBuffer();
        const parsed = parsePayrollTruthWorkbook(buffer);
        if (cancelled) return;
        applyParsedTruth(parsed, { type: "persisted", fileName: meta.fileName });
        setPersisted(true);
      } catch {
        // No persisted file — that's fine
      }
    })();

    return () => { cancelled = true; };
  }, [storagePath]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Legacy pre-staged truth loader removed — use manual upload or storage-based auto-load instead */
  const loadTruthFile = async () => {
    console.info("Use the manual upload button to load a truth file for the active period.");
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setTruthLoaded(false);
    setTruthData([]);
    setTruthParse(null);
    setTruthSource(null);
    setPersisted(false);
    setDbPersisted(false);
    setPersistedComparison(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parsePayrollTruthWorkbook(buffer);
      applyParsedTruth(parsed, { type: "manual", fileName: file.name });
      await persistToStorage(buffer, file.name);
    } catch (err: any) {
      console.error("Error parsing manual truth file:", err);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const clearTruth = async () => {
    setTruthData([]);
    setTruthParse(null);
    setTruthLoaded(false);
    setTruthSource(null);
    setPersisted(false);
    setDbPersisted(false);
    setPersistedComparison(null);
    // Remove persisted file
    if (storagePath) {
      await supabase.storage.from("payroll-truth-files").remove([storagePath, `${storagePath}.meta.json`]);
    }
  };

  // ── Build identity matches for truth rows (independent of system totals availability) ──
  useEffect(() => {
    if (!companyId || truthData.length === 0) {
      setTruthMatches([]);
      return;
    }

    let cancelled = false;

    (async () => {
      const [employeesRes, aliasesRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, first_name, last_name, phone_number, email, connecteam_employee_id, employer_identification, verification_ssn_ein")
          .eq("company_id", companyId)
          .eq("is_active", true),
        supabase
          .from("employee_aliases")
          .select("alias_name_normalized, employee_id")
          .eq("company_id", companyId),
      ]);

      if (cancelled) return;

      const candidates = (employeesRes.data || []).map((e: any) => ({
        id: e.id,
        first_name: e.first_name || "",
        last_name: e.last_name || "",
        phone: e.phone_number || undefined,
        email: e.email || undefined,
        external_id: e.connecteam_employee_id || undefined,
        employer_identification: e.employer_identification || undefined,
        verification_ssn_ein: e.verification_ssn_ein || undefined,
        full_name_normalized: `${e.first_name || ""} ${e.last_name || ""}`.toLowerCase(),
      }));

      const aliases = (aliasesRes.data || []).map((a: any) => ({
        alias_normalized: a.alias_name_normalized,
        employee_id: a.employee_id,
        confidence: 85,
      }));

      const truthRows = truthData.map((t) => ({
        employer_identification: t.employerIdentification || "",
        verification_ssn_ein: t.verificationSsnEin || "",
        first_name: t.firstName || "",
        last_name: t.lastName || "",
        total_hours: null,
        total_pay: t.totalPay || 0,
        pay_per_day: t.payperDay || 0,
        ryde: t.ryde || 0,
        tips: t.tips || 0,
        reimbursements: t.reimbursements || 0,
        total: t.total || 0,
        observaciones: t.observaciones || "",
        raw: {
          "Phone number": t.phoneNumber || "",
          Email: t.email || "",
        },
      }));

      const matches = matchEmployees(truthRows as any, candidates as any, aliases as any);
      if (cancelled) return;

      setTruthMatches(matches.map((m) => ({
        employeeId: m.system_employee_id,
        matchedBy: m.matched_by,
        confidence: m.match_confidence,
        status: m.match_status,
      })));
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, truthData]);

  // ── Hydrate persisted reconciliation rows to avoid stale in-memory counters ──
  useEffect(() => {
    if (!companyId || !periodStatusId || !truthLoaded) {
      setPersistedComparison(null);
      return;
    }

    // For a new manual upload, show live computed comparison until user saves.
    if (truthSource?.type === "manual") {
      setPersistedComparison(null);
      setDbPersisted(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: periodStatusData, error: periodStatusError } = await supabase
          .from("reconciliation_period_status" as any)
          .select("period_start, period_end")
          .eq("id", periodStatusId)
          .eq("company_id", companyId)
          .maybeSingle();

        const periodStatus = periodStatusData as unknown as { period_start: string; period_end: string } | null;
        if (periodStatusError || !periodStatus || cancelled) {
          if (!cancelled) {
            setPersistedComparison(null);
            setDbPersisted(false);
          }
          return;
        }

        const { data: latestBatchData, error: latestBatchError } = await supabase
          .from("reconciliation_batches" as any)
          .select("id")
          .eq("company_id", companyId)
          .eq("payroll_period_start", periodStatus.period_start)
          .eq("payroll_period_end", periodStatus.period_end)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const latestBatch = latestBatchData as unknown as { id: string } | null;
        if (latestBatchError || !latestBatch || cancelled) {
          if (!cancelled) {
            setPersistedComparison(null);
            setDbPersisted(false);
          }
          return;
        }

        const { data: persistedRowsData } = await supabase
          .from("reconciliation_employee_rows" as any)
          .select("*")
          .eq("batch_id", latestBatch.id);

        if (cancelled) return;

        const persistedRows = (persistedRowsData || []) as any[];
        if (persistedRows.length === 0) {
          setPersistedComparison(null);
          setDbPersisted(false);
          return;
        }

        const hydrated = persistedRows
          .map((row) => {
            const truth = buildTruthFromPersistedRow(row);
            const status = mapPersistedRowStatus(row?.row_status);
            const recon = buildReconFromPersistedRow(row, truth.employee);
            const rowVariance = Number(row?.variance_total);
            const totalVariance = Number.isFinite(rowVariance)
              ? rowVariance
              : recon
                ? round2(recon.total_final - truth.total)
                : status === "identity_only"
                  ? -Math.abs(truth.total || 0)
                  : truth.total || 0;
            const systemInferredOnly = isSystemInferredOnly(recon);
            const closureAmount = truthAuthoritativeMode ? (truth.total || 0) : (recon?.total_final ?? (truth.total || 0));
            const operationalStatus = deriveOperationalStatus(status, truth.total || 0, closureAmount, truthAuthoritativeMode);
            const reviewGroup = deriveReviewGroup(operationalStatus, recon, truth.total || 0, totalVariance, truthAuthoritativeMode, closureAmount);

            return {
              employee: truth.employee,
              truth,
              recon,
              matchEmployeeId: row?.matched_system_employee_id || null,
              matchedBy: row?.matched_by || "truth_validation",
              matchConfidence: Number(row?.match_confidence) || 0,
              totalVariance,
              status: operationalStatus,
              reviewGroup,
              closureAmount,
              systemInferredOnly,
              compositionError: false,
              compositionReason:
                status === "identity_only"
                  ? "Empleado mapeado, pero sin base operativa para este periodo (period_base_pay/movements)."
                  : status === "missing"
                    ? "Empleado no encontrado por identidad en la validación."
                    : null,
            } as ComparisonRow;
          })
          .sort((a, b) => {
            if (a.matchEmployeeId && !b.matchEmployeeId) return -1;
            if (!a.matchEmployeeId && b.matchEmployeeId) return 1;
            if (a.recon && !b.recon) return -1;
            if (!a.recon && b.recon) return 1;
            if (b.totalVariance !== a.totalVariance) return b.totalVariance - a.totalVariance;
            return Math.abs(b.totalVariance) - Math.abs(a.totalVariance);
          });

        setPersistedComparison(hydrated);
        setDbPersisted(true);
      } catch (error) {
        console.error("Failed to hydrate persisted truth comparison:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, periodStatusId, truthAuthoritativeMode, truthLoaded, truthSource?.type]);

  // ── Persist reconciliation results to DB ──
  const persistResultsToDb = useCallback(async (compRows: ComparisonRow[], statsData: { matched: number; close: number; mismatch: number; missing: number; totalTruth: number; totalRecon: number; variance: number }) => {
    if (!companyId || !user?.id || compRows.length === 0) return;
    setPersistingToDb(true);
    try {
      // Find period dates from reconciliation_period_status
      const { data: ps } = await supabase
        .from("reconciliation_period_status" as any)
        .select("period_start, period_end")
        .eq("id", periodStatusId)
        .eq("company_id", companyId)
        .maybeSingle();
      const periodInfo = ps as any;
      if (!periodInfo) { setPersistingToDb(false); return; }

      const identityMatchedCount = compRows.filter(r => !!r.matchEmployeeId).length;
      const identityUnmatchedCount = compRows.length - identityMatchedCount;

      // Upsert batch
      const batchPayload = {
        company_id: companyId,
        payroll_period_start: periodInfo.period_start,
        payroll_period_end: periodInfo.period_end,
        status: identityUnmatchedCount === 0 ? "RECONCILED" : "NEEDS_REVIEW",
        truth_source_file_name: truthSource?.fileName || null,
        truth_source_uploaded_at: new Date().toISOString(),
        employees_truth_count: compRows.length,
        employees_system_count: reconData.length,
        matched_count: identityMatchedCount,
        unmatched_truth_count: identityUnmatchedCount,
        exact_match_count: statsData.matched,
        mismatch_count: statsData.mismatch,
        critical_mismatch_count: statsData.mismatch,
        total_variance_amount: Math.abs(statsData.variance),
        created_by: user.id,
        totals_truth_json: { total: statsData.totalTruth },
        totals_system_json: { total: statsData.totalRecon },
        totals_variance_json: { total: statsData.variance },
      };

      // Check for existing batch for this period
      const { data: existingBatch } = await supabase
        .from("reconciliation_batches")
        .select("id")
        .eq("company_id", companyId)
        .eq("payroll_period_start", periodInfo.period_start)
        .eq("payroll_period_end", periodInfo.period_end)
        .maybeSingle();

      let batchId: string;
      if (existingBatch) {
        batchId = (existingBatch as any).id;
        await supabase.from("reconciliation_batches").update(batchPayload as any).eq("id", batchId);
      } else {
        const { data: newBatch } = await supabase.from("reconciliation_batches").insert(batchPayload as any).select("id").single();
        batchId = (newBatch as any).id;
      }

      // Delete old rows for this batch
      await supabase.from("reconciliation_employee_rows").delete().eq("batch_id", batchId);

      // Insert employee rows in batches
      const reconByEmployeeId = new Map(reconData.map((r) => [r.employee_id, r]));
      const rows = compRows.map(c => {
        const fallbackNameParts = c.employee.trim().split(/\s+/);
        const firstName = (c.truth.firstName || fallbackNameParts[0] || "").trim();
        const lastName = (c.truth.lastName || fallbackNameParts.slice(1).join(" ") || "").trim();
        const matchedEmployeeId = c.matchEmployeeId || c.recon?.employee_id || null;
        const r = matchedEmployeeId ? (reconByEmployeeId.get(matchedEmployeeId) || c.recon) : c.recon;
        const normalizedEmployerId = (c.truth.employerIdentification || "").trim();
        const normalizedSsnEin = (c.truth.verificationSsnEin || "").replace(/[^0-9]/g, "");
        const rowStatus = !matchedEmployeeId
          ? "UNMATCHED"
          : c.status === "identity_only"
            ? "IDENTITY_MATCH_NO_SYSTEM_DATA"
          : c.status === "match"
            ? "EXACT_MATCH"
            : c.status === "close"
              ? "WITHIN_TOLERANCE"
              : "MISMATCH";

        return {
          batch_id: batchId,
          first_name: firstName,
          last_name: lastName,
          full_name_normalized: c.employee.toLowerCase(),
          employer_identification: normalizedEmployerId || null,
          verification_ssn_ein: (c.truth.verificationSsnEin || "").trim() || null,
          employer_identification_normalized: normalizedEmployerId ? normalizeName(normalizedEmployerId) : null,
          verification_ssn_ein_normalized: normalizedSsnEin || null,
          matched_system_employee_id: matchedEmployeeId,
          match_status: matchedEmployeeId ? "MATCHED" : "UNMATCHED",
          match_confidence: c.matchConfidence ?? (c.status === "match" ? 100 : c.status === "close" ? 80 : c.status === "mismatch" ? 50 : 0),
          matched_by: matchedEmployeeId ? (c.matchedBy || "truth_validation") : "truth_validation",
          truth_total_pay: c.truth.totalPay || 0,
          truth_pay_per_day: c.truth.payperDay || 0,
          truth_ryde: c.truth.ryde || 0,
          truth_tips: c.truth.tips || 0,
          truth_reimbursements: c.truth.reimbursements || 0,
          truth_total: c.truth.total,
          system_total_pay: r?.hourly_pay ?? null,
          system_pay_per_day: r ? (r.daily_pay + r.weekend_pay) : null,
          system_ryde: r?.ride_pay ?? null,
          system_tips: r?.manual_adj ?? 0,
          system_reimbursements: 0,
          system_total: r?.total_final ?? null,
          variance_total_pay: r ? round2((r.hourly_pay || 0) - (c.truth.totalPay || 0)) : null,
          variance_pay_per_day: r ? round2((r.daily_pay + r.weekend_pay) - (c.truth.payperDay || 0)) : null,
          variance_ryde: r ? round2((r.ride_pay || 0) - (c.truth.ryde || 0)) : null,
          variance_tips: r ? round2((r.manual_adj || 0) - (c.truth.tips || 0)) : null,
          variance_reimbursements: 0,
          variance_total: r ? round2(r.total_final - c.truth.total) : null,
          row_status: rowStatus,
          is_exact_match: c.status === "match",
          has_component_mismatch: !!matchedEmployeeId && (c.status === "mismatch" || c.status === "close"),
          has_critical_mismatch: !!matchedEmployeeId && c.status === "mismatch",
          anomaly_flags_json: r?.flags || [],
          shift_count: r?.schedule_count ?? 0,
          clock_count: r?.clock_count ?? 0,
          source_tags: r ? [r.authoritative_source || "unknown"] : [],
        };
      });

      for (let i = 0; i < rows.length; i += 50) {
        await supabase.from("reconciliation_employee_rows").insert(rows.slice(i, i + 50) as any[]);
      }

      setPersistedComparison(compRows);
      setDbPersisted(true);
    } catch (err) {
      console.error("Failed to persist reconciliation to DB:", err);
    }
    setPersistingToDb(false);
  }, [companyId, user?.id, periodStatusId, truthSource, reconData]);

  // ── CSV Export ──
  const exportDetailedCSV = useCallback((compRows: ComparisonRow[]) => {
    const headers = [
      "Empleado", "Estado", "Truth Pay", "Truth PPD", "Truth Ryde", "Truth Tips", "Truth Reimb",
      "Truth TravelH", "Truth Otros", "Truth Discount", "Truth TOTAL", "Truth Observaciones",
      "Recon TOTAL", "Varianza", "Fuente Autoritativa",
    ];
    const csvRows = compRows.map(c => {
      const r = c.recon;
      const hasEvidence = r && (r.schedule_count > 0 || r.clock_count > 0 || r.payroll_row_count > 0);
      return [
        c.employee,
        c.status === "match"
          ? (hasEvidence ? "EXACTO" : "TRUTH_VALIDADO")
          : c.status === "close"
            ? (hasEvidence ? "CERCANO" : "TRUTH_CERCANO")
            : c.status === "mismatch"
              ? "DIFERENTE"
              : c.status === "identity_only"
                ? "IDENTIDAD_OK_SIN_BASE"
                : "NO ENCONTRADO",
        c.truth.totalPay?.toFixed(2) || "0.00",
        c.truth.payperDay?.toFixed(2) || "0.00",
        c.truth.ryde?.toFixed(2) || "0.00",
        c.truth.tips?.toFixed(2) || "0.00",
        c.truth.reimbursements?.toFixed(2) || "0.00",
        c.truth.travelHours?.toFixed(2) || "0.00",
        c.truth.otros?.toFixed(2) || "0.00",
        c.truth.discount?.toFixed(2) || "0.00",
        c.truth.total.toFixed(2),
        `"${(c.truth.observaciones || "").replace(/"/g, '""')}"`,
        r?.total_final?.toFixed(2) || "",
        c.totalVariance.toFixed(2),
        r?.authoritative_source || "",
      ].join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation_detail_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);


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
        .select("employee_id, scheduled_hours")
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
        .select("employee_id, total_hours")
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
            unmapped_count: 0,
            unmapped_excluded_total: 0,
            total_final: 0,
            authoritative_total: 0,
            authoritative_source: null,
            primary_source: null,
            shift_calc_total: 0,
            shift_full_day_count: 0,
            shift_half_day_count: 0,
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
            clocked_hours: 0,
            scheduled_hours: 0,
            base_pay_hours: 0,
            hours_source_used: "none",
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
        const isMapped = category !== "other";

        row.payroll_row_count += 1;

        if (isMapped) {
          row.authoritative_total = round2(row.authoritative_total + value);
          row.authoritative_source = "payroll_rows_total";
          addCategoryAmount(row, category, value);
        } else {
          row.other_pay = round2(row.other_pay + value);
          row.unmapped_count += 1;
          row.unmapped_excluded_total = round2(row.unmapped_excluded_total + value);
        }

        row.ledger.push({
          id: `payroll-${pr.id}`,
          sourceType: "payroll_row",
          sourcePayrollRowId: pr.id,
          movementLabel: payTypeLabel(pr.pay_type),
          concept: `Payroll row: ${payTypeLabel(pr.pay_type)}`,
          qty,
          rate,
          value,
          included: isMapped,
          compositionRole: isMapped ? "authoritative" : "informational_only",
          reason: isMapped
            ? "Included in clean authoritative payroll total for this period."
            : "Excluded from clean historical total: unmapped/unclassified payroll row.",
          category,
        });
      }

      for (const bp of basePay) {
        const row = getOrCreate(bp.employee_id);
        const value = round2(Number(bp.base_total_pay) || 0);
        const hours = Number(bp.total_work_hours) || 0;
        row.base_pay_hours = round2(hours);

        // ⚠️ HARD PAYROLL RULE: In truth-based closure mode, auto-calculated
        // period_base_pay (import_id IS NULL) must NEVER be authoritative.
        // It may come from a bogus time_entry (e.g. 23.5h phantom clock)
        // while the truth file says 5.47h / $82. Truth always wins.
        const isAutoCalculated = !bp.import_id;
        const isTruthMode = truthAuthoritativeMode;
        const forceInformational = isTruthMode && isAutoCalculated;

        row.base_pay = value;

        if (row.authoritative_total <= 0 && !forceInformational) {
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
            movementLabel: isAutoCalculated ? "Base Pay (auto-calculado)" : "Base Pay",
            concept: isAutoCalculated
              ? "Base Pay auto-calculado (NO usar para cierre — puede derivar de fichajes erróneos)"
              : "Base Pay (period_base_pay)",
            qty: hours,
            rate: hours > 0 ? round2(value / hours) : value,
            value,
            included: false,
            compositionRole: forceInformational ? "inferred" : "informational_only",
            reason: forceInformational
              ? `Auto-calculated from clock data (${hours}h × $${hours > 0 ? round2(value / hours) : '?'}/hr). In truth-based mode, the truth file amount is authoritative — this is diagnostic only.`
              : "Informational only: payroll rows are authoritative for this employee/period.",
            category: "hourly",
          });
          if (forceInformational) row.flags.push("auto_base_pay_suppressed_by_truth");
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

          if (category === "other") {
            include = false;
            compositionRole = "informational_only";
            reason = "Excluded from clean historical total: unmapped/unclassified movement.";
            row.other_pay = round2(row.other_pay + value);
            row.unmapped_count += 1;
            row.unmapped_excluded_total = round2(row.unmapped_excluded_total + value);
          } else if (!hasAuthoritative) {
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
      const scheduleHoursMap = new Map<string, number>();
      for (const s of schedules) {
        if (!s.employee_id) continue;
        scheduleCounts.set(s.employee_id, (scheduleCounts.get(s.employee_id) || 0) + 1);
        scheduleHoursMap.set(s.employee_id, (scheduleHoursMap.get(s.employee_id) || 0) + (Number(s.scheduled_hours) || 0));
      }
      scheduleCounts.forEach((count, empId) => {
        const row = getOrCreate(empId);
        row.schedule_count = count;
        row.scheduled_hours = round2(scheduleHoursMap.get(empId) || 0);
      });

      const clockCounts = new Map<string, number>();
      const clockHoursMap = new Map<string, number>();
      for (const c of clocks) {
        if (!c.employee_id) continue;
        clockCounts.set(c.employee_id, (clockCounts.get(c.employee_id) || 0) + 1);
        clockHoursMap.set(c.employee_id, (clockHoursMap.get(c.employee_id) || 0) + (Number(c.total_hours) || 0));
      }
      clockCounts.forEach((count, empId) => {
        const row = getOrCreate(empId);
        row.clock_count = count;
        row.clocked_hours = round2(clockHoursMap.get(empId) || 0);
      });

      // === SHIFT-CALC PRIORITY OVERRIDE ===
      // If finalRecords exist with shift-calc data, override authoritative source
      const shiftCalcMap = new Map<string, { total: number; fullDays: number; halfDays: number; rate: number }>();
      if (externalFinalRecords && externalFinalRecords.length > 0) {
        for (const fr of externalFinalRecords) {
          const empId = String(fr.employee_id || "");
          const scTotal = Number(fr.shift_calculated_total) || 0;
          const fdCount = Number(fr.shift_full_day_count) || 0;
          const hdCount = Number(fr.shift_half_day_count) || 0;
          if (empId && (fdCount > 0 || hdCount > 0)) {
            shiftCalcMap.set(empId, {
              total: scTotal,
              fullDays: fdCount,
              halfDays: hdCount,
              rate: Number(fr.shift_daily_rate_used) || 0,
            });
          }
        }
      }

      breakdowns.forEach(row => {
        const sc = shiftCalcMap.get(row.employee_id);

        if (sc && (sc.fullDays > 0 || sc.halfDays > 0)) {
          // Shift-calc is primary — demote all payroll entries to informational_only
          row.primary_source = "shift_calc";
          row.shift_calc_total = sc.total;
          row.shift_full_day_count = sc.fullDays;
          row.shift_half_day_count = sc.halfDays;

          // Demote existing payroll-based authoritative entries
          const previousAuthTotal = row.authoritative_total;
          row.ledger.forEach(entry => {
            if (entry.compositionRole === "authoritative" && entry.sourceType !== "movement") {
              entry.compositionRole = "informational_only";
              entry.included = false;
              entry.reason = "Demoted: shift-calc is the primary source for this employee.";
            }
          });

          // Add shift-calc as the authoritative entry
          row.authoritative_total = sc.total;
          row.authoritative_source = "shift_calc";
          row.daily_pay = sc.total;
          row.hourly_pay = 0; // hourly is not authoritative in shift-calc mode

          row.ledger.push({
            id: `shift-calc-${row.employee_id}`,
            sourceType: "period_base_pay",
            sourcePayrollRowId: null,
            movementLabel: "Shift-Calc (Turnos)",
            concept: `${sc.fullDays} full days${sc.halfDays > 0 ? ` + ${sc.halfDays} half days` : ""} × $${sc.rate}`,
            qty: sc.fullDays + sc.halfDays * 0.5,
            rate: sc.rate,
            value: sc.total,
            included: true,
            compositionRole: "authoritative",
            reason: "Primary source: calculated from scheduled shifts (full_day/half_day × rate).",
            category: "daily",
          });

          // Add payroll reference as informational
          if (previousAuthTotal > 0 && previousAuthTotal !== sc.total) {
            row.flags.push(`shift_calc_override: payroll ${fmt(previousAuthTotal)} → shift-calc ${fmt(sc.total)}`);
          }
        } else {
          row.primary_source = "payroll";
        }

        // Recalculate totals with correct source
        const includedTotal = row.ledger
          .filter(l => l.included && l.compositionRole !== "informational_only")
          .reduce((s, l) => s + l.value, 0);
        row.total_final = round2(includedTotal > 0 ? includedTotal : (row.authoritative_total + row.inferred_total));
        row.naive_total = round2(row.authoritative_total + row.movement_unique_total + (row.authoritative_source === "payroll_rows_total" ? row.base_pay : 0));

        // Determine hours source used for closure
        if (row.clocked_hours > 0) row.hours_source_used = "clocked";
        else if (row.base_pay_hours > 0) row.hours_source_used = "clocked"; // base_pay derives from clocks
        else if (row.scheduled_hours > 0) row.hours_source_used = "scheduled";
        else row.hours_source_used = "none";

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

  const computedComparison = useMemo<ComparisonRow[]>(() => {
    if (truthData.length === 0) return [];

    const reconByEmployeeId = new Map(reconData.map((r) => [r.employee_id, r]));

    return truthData
      .map((t, idx) => {
        const match = truthMatches[idx];
        const reconByIdentity = match?.employeeId ? reconByEmployeeId.get(match.employeeId) || null : null;
        const reconByName = reconData.find(r => normalizeName(r.employee_name) === normalizeName(t.employee));
        const recon = reconByIdentity || reconByName || null;

        if (!recon) {
          if (!match?.employeeId) {
            const closureAmount = truthAuthoritativeMode ? (t.total || 0) : (t.total || 0);
            return {
              employee: t.employee,
              truth: t,
              recon: null,
              matchEmployeeId: null,
              matchedBy: match?.matchedBy || "none",
              matchConfidence: match?.confidence || 0,
              totalVariance: t.total,
              status: "missing" as const,
              reviewGroup: "missing_system_data" as const,
              closureAmount,
              systemInferredOnly: false,
              compositionError: false,
              compositionReason: null,
            };
          }

          const closureAmount = truthAuthoritativeMode ? (t.total || 0) : (t.total || 0);
          return {
            employee: t.employee,
            truth: t,
            recon: null,
            matchEmployeeId: match.employeeId,
            matchedBy: match.matchedBy,
            matchConfidence: match.confidence,
            totalVariance: -Math.abs(t.total || 0),
            status: "identity_only" as const,
            reviewGroup: "missing_system_data" as const,
            closureAmount,
            systemInferredOnly: false,
            compositionError: false,
            compositionReason: "Empleado mapeado, pero sin base operativa para este periodo (period_base_pay/movements).",
          };
        }

        const totalVariance = round2(recon.total_final - t.total);
        const absTotal = Math.abs(totalVariance);
        const diagnosticStatus = (absTotal < 1 ? "match" : absTotal < 50 ? "close" : "mismatch") as ComparisonRow["status"];

        const compositionError =
          recon.naive_total - t.total > 50 &&
          recon.overlap_excluded_total > 0 &&
          recon.authoritative_total > 0;

        const compositionReason = compositionError
          ? `Naive additive total ${fmt(recon.naive_total)} would overstate truth by ${fmtVar(round2(recon.naive_total - t.total))}; overlap guardrail excluded ${fmt(recon.overlap_excluded_total)}.`
          : null;
        const systemInferredOnly = isSystemInferredOnly(recon);
        const closureAmount = truthAuthoritativeMode ? (t.total || 0) : (recon.total_final || 0);
        const status = deriveOperationalStatus(diagnosticStatus, t.total || 0, closureAmount, truthAuthoritativeMode);
        const reviewGroup = deriveReviewGroup(status, recon, t.total || 0, totalVariance, truthAuthoritativeMode, closureAmount);

        return {
          employee: t.employee,
          truth: t,
          recon,
          matchEmployeeId: match?.employeeId || recon.employee_id,
          matchedBy: match?.matchedBy || "name_exact",
          matchConfidence: match?.confidence || 90,
          totalVariance,
          status,
          reviewGroup,
          closureAmount,
          systemInferredOnly,
          compositionError,
          compositionReason,
        };
      })
      .sort((a, b) => {
        if (a.matchEmployeeId && !b.matchEmployeeId) return -1;
        if (!a.matchEmployeeId && b.matchEmployeeId) return 1;
        if (a.recon && !b.recon) return -1;
        if (!a.recon && b.recon) return 1;
        if (b.totalVariance !== a.totalVariance) return b.totalVariance - a.totalVariance;
        return Math.abs(b.totalVariance) - Math.abs(a.totalVariance);
      });
  }, [truthData, reconData, truthMatches, truthAuthoritativeMode]);

  const comparison = useMemo<ComparisonRow[]>(() => persistedComparison ?? computedComparison, [persistedComparison, computedComparison]);

  const stats = useMemo(() => {
    const hasEvidence = (c: ComparisonRow) => c.recon && (c.recon.schedule_count > 0 || c.recon.clock_count > 0 || c.recon.payroll_row_count > 0);
    const matchedWithEvidence = comparison.filter(c => c.status === "match" && hasEvidence(c)).length;
    const truthValidated = comparison.filter(c => (c.status === "match" || c.status === "close") && !hasEvidence(c)).length;
    const matched = matchedWithEvidence;
    const close = comparison.filter(c => c.status === "close" && hasEvidence(c)).length;
    const mismatch = comparison.filter(c => c.status === "mismatch").length;
    const identityOnly = comparison.filter(c => c.status === "identity_only").length;
    const missing = comparison.filter(c => c.status === "missing").length;
    const truthOverrideCandidates = comparison.filter(c => c.reviewGroup === "truth_override_candidate").length;
    const payModelMismatches = comparison.filter(c => c.reviewGroup === "pay_model_mismatch").length;
    const trueBusinessMismatches = comparison.filter(c => c.reviewGroup === "true_business_mismatch").length;
    const missingSystemData = comparison.filter(c => c.reviewGroup === "missing_system_data").length;
    const compositionErrors = comparison.filter(c => c.compositionError).length;
    const totalTruth = comparison.reduce((sum, row) => sum + (row.truth.total || 0), 0);
    const totalRecon = comparison.reduce((sum, row) => sum + (row.recon?.total_final || 0), 0);
    const totalClosure = comparison.reduce((sum, row) => sum + (row.closureAmount || 0), 0);
    const totalSuppressed = comparison.reduce((sum, row) => sum + (row.recon?.total_suppressed || 0), 0);
    const totalOther = reconData.reduce((sum, row) => sum + (row.other_pay || 0), 0);
    return {
      matched,
      close,
      truthValidated,
      mismatch,
      identityOnly,
      missing,
      truthOverrideCandidates,
      payModelMismatches,
      trueBusinessMismatches,
      missingSystemData,
      compositionErrors,
      totalTruth,
      totalRecon,
      totalClosure,
      variance: totalRecon - totalTruth,
      closureVariance: totalClosure - totalTruth,
      totalSuppressed,
      totalOther,
    };
  }, [comparison, reconData]);

  const [statusFilter, setStatusFilter] = useState<ComparisonRow["status"] | "all">("all");
  const [reviewGroupFilter, setReviewGroupFilter] = useState<ReviewGroup | "all">("all");
  const [sortByVariance, setSortByVariance] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredComparison = useMemo(() => {
    let rows = comparison;
    if (statusFilter !== "all") {
      rows = rows.filter(c => c.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(c => c.employee.toLowerCase().includes(q));
    }
    if (reviewGroupFilter !== "all") {
      rows = rows.filter(c => c.reviewGroup === reviewGroupFilter);
    }
    if (sortByVariance) {
      rows = [...rows].sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance));
    }
    return rows;
  }, [comparison, statusFilter, reviewGroupFilter, sortByVariance, searchTerm]);

  const [showRawRecords, setShowRawRecords] = useState(false);

  const statusBadge = (row: ComparisonRow) => {
    const hasEvidence = row.recon && (row.recon.schedule_count > 0 || row.recon.clock_count > 0 || row.recon.payroll_row_count > 0);
    const closureAlignedToTruth = truthAuthoritativeMode && Math.abs(round2(row.closureAmount - (row.truth.total || 0))) < 1;

    if (row.reviewGroup === "truth_override_candidate") {
      return <Badge variant="info" className="text-xs">↺ Override por Truth</Badge>;
    }
    if (row.reviewGroup === "pay_model_mismatch") {
      return <Badge variant="warning" className="text-xs">↕ Pay-model mismatch</Badge>;
    }

    if (closureAlignedToTruth && row.status !== "identity_only" && row.status !== "missing") {
      return hasEvidence
        ? <Badge variant="secondary" className="text-xs">✓ Cerrado por Truth</Badge>
        : <Badge variant="secondary" className="text-xs">✓ Truth-validado</Badge>;
    }

    // Evidence-aware: don't label "Exacto" if no linked operational evidence
    switch (row.status) {
      case "match":
        return hasEvidence
          ? <Badge variant="default" className="text-xs">✓ Exacto</Badge>
          : <Badge variant="secondary" className="text-xs">✓ Truth-validado</Badge>;
      case "close":
        return hasEvidence
          ? <Badge variant="secondary" className="text-xs">≈ Cercano</Badge>
          : <Badge variant="secondary" className="text-xs">≈ Truth-cercano</Badge>;
      case "mismatch":
        return <Badge variant="destructive" className="text-xs">✗ Diferente</Badge>;
      case "identity_only":
        return <Badge variant="secondary" className="text-xs">◎ Identidad OK / sin base</Badge>;
      case "missing":
        return <Badge variant="outline" className="text-xs">? No encontrado</Badge>;
    }
  };

  const reviewGroupBadge = (group: ReviewGroup) => {
    switch (group) {
      case "truth_override_candidate":
        return <Badge variant="info" className="text-xs">truth-authoritative override candidate</Badge>;
      case "system_inferred_exceeds_truth":
        return <Badge variant="warning" className="text-xs">system inferred exceeds paid truth</Badge>;
      case "pay_model_mismatch":
        return <Badge variant="warning" className="text-xs">pay-model mismatch</Badge>;
      case "missing_system_data":
        return <Badge variant="secondary" className="text-xs">missing system-side data</Badge>;
      case "true_business_mismatch":
        return <Badge variant="destructive" className="text-xs">true business mismatch</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">normal review</Badge>;
    }
  };

  const explainVariance = (c: ComparisonRow): string => {
    if (!c.recon) {
      const closureAlignedToTruth = truthAuthoritativeMode && Math.abs(round2(c.closureAmount - (c.truth.total || 0))) < 1 && (c.truth.total || 0) > 0;
      if (closureAlignedToTruth) {
        return c.matchEmployeeId
          ? "Identidad encontrada. Sin datos operativos del sistema para este periodo, pero el cierre se basa en el Truth pagado (autoritativo). El monto de cierre es correcto."
          : "Identidad no encontrada en el sistema, pero en modo Truth-autoritativo el cierre se basa directamente en el archivo de nómina pagada. Monto de cierre correcto.";
      }
      return c.matchEmployeeId
        ? "Identidad del empleado encontrada, pero no hay datos operativos del periodo para comparar."
        : "Empleado no encontrado por identidad en la validación.";
    }

    const parts: string[] = [];
    const r = c.recon;
    const t = c.truth;

    parts.push(`Truth pagado (autoritativo): ${fmt(t.total)}.`);
    parts.push(`Sistema interno ${c.systemInferredOnly ? "(inferido/sugerido)" : "(operativo)"}: ${fmt(r.total_final)}.`);
    parts.push(`Cierre final: ${fmt(c.closureAmount)}.`);

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

    if (c.reviewGroup === "truth_override_candidate") {
      parts.push("Pattern detected: system inferred amount exceeds paid truth. This row is a truth-authoritative override candidate.");
    }
    if (c.reviewGroup === "pay_model_mismatch") {
      parts.push("Pattern detected: pay-model mismatch between internal weekly/base model and paid truth evidence.");
    }

    if (c.compositionReason) parts.push(c.compositionReason);

    return parts.join(" ");
  };

  // Data source transparency
  const dataSourceInfo = useMemo(() => {
    const systemHasData = reconData.length > 0;
    const truthIsLoaded = truthLoaded && truthData.length > 0;
    
    if (truthIsLoaded && systemHasData) {
      const sourceLabel = truthSource?.type === "persisted"
        ? "restaurado automáticamente"
        : truthSource?.type === "manual"
        ? "subido manualmente"
        : "pre-cargado";
      return {
        label: `Comparando: Truth File (${sourceLabel}) vs. Datos del Sistema`,
        variant: "default" as const,
        icon: "✅",
        detail: `Truth: ${truthData.length} empleados desde ${truthSource?.fileName || "archivo"} | Sistema: ${reconData.length} empleados desde period_base_pay + movements`,
      };
    }
    if (systemHasData && !truthIsLoaded) {
      return {
        label: "Solo datos del sistema — No se ha cargado archivo de nómina pagada",
        variant: "secondary" as const,
        icon: "⚠️",
        detail: `${reconData.length} empleados cargados automáticamente desde: period_base_pay, movements, normalized_payroll_rows. Sin archivo Truth para comparar.`,
      };
    }
    return {
      label: "No hay datos cargados",
      variant: "outline" as const,
      icon: "📭",
      detail: "Selecciona un periodo y carga un archivo Truth para iniciar la validación.",
    };
  }, [reconData, truthData, truthLoaded, truthSource]);

  return (
    <div className="space-y-4">
      {/* ── Data Source Transparency Banner ── */}
      <Alert className={`border-l-4 ${truthLoaded ? 'border-l-primary' : reconData.length > 0 ? 'border-l-accent' : 'border-l-muted-foreground'}`}>
        <AlertDescription className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
            <span>{dataSourceInfo.icon}</span>
            <span>{dataSourceInfo.label}</span>
            {truthLoaded && persisted && (
              <Badge variant="default" className="text-[10px] gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Archivo manual persistido
              </Badge>
            )}
            {truthLoaded && !persisted && (
              <Badge variant="outline" className="text-[10px] gap-1 border-warning text-warning">
                <AlertTriangle className="h-2.5 w-2.5" />
                Archivo manual no persistido
              </Badge>
            )}
            {truthLoaded && truthSource?.type === "persisted" && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Upload className="h-2.5 w-2.5" />
                Restaurado automáticamente
              </Badge>
            )}
            {!truthLoaded && reconData.length > 0 && <Badge variant="secondary" className="text-[10px]">Datos previos del sistema</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{dataSourceInfo.detail}</p>
          {truthLoaded && !persisted && (
            <p className="text-xs text-warning font-medium mt-1">
              ⚠️ Debes volver a cargar el archivo si recargas la página
            </p>
          )}
        </AlertDescription>
      </Alert>

      {/* ── Truth Source Controls ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Validación vs. Nómina Pagada
            </CardTitle>
            {truthLoaded && truthSource && (
              <div className="flex items-center gap-2">
                <Badge variant={truthSource.type === "manual" ? "default" : truthSource.type === "persisted" ? "secondary" : "secondary"} className="text-[10px]">
                  {truthSource.type === "manual" ? "📁 Archivo manual" : truthSource.type === "persisted" ? "💾 Restaurado" : "📦 Pre-cargado"}
                </Badge>
                {persisted && <Badge variant="outline" className="text-[10px] text-primary border-primary/30">✓ Persistido</Badge>}
                <span className="text-[10px] text-muted-foreground">{truthSource.loadedAt}</span>
              </div>
            )}
          </div>
          {truthLoaded && truthSource && (
            <p className="text-xs text-muted-foreground mt-1">
               Archivo: <span className="font-medium text-foreground">{truthSource.fileName}</span>
              {" · "}{comparison.length} empleados · Periodo vinculado: {periodStatusId ? "Sí" : "No"}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {/* ── Upload Actions — always visible ── */}
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg border border-border bg-muted/20">
            <Button variant="outline" size="sm" onClick={loadTruthFile} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
              {truthLoaded ? "Recargar Truth pre-cargado" : "Usar Payroll Truth pre-cargado"}
            </Button>

            <label className="inline-flex">
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleManualUpload} disabled={loading} />
              <Button variant="default" size="sm" asChild disabled={loading}>
                <span className="cursor-pointer">
                  {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                  {truthLoaded ? "Reemplazar Truth File" : "Subir Payroll Truth desde mi archivo"}
                </span>
              </Button>
            </label>

            {truthLoaded && (
              <Button variant="ghost" size="sm" onClick={clearTruth} className="text-destructive hover:text-destructive">
                Quitar Truth cargado
              </Button>
            )}

            {!truthLoaded && reconData.length > 0 && (
              <span className="text-xs text-muted-foreground ml-2">
                ⚠️ {reconData.length} empleados con datos del sistema — sin archivo Truth para comparar
              </span>
            )}
          </div>

          {!truthLoaded ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Selecciona una opción arriba para cargar el archivo de nómina pagada.</p>
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

              {/* ── Financial KPIs (hero row) ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <KpiCard label="Total Truth" value={fmt(stats.totalTruth)} icon={<DollarSign className="h-4 w-4" />} size="lg" mono />
                <KpiCard label="Sistema interno" value={fmt(stats.totalRecon)} icon={<DollarSign className="h-4 w-4" />} size="lg" mono subtitle={truthAuthoritativeMode ? "Inferido / diagnóstico" : "Operativo"} />
                <KpiCard label="Cierre final" value={fmt(stats.totalClosure)} icon={<CheckCircle2 className="h-4 w-4" />} accent="primary" size="lg" mono subtitle={truthAuthoritativeMode ? "Autoridad: Truth pagado" : "Autoridad: Sistema"} />
                <KpiCard
                  label="Δ Sistema vs Truth"
                  value={fmtVar(stats.variance)}
                  icon={<DollarSign className="h-4 w-4" />}
                  accent={Math.abs(stats.variance) > 100 ? "deduction" : "primary"}
                  size="lg"
                  mono
                />
                <KpiCard label="Otros / Sin clasificar" value={fmt(stats.totalOther)} icon={<AlertTriangle className="h-4 w-4" />} accent={stats.totalOther > 0 ? "deduction" : "muted"} size="lg" mono />
              </div>

              {/* ── Count KPIs (secondary row) ── */}
              <div className="grid grid-cols-3 sm:grid-cols-8 gap-2">
                <KpiCard label="Empleados" value={comparison.length} icon={<DollarSign className="h-3.5 w-3.5" />} size="sm" />
                <KpiCard label="Exactos" value={stats.matched} icon={<CheckCircle2 className="h-3.5 w-3.5" />} accent="primary" size="sm" />
                <KpiCard label="Truth-validado" value={stats.truthValidated} icon={<Database className="h-3.5 w-3.5" />} accent="muted" size="sm" />
                <KpiCard label="Cercanos" value={stats.close} icon={<AlertTriangle className="h-3.5 w-3.5" />} accent="warning" size="sm" />
                <KpiCard label="Diferentes" value={stats.mismatch} icon={<AlertTriangle className="h-3.5 w-3.5" />} accent="deduction" size="sm" />
                <KpiCard label="ID sin base" value={stats.identityOnly} icon={<AlertTriangle className="h-3.5 w-3.5" />} accent="warning" size="sm" />
                <KpiCard label="No encontrados" value={stats.missing} accent="muted" size="sm" />
                <KpiCard label="Dups Suprimidos" value={fmt(stats.totalSuppressed)} accent="deduction" size="sm" mono />
              </div>

              {(stats.truthOverrideCandidates > 0 || stats.payModelMismatches > 0) && (
                <Alert className="border-primary/30 bg-primary/5">
                  <AlertDescription className="text-xs text-foreground">
                    Patrones agrupados: <strong>{stats.truthOverrideCandidates}</strong> truth-authoritative override candidate(s),{" "}
                    <strong>{stats.payModelMismatches}</strong> pay-model mismatch.
                  </AlertDescription>
                </Alert>
              )}

              {/* Approval readiness banner */}
              {(truthAuthoritativeMode ? stats.trueBusinessMismatches : stats.mismatch) === 0 && stats.identityOnly === 0 && stats.missing === 0 && comparison.length > 0 && (
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-primary">
                      ✅ Periodo listo para aprobar
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stats.matched} de {comparison.length} empleados reconciliados exactamente
                      {stats.close > 0 && <> · {stats.close} dentro de tolerancia</>}
                      {Math.abs(stats.variance) > 0 && Math.abs(stats.variance) < 5 && (
                        <> · Varianza neta de {fmtVar(stats.variance)} = redondeo</>
                      )}
                      {" · "}Cierre vía Truth Validation
                    </p>
                  </div>
                  <Badge variant="default" className="text-[10px] shrink-0">📋 Truth-based closure</Badge>
                </div>
              )}

              {/* Rounding tolerance note */}
              {Math.abs(stats.variance) > 0 && Math.abs(stats.variance) < 5 && comparison.length > 0 && stats.mismatch === 0 && (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>
                    La varianza neta de <span className="font-mono font-medium text-foreground">{fmtVar(stats.variance)}</span> se
                    distribuye como diferencias de redondeo (&lt;$1 por empleado). No requiere acción adicional.
                  </span>
                </div>
              )}

              {/* Safety threshold warning for "Otros" */}
              {stats.totalOther > 0 && stats.totalRecon > 0 && (stats.totalOther / stats.totalRecon) > 0.20 && (
                <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm">
                  <p className="font-semibold text-destructive">⚠️ ALERTA CRÍTICA: &quot;Otros / Sin clasificar&quot; representa {((stats.totalOther / stats.totalRecon) * 100).toFixed(1)}% del total reconciliado</p>
                  <p className="text-muted-foreground mt-1">Esto indica que hay registros de nómina que no están siendo clasificados correctamente. Revisa los registros crudos para identificar los conceptos no mapeados.</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowRawRecords(!showRawRecords)}>
                  {showRawRecords ? "Ocultar" : "Ver"} registros crudos ({reconData.reduce((s, r) => s + r.ledger.length, 0)})
                </Button>

                <Button variant="outline" size="sm" onClick={() => exportDetailedCSV(comparison)}>
                  <Download className="h-3 w-3 mr-1" />
                  Descargar detalle CSV
                </Button>

                <Button
                  variant={dbPersisted ? "secondary" : "default"}
                  size="sm"
                  onClick={() => persistResultsToDb(comparison, stats)}
                  disabled={persistingToDb}
                >
                  {persistingToDb ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Database className="h-3 w-3 mr-1" />}
                  {dbPersisted ? "✓ Guardado en BD" : "Guardar en BD"}
                </Button>

                {dbPersisted && (
                  <Badge variant="default" className="text-[10px] gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Resultados persistidos
                  </Badge>
                )}
              </div>

              {/* ── Truth-to-Publish handoff ── */}
              {dbPersisted && onGenerateFinalRecords && (
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
                  <Database className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Materializar registros para publicación</p>
                    <p className="text-xs text-muted-foreground">
                      {(externalFinalRecords?.length ?? 0) > 0
                        ? `${externalFinalRecords!.length} registros ya generados — puedes regenerar si actualizaste la reconciliación.`
                        : "Genera registros finales desde los resultados de Truth Validation para habilitar la aprobación y publicación."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={generatingFinal}
                    onClick={async () => {
                      setGeneratingFinal(true);
                      try { await onGenerateFinalRecords(); } finally { setGeneratingFinal(false); }
                    }}
                  >
                    {generatingFinal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                    Generar Registros desde Truth
                  </Button>
                </div>
              )}

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

              {/* ── Filters & Sort Toolbar ── */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <DataTableToolbar
                  search={searchTerm}
                  onSearchChange={setSearchTerm}
                  searchPlaceholder="Buscar empleado..."
                  className="flex-1 py-0"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {([
                      { key: 'all' as const, label: 'Todos', count: comparison.length },
                      { key: 'match' as const, label: 'Exacto', count: stats.matched },
                      { key: 'close' as const, label: 'Cercano', count: stats.close },
                      { key: 'mismatch' as const, label: 'Diferente', count: stats.mismatch },
                      { key: 'identity_only' as const, label: 'ID sin base', count: stats.identityOnly },
                      { key: 'missing' as const, label: 'No encontrado', count: stats.missing },
                    ]).map(f => (
                      <Button
                        key={f.key}
                        size="sm"
                        variant={statusFilter === f.key ? 'default' : 'outline'}
                        className="h-7 text-xs gap-1 px-2"
                        onClick={() => setStatusFilter(f.key)}
                      >
                        {f.label}
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5">{f.count}</Badge>
                      </Button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {([
                      { key: "all" as const, label: "Todos patrones", count: comparison.length },
                      { key: "truth_override_candidate" as const, label: "Override Truth", count: stats.truthOverrideCandidates },
                      { key: "pay_model_mismatch" as const, label: "Pay-model", count: stats.payModelMismatches },
                      { key: "missing_system_data" as const, label: "Sin data", count: stats.missingSystemData },
                      { key: "true_business_mismatch" as const, label: "Mismatch real", count: stats.trueBusinessMismatches },
                    ]).map(g => (
                      <Button
                        key={g.key}
                        size="sm"
                        variant={reviewGroupFilter === g.key ? "default" : "outline"}
                        className="h-7 text-xs gap-1 px-2"
                        onClick={() => setReviewGroupFilter(g.key)}
                      >
                        {g.label}
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5">{g.count}</Badge>
                      </Button>
                    ))}
                  </div>
                </DataTableToolbar>
                <Button
                  size="sm"
                  variant={sortByVariance ? 'default' : 'outline'}
                  className="h-7 text-xs gap-1 shrink-0"
                  onClick={() => setSortByVariance(!sortByVariance)}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {sortByVariance ? 'Por |varianza|' : 'Ordenar por varianza'}
                </Button>
              </div>

              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                     <TableRow>
                       <TableHead className="w-8"></TableHead>
                       <TableHead>Empleado</TableHead>
                       <TableHead>Estado</TableHead>
                       <TableHead>Grupo</TableHead>
                       <TableHead className="text-right">T.Hrs</TableHead>
                       <TableHead className="text-right">Clock.Hrs</TableHead>
                       <TableHead className="text-right">Sched.Hrs</TableHead>
                       <TableHead className="text-center">Hrs Fuente</TableHead>
                       <TableHead className="text-right">T.Pay</TableHead>
                       <TableHead className="text-right">T.PPD</TableHead>
                       <TableHead className="text-right">T.Ryde</TableHead>
                       <TableHead className="text-right">T.Tips</TableHead>
                       <TableHead className="text-right">T.Reimb</TableHead>
                       <TableHead className="text-right">T.Otros</TableHead>
                       <TableHead className="text-right">T.Disc</TableHead>
                       <TableHead className="text-right font-bold">T.TOTAL</TableHead>
                       <TableHead className="text-right font-bold">Sistema (interno)</TableHead>
                       <TableHead className="text-right font-bold">Cierre final</TableHead>
                       <TableHead className="text-right font-bold">Δ Sys-Truth</TableHead>
                       <TableHead className="text-center">Obs</TableHead>
                     </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredComparison.map(c => {
                      const isExpanded = expandedRows.has(c.employee);
                      const r = c.recon;
                      const dupsCount = r ? r.ledger.filter(l => l.compositionRole === "excluded_from_total").length : 0;

                      return (
                        <>
                          <TableRow
                            key={c.employee}
                            className={`cursor-pointer ${
                              c.reviewGroup === "truth_override_candidate" ? "bg-primary/5" :
                              c.reviewGroup === "pay_model_mismatch" ? "bg-warning/10" :
                              c.status === "mismatch" ? "bg-destructive/5" :
                              c.status === "identity_only" ? "bg-warning/5" :
                              c.status === "missing" ? "bg-warning/10" :
                              c.status === "match" ? "bg-primary/5" : ""
                            }`}
                            onClick={() => toggleRow(c.employee)}
                          >
                            <TableCell className="w-8 px-2">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{c.employee}</TableCell>
                            <TableCell>{statusBadge(c)}</TableCell>
                            <TableCell>{reviewGroupBadge(c.reviewGroup)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.truth.shiftHours ? c.truth.shiftHours.toFixed(1) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{r?.clocked_hours ? r.clocked_hours.toFixed(1) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">{r?.scheduled_hours ? r.scheduled_hours.toFixed(1) : "—"}</TableCell>
                            <TableCell className="text-center">
                              {(() => {
                                const src = truthAuthoritativeMode ? "truth" : (r?.hours_source_used || "none");
                                const labels: Record<string, { text: string; cls: string }> = {
                                  truth: { text: "Truth", cls: "text-primary font-medium" },
                                  clocked: { text: "Reloj", cls: "text-foreground" },
                                  scheduled: { text: "Prog.", cls: "text-muted-foreground italic" },
                                  none: { text: "—", cls: "text-muted-foreground" },
                                };
                                const l = labels[src] || labels.none;
                                return <span className={`text-xs ${l.cls}`}>{l.text}</span>;
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.truth.totalPay ? fmt(c.truth.totalPay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.truth.payperDay ? fmt(c.truth.payperDay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.truth.ryde ? fmt(c.truth.ryde) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.truth.tips ? fmt(c.truth.tips) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.truth.reimbursements ? fmt(c.truth.reimbursements) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.truth.otros ? fmt(c.truth.otros) : "—"}</TableCell>
                            <TableCell className={`text-right font-mono text-xs ${c.truth.discount < 0 ? "text-destructive font-medium" : ""}`}>{c.truth.discount ? fmt(c.truth.discount) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold">{fmt(c.truth.total)}</TableCell>
                            <TableCell className={`text-right font-mono text-sm font-medium ${c.systemInferredOnly ? "text-warning" : ""}`}>{r ? fmt(r.total_final) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold text-primary">{fmt(c.closureAmount)}</TableCell>
                            <TableCell className={`text-right font-mono text-sm font-medium ${
                              Math.abs(c.totalVariance) > 50 ? "text-destructive" :
                              Math.abs(c.totalVariance) < 1 ? "text-primary" : "text-warning"
                            }`}>
                              {r ? fmtVar(c.totalVariance) : "N/A"}
                            </TableCell>
                            <TableCell className="text-center text-xs" title={c.truth.observaciones || ""}>
                              {c.truth.observaciones ? "📝" : ""}
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${c.employee}-detail`} className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={20} className="p-3">
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
                                      <p className="font-medium text-foreground mb-1">Truth breakdown (componentes del archivo pagado):</p>
                                      <div className="space-y-0.5 text-muted-foreground font-mono">
                                        <p>Total Pay: {fmt(c.truth.totalPay)}</p>
                                        <p>PayperDay: {fmt(c.truth.payperDay)}</p>
                                        <p>Ryde: {fmt(c.truth.ryde)}</p>
                                        {c.truth.tips !== 0 && <p>Tips: {fmt(c.truth.tips)}</p>}
                                        {c.truth.reimbursements !== 0 && <p>Reimbursements: {fmt(c.truth.reimbursements)}</p>}
                                        {c.truth.travelHours !== 0 && <p>Travel Hours: {fmt(c.truth.travelHours)}</p>}
                                        {c.truth.otros !== 0 && <p>Otros: {fmt(c.truth.otros)}</p>}
                                        {c.truth.discount !== 0 && <p className="text-destructive">Discount: {fmt(c.truth.discount)}</p>}
                                        <p className="font-medium text-foreground">TOTAL: {fmt(c.truth.total)}</p>
                                        {c.truth.observaciones && <p className="text-xs italic mt-1">📝 {c.truth.observaciones}</p>}
                                      </div>
                                    </div>
                                    {r && (
                                      <div>
                                        <p className="font-medium text-foreground mb-1">Recon composition:</p>
                                        <div className="space-y-0.5 text-muted-foreground font-mono">
                                          <p className={r.primary_source === "shift_calc" ? "text-primary font-bold" : ""}>
                                            Primary source: {r.primary_source || "unknown"}
                                          </p>
                                          <p>Authoritative source: {r.authoritative_source || "none"}</p>
                                          <p>Authoritative total: {fmt(r.authoritative_total)}</p>
                                          {r.shift_calc_total > 0 && (
                                            <p className="text-primary">Shift-Calc: {r.shift_full_day_count}d + {r.shift_half_day_count}½d = {fmt(r.shift_calc_total)}</p>
                                          )}
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
                                    <div className="flex gap-4 text-muted-foreground flex-wrap">
                                      <span>Schedules: {r.schedule_count}</span>
                                      <span>Clocks: {r.clock_count}</span>
                                      <span>Payroll rows: {r.payroll_row_count}</span>
                                      <span>Flags: {r.flags.length}</span>
                                      <span className="border-l border-border pl-4">Truth Hrs: <span className="font-mono">{c.truth.shiftHours ? c.truth.shiftHours.toFixed(1) : "—"}</span></span>
                                      <span>Clock Hrs: <span className="font-mono">{r.clocked_hours ? r.clocked_hours.toFixed(1) : "—"}</span></span>
                                      <span>Sched Hrs: <span className="font-mono text-muted-foreground italic">{r.scheduled_hours ? r.scheduled_hours.toFixed(1) : "—"}</span> (estimado)</span>
                                      <span>Base Pay Hrs: <span className="font-mono">{r.base_pay_hours ? r.base_pay_hours.toFixed(1) : "—"}</span></span>
                                      <span className="font-medium">Fuente: {truthAuthoritativeMode ? "Truth" : r.hours_source_used}</span>
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
