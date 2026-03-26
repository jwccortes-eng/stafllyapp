/**
 * Payroll Reconciliation Engine
 * Component-level truth vs system comparison with anomaly detection
 *
 * ⚠️ HARD PAYROLL RULE — NEVER USE SCHEDULED HOURS FOR PAYROLL AMOUNTS.
 * Scheduled hours are ESTIMATED / OPERATIONAL only. They must never be used
 * as the real basis for employee payment, reconciliation, or closure totals.
 * Only these sources are authoritative for pay:
 *   1. Real clocked hours (clock in / clock out from time_entries)
 *   2. Validated payroll truth file amounts
 *   3. Approved manual payroll adjustments (explicitly recorded)
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface TruthRow {
  employer_identification?: string;
  verification_ssn_ein?: string;
  first_name: string;
  last_name: string;
  total_hours: number | null;
  total_pay: number | null;
  pay_per_day: number | null;
  ryde: number | null;
  tips: number | null;
  reimbursements: number | null;
  travel_hours: number | null;
  otros: number | null;
  discount: number | null;
  total: number | null;
  observaciones?: string;
  date?: string;
  corte?: string;
  raw: Record<string, unknown>;
}

export interface SystemEmployeeData {
  employee_id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  external_id?: string;
  employer_identification?: string;
  verification_ssn_ein?: string;
  total_hours: number;
  total_pay: number;
  pay_per_day: number;
  ryde: number;
  tips: number;
  reimbursements: number;
  total: number;
  shift_count: number;
  clock_count: number;
  source_tags: string[];
  date_range?: string;
  source_summary?: Record<string, unknown>;
}

export interface MatchResult {
  truth_index: number;
  system_employee_id: string | null;
  match_status: "MATCHED" | "UNMATCHED" | "AMBIGUOUS";
  match_confidence: number;
  matched_by: string;
  match_notes: string;
}

export interface ReconciliationRowResult {
  truth: TruthRow;
  system: SystemEmployeeData | null;
  match: MatchResult;
  variances: ComponentVariances;
  classification: RowClassification;
  anomaly_flags: string[];
  exception_type: ExceptionType | null;
}

export type ExceptionType =
  | "CRITICAL_TOTAL_MISMATCH"
  | "MISSING_IN_SYSTEM"
  | "MISSING_IN_TRUTH"
  | "LOW_CONFIDENCE_MATCH"
  | "COMPONENT_VARIANCE"
  | "IDENTITY_ISSUE"
  | "MANUAL_ADJUSTMENT_UNREVIEWED"
  | "TOTAL_COMPONENT_INTEGRITY";

export interface ComponentVariances {
  hours: number | null;
  total_pay: number | null;
  pay_per_day: number | null;
  ryde: number | null;
  tips: number | null;
  reimbursements: number | null;
  total: number | null;
}

export interface RowClassification {
  row_status: string;
  is_exact_match: boolean;
  has_component_mismatch: boolean;
  has_critical_mismatch: boolean;
  has_manual_adjustment: boolean;
}

export interface ToleranceConfig {
  hours: number;
  money: number;
  tips: number;
}

export interface BatchHealthScore {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: HealthFactor[];
  ready_to_close: boolean;
  blockers: string[];
}

export interface HealthFactor {
  label: string;
  weight: number;
  score: number; // 0-100
  detail: string;
}

export interface BatchSummary {
  truth_count: number;
  system_count: number;
  matched: number;
  unmatched_truth: number;
  unmatched_system: number;
  exact_match: number;
  mismatch: number;
  component_mismatch: number;
  critical_mismatch: number;
  total_variance: number;
  totals_truth: ComponentTotals;
  totals_system: ComponentTotals;
  totals_variance: ComponentTotals;
  batch_status: string;
  match_breakdown: MatchBreakdown;
  anomaly_summary: Record<string, number>;
  top_issues: TopIssue[];
  health: BatchHealthScore;
  exceptions: ExceptionSummary;
}

export interface ExceptionSummary {
  total: number;
  by_type: Record<ExceptionType, number>;
  items: ExceptionItem[];
}

export interface ExceptionItem {
  row_index: number;
  employee_name: string;
  type: ExceptionType;
  severity: "critical" | "warning" | "info";
  description: string;
  variance_amount: number | null;
}

export interface MatchBreakdown {
  by_employer_id: number;
  by_ssn: number;
  by_email: number;
  by_phone: number;
  by_external_id: number;
  by_full_name_exact: number;
  by_alias: number;
  by_fuzzy_name: number;
  unmatched: number;
}

export interface TopIssue {
  severity: "critical" | "warning" | "info";
  label: string;
  count: number;
  detail?: string;
}

export interface ComponentTotals {
  hours: number;
  total_pay: number;
  pay_per_day: number;
  ryde: number;
  tips: number;
  reimbursements: number;
  discount: number;
  grand_total: number;
}

// ─── Normalization ───────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSSN(ssn: string | null | undefined): string {
  if (!ssn) return "";
  return ssn.replace(/[^0-9xX]/g, "").toLowerCase();
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

function isPlaceholderSSN(ssn: string): boolean {
  const norm = normalizeSSN(ssn);
  return norm === "000000000" || norm === "" || /^0+$/.test(norm);
}

// ─── Matching Engine (Hardened Priority) ─────────────────────────────

interface EmployeeCandidate {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  external_id?: string;
  employer_identification?: string;
  verification_ssn_ein?: string;
  full_name_normalized: string;
}

interface AliasEntry {
  alias_normalized: string;
  employee_id: string;
  confidence: number;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}

export function matchEmployees(
  truthRows: TruthRow[],
  candidates: EmployeeCandidate[],
  aliases: AliasEntry[]
): MatchResult[] {
  const usedCandidateIds = new Set<string>();

  return truthRows.map((truth, idx) => {
    const truthName = normalizeName(`${truth.first_name} ${truth.last_name}`);
    const truthSSN = normalizeSSN(truth.verification_ssn_ein);
    const truthEmployerId = truth.employer_identification?.trim();

    // ── TIER 1: Employer Identification
    if (truthEmployerId) {
      for (const c of candidates) {
        if (usedCandidateIds.has(c.id)) continue;
        if (c.employer_identification && c.employer_identification.trim() === truthEmployerId) {
          usedCandidateIds.add(c.id);
          return { truth_index: idx, system_employee_id: c.id, match_status: "MATCHED" as const, match_confidence: 100, matched_by: "employer_id", match_notes: `Employer ID: ${truthEmployerId}` };
        }
      }
    }

    // ── TIER 2: SSN/EIN
    if (truthSSN && !isPlaceholderSSN(truth.verification_ssn_ein || "")) {
      for (const c of candidates) {
        if (usedCandidateIds.has(c.id)) continue;
        const candidateSSN = normalizeSSN(c.verification_ssn_ein);
        if (candidateSSN && candidateSSN === truthSSN) {
          usedCandidateIds.add(c.id);
          return { truth_index: idx, system_employee_id: c.id, match_status: "MATCHED" as const, match_confidence: 99, matched_by: "ssn_ein", match_notes: `SSN match (last 4: ...${truthSSN.slice(-4)})` };
        }
      }
    }

    // ── TIER 3: External ID
    if (truthEmployerId) {
      for (const c of candidates) {
        if (usedCandidateIds.has(c.id)) continue;
        if (c.external_id && c.external_id.trim() === truthEmployerId) {
          usedCandidateIds.add(c.id);
          return { truth_index: idx, system_employee_id: c.id, match_status: "MATCHED" as const, match_confidence: 98, matched_by: "external_id", match_notes: `External ID: ${truthEmployerId}` };
        }
      }
    }

    // ── TIER 4: Phone (strongest real-world signal — promoted above email)
    const truthPhone = truth.raw?.["Phone number"] || truth.raw?.["phone"] || truth.raw?.["Phone"] || truth.raw?.["phone_number"];
    const normPhone = truthPhone ? normalizePhone(String(truthPhone)) : "";
    if (normPhone.length >= 7) {
      for (const c of candidates) {
        if (usedCandidateIds.has(c.id)) continue;
        if (normalizePhone(c.phone) === normPhone) {
          usedCandidateIds.add(c.id);
          return { truth_index: idx, system_employee_id: c.id, match_status: "MATCHED" as const, match_confidence: 95, matched_by: "phone", match_notes: `Phone: ...${normPhone.slice(-4)}` };
        }
      }
    }

    // ── TIER 5: Email
    const truthEmail = truth.raw?.["Email"] || truth.raw?.["email"];
    if (truthEmail && typeof truthEmail === "string") {
      const normEmail = truthEmail.toLowerCase().trim();
      for (const c of candidates) {
        if (usedCandidateIds.has(c.id)) continue;
        if (c.email && c.email.toLowerCase().trim() === normEmail) {
          usedCandidateIds.add(c.id);
          return { truth_index: idx, system_employee_id: c.id, match_status: "MATCHED" as const, match_confidence: 96, matched_by: "email", match_notes: `Email: ${normEmail}` };
        }
      }
    }

    // ── TIER 6: Exact normalized full name (skip if ambiguous — multiple candidates share the name)
    const exactNameMatches = candidates.filter(c => !usedCandidateIds.has(c.id) && c.full_name_normalized === truthName && truthName.length > 3);
    if (exactNameMatches.length === 1) {
      usedCandidateIds.add(exactNameMatches[0].id);
      return { truth_index: idx, system_employee_id: exactNameMatches[0].id, match_status: "MATCHED" as const, match_confidence: 90, matched_by: "full_name_exact", match_notes: "" };
    }
    // If multiple exact matches exist, prefer the one with employer_identification
    if (exactNameMatches.length > 1) {
      const withIdentity = exactNameMatches.find(c => c.employer_identification || c.verification_ssn_ein);
      if (withIdentity) {
        usedCandidateIds.add(withIdentity.id);
        return { truth_index: idx, system_employee_id: withIdentity.id, match_status: "MATCHED" as const, match_confidence: 88, matched_by: "full_name_disambiguated", match_notes: `Disambiguated from ${exactNameMatches.length} candidates using identity fields` };
      }
      // Fall through to alias/fuzzy tiers for resolution
    }

    // ── TIER 6b: Split-name / substring matching (handles "marcy lorena moreno" vs "marcy moreno", "tabarez" vs "tabares")
    const truthParts = truthName.split(/\s+/).filter(Boolean);
    if (truthParts.length >= 2) {
      const truthFirst = truthParts[0];
      const truthLast = truthParts[truthParts.length - 1];
      for (const c of candidates) {
        if (usedCandidateIds.has(c.id)) continue;
        const cParts = c.full_name_normalized.split(/\s+/).filter(Boolean);
        if (cParts.length < 2) continue;
        const cFirst = cParts[0];
        const cLast = cParts[cParts.length - 1];
        // First name exact + last name within edit distance 1 (tabarez/tabares)
        if (cFirst === truthFirst && cLast.length >= 3 && truthLast.length >= 3) {
          const lastDist = levenshtein(truthLast, cLast);
          if (lastDist <= 1) {
            // For split-name (extra middle names), also check first name subset match
            const isSubsetName = truthParts.length !== cParts.length && 
              (truthParts.includes(cFirst) && truthParts.includes(cLast));
            if (lastDist === 0 && truthParts.length > cParts.length) {
              // e.g., "marcy lorena moreno" matches "marcy moreno" — extra middle name
              usedCandidateIds.add(c.id);
              return { truth_index: idx, system_employee_id: c.id, match_status: "MATCHED" as const, match_confidence: 87, matched_by: "split_name", match_notes: `Split-name: "${truthName}" → "${c.first_name} ${c.last_name}"` };
            }
            if (lastDist === 1) {
              // Surname spelling variant (tabarez/tabares)
              usedCandidateIds.add(c.id);
              return { truth_index: idx, system_employee_id: c.id, match_status: "MATCHED" as const, match_confidence: 85, matched_by: "surname_variant", match_notes: `Surname variant: "${truthLast}" ≈ "${cLast}"` };
            }
          }
        }
      }
    }

    // ── TIER 7: Alias
    for (const a of aliases) {
      if (usedCandidateIds.has(a.employee_id)) continue;
      if (normalizeName(a.alias_normalized) === truthName) {
        usedCandidateIds.add(a.employee_id);
        return { truth_index: idx, system_employee_id: a.employee_id, match_status: "MATCHED" as const, match_confidence: a.confidence, matched_by: "alias", match_notes: `Alias: ${truthName}` };
      }
    }

    // ── TIER 8: Fuzzy name
    let bestScore = Infinity;
    let bestCandidate: EmployeeCandidate | null = null;
    for (const c of candidates) {
      if (usedCandidateIds.has(c.id)) continue;
      const dist = levenshtein(truthName, c.full_name_normalized);
      const maxLen = Math.max(truthName.length, c.full_name_normalized.length);
      if (maxLen === 0) continue;
      const similarity = 1 - dist / maxLen;
      if (similarity > 0.75 && dist < bestScore) {
        bestScore = dist;
        bestCandidate = c;
      }
    }

    if (bestCandidate) {
      const maxLen = Math.max(truthName.length, bestCandidate.full_name_normalized.length);
      const confidence = Math.round((1 - bestScore / maxLen) * 100);
      usedCandidateIds.add(bestCandidate.id);
      return { truth_index: idx, system_employee_id: bestCandidate.id, match_status: "MATCHED" as const, match_confidence: confidence, matched_by: "fuzzy_name", match_notes: `Fuzzy distance: ${bestScore}, matched "${bestCandidate.first_name} ${bestCandidate.last_name}"` };
    }

    return { truth_index: idx, system_employee_id: null, match_status: "UNMATCHED" as const, match_confidence: 0, matched_by: "none", match_notes: "No match found in any tier" };
  });
}

// ─── Variance Computation ────────────────────────────────────────────

function computeVariance(truth: number | null, system: number | null): number | null {
  if (truth == null && system == null) return null;
  return (system ?? 0) - (truth ?? 0);
}

function withinTolerance(variance: number | null, tolerance: number): boolean {
  if (variance == null) return true;
  return Math.abs(variance) <= tolerance;
}

export function computeRowVariances(truth: TruthRow, system: SystemEmployeeData | null): ComponentVariances {
  if (!system) {
    return {
      hours: truth.total_hours != null ? -(truth.total_hours) : null,
      total_pay: truth.total_pay != null ? -(truth.total_pay) : null,
      pay_per_day: truth.pay_per_day != null ? -(truth.pay_per_day) : null,
      ryde: truth.ryde != null ? -(truth.ryde) : null,
      tips: truth.tips != null ? -(truth.tips) : null,
      reimbursements: truth.reimbursements != null ? -(truth.reimbursements) : null,
      total: truth.total != null ? -(truth.total) : null,
    };
  }
  return {
    hours: computeVariance(truth.total_hours, system.total_hours),
    total_pay: computeVariance(truth.total_pay, system.total_pay),
    pay_per_day: computeVariance(truth.pay_per_day, system.pay_per_day),
    ryde: computeVariance(truth.ryde, system.ryde),
    tips: computeVariance(truth.tips, system.tips),
    reimbursements: computeVariance(truth.reimbursements, system.reimbursements),
    total: computeVariance(truth.total, system.total),
  };
}

export function classifyRow(
  truth: TruthRow,
  system: SystemEmployeeData | null,
  variances: ComponentVariances,
  matchStatus: string,
  tolerance: ToleranceConfig
): RowClassification {
  if (matchStatus === "UNMATCHED") {
    return { row_status: "MISSING_IN_SYSTEM", is_exact_match: false, has_component_mismatch: false, has_critical_mismatch: true, has_manual_adjustment: false };
  }
  if (!system) {
    return { row_status: "MISSING_IN_SYSTEM", is_exact_match: false, has_component_mismatch: false, has_critical_mismatch: true, has_manual_adjustment: false };
  }

  const isComponentOnlyRow = (truth.total_pay == null || truth.total_pay === 0) && ((truth.pay_per_day ?? 0) > 0 || (truth.ryde ?? 0) > 0 || (truth.tips ?? 0) > 0);
  const hasManualAdj = !!(truth.observaciones && truth.observaciones.trim().length > 0) ||
    ((truth.total_hours == null || truth.total_hours === 0) && ((truth.total ?? 0) > 0) && !isComponentOnlyRow);

  const hoursOk = withinTolerance(variances.hours, tolerance.hours);
  const payOk = withinTolerance(variances.total_pay, tolerance.money);
  const ppdOk = withinTolerance(variances.pay_per_day, tolerance.money);
  const rydeOk = withinTolerance(variances.ryde, tolerance.money);
  const tipsOk = withinTolerance(variances.tips, tolerance.tips);
  const reimbOk = withinTolerance(variances.reimbursements, tolerance.money);
  const totalOk = withinTolerance(variances.total, tolerance.money);

  const allOk = hoursOk && payOk && ppdOk && rydeOk && tipsOk && reimbOk && totalOk;
  const criticalIssue = !totalOk;

  if (allOk) {
    return { row_status: "EXACT_MATCH", is_exact_match: true, has_component_mismatch: false, has_critical_mismatch: false, has_manual_adjustment: hasManualAdj };
  }
  if (criticalIssue) {
    return { row_status: "CRITICAL_MISMATCH", is_exact_match: false, has_component_mismatch: true, has_critical_mismatch: true, has_manual_adjustment: hasManualAdj };
  }
  return { row_status: "COMPONENT_MISMATCH", is_exact_match: false, has_component_mismatch: true, has_critical_mismatch: false, has_manual_adjustment: hasManualAdj };
}

// ─── Anomaly Detection ───────────────────────────────────────────────

export function detectAnomalies(truth: TruthRow, system: SystemEmployeeData | null): string[] {
  const flags: string[] = [];

  if (truth.verification_ssn_ein) {
    const norm = normalizeSSN(truth.verification_ssn_ein);
    if (norm === "000000000" || /^0+$/.test(norm)) flags.push("PLACEHOLDER_SSN_EIN");
    else if (norm.length > 0 && norm.length !== 9) flags.push("INVALID_SSN_EIN");
  }

  // Only flag missing hours if pay comes from base pay (not tips/ryde/ppd-only rows)
  const isTipOnly = (truth.total_pay == null || truth.total_pay === 0) && (truth.tips ?? 0) > 0 && (truth.pay_per_day ?? 0) === 0 && (truth.ryde ?? 0) === 0;
  const isComponentOnly = (truth.total_pay == null || truth.total_pay === 0) && ((truth.pay_per_day ?? 0) > 0 || (truth.ryde ?? 0) > 0 || (truth.tips ?? 0) > 0);
  if ((truth.total_hours == null || truth.total_hours === 0) && (truth.total ?? 0) > 0 && !isComponentOnly) flags.push("MISSING_HOURS_WITH_PAY");
  if (isTipOnly) flags.push("TIP_ONLY_ROW");
  if ((truth.total ?? 0) < 0) flags.push("NEGATIVE_PAY");
  if ((truth.total_hours ?? 0) > 0 && (truth.total ?? 0) === 0) flags.push("ZERO_PAY_WITH_HOURS");
  if ((truth.tips ?? 0) > 500) flags.push("HIGH_TIPS_OUTLIER");
  if ((truth.ryde ?? 0) > 500) flags.push("EXTREME_RYDE");
  if (truth.observaciones && truth.observaciones.trim()) flags.push("MANUAL_ADJUSTMENT");

  const componentSum = (truth.total_pay ?? 0) + (truth.pay_per_day ?? 0) + (truth.ryde ?? 0) + (truth.tips ?? 0) + (truth.reimbursements ?? 0);
  if (truth.total != null && Math.abs(truth.total - componentSum) > 1) flags.push("TOTAL_DOES_NOT_MATCH_COMPONENTS");

  if (!system) flags.push("MISSING_IN_SYSTEM");

  return flags;
}

// ─── Exception Classification ────────────────────────────────────────

function classifyException(
  row: { truth: TruthRow; system: SystemEmployeeData | null; match: MatchResult; variances: ComponentVariances; classification: RowClassification; anomaly_flags: string[] },
  tolerance: ToleranceConfig
): ExceptionType | null {
  if (row.classification.row_status === "MISSING_IN_SYSTEM") return "MISSING_IN_SYSTEM";
  if (row.classification.has_critical_mismatch) return "CRITICAL_TOTAL_MISMATCH";
  if (row.match.match_confidence > 0 && row.match.match_confidence < 80) return "LOW_CONFIDENCE_MATCH";
  if (row.anomaly_flags.includes("INVALID_SSN_EIN") || row.anomaly_flags.includes("PLACEHOLDER_SSN_EIN")) return "IDENTITY_ISSUE";
  if (row.anomaly_flags.includes("TOTAL_DOES_NOT_MATCH_COMPONENTS")) return "TOTAL_COMPONENT_INTEGRITY";
  if (row.classification.has_manual_adjustment && !row.classification.is_exact_match) return "MANUAL_ADJUSTMENT_UNREVIEWED";
  if (row.classification.has_component_mismatch) return "COMPONENT_VARIANCE";
  return null;
}

function buildExceptionSummary(rows: ReconciliationRowResult[], systemOnly: SystemEmployeeData[]): ExceptionSummary {
  const items: ExceptionItem[] = [];
  const byType: Record<string, number> = {};

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.exception_type) continue;
    byType[r.exception_type] = (byType[r.exception_type] || 0) + 1;
    items.push({
      row_index: i,
      employee_name: `${r.truth.first_name} ${r.truth.last_name}`,
      type: r.exception_type,
      severity: r.classification.has_critical_mismatch ? "critical" : r.classification.has_component_mismatch ? "warning" : "info",
      description: exceptionDescription(r.exception_type),
      variance_amount: r.variances.total,
    });
  }

  // System-only employees as exceptions
  for (const e of systemOnly) {
    const type: ExceptionType = "MISSING_IN_TRUTH";
    byType[type] = (byType[type] || 0) + 1;
    items.push({
      row_index: -1,
      employee_name: `${e.first_name} ${e.last_name}`,
      type,
      severity: "warning",
      description: "Empleado en sistema pero no en archivo de verdad",
      variance_amount: null,
    });
  }

  items.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  return { total: items.length, by_type: byType as Record<ExceptionType, number>, items };
}

function exceptionDescription(type: ExceptionType): string {
  const map: Record<ExceptionType, string> = {
    CRITICAL_TOTAL_MISMATCH: "Varianza crítica en total — fuera de tolerancia",
    MISSING_IN_SYSTEM: "Empleado en truth file pero no encontrado en sistema",
    MISSING_IN_TRUTH: "Empleado en sistema pero no en truth file",
    LOW_CONFIDENCE_MATCH: "Match por nombre aproximado — requiere confirmación",
    COMPONENT_VARIANCE: "Componente(s) fuera de tolerancia (total dentro)",
    IDENTITY_ISSUE: "SSN/EIN inválido o placeholder",
    MANUAL_ADJUSTMENT_UNREVIEWED: "Ajuste manual sin revisión",
    TOTAL_COMPONENT_INTEGRITY: "Suma de componentes no cuadra con total reportado",
  };
  return map[type] || type;
}

// ─── Health Score ────────────────────────────────────────────────────

function computeHealthScore(rows: ReconciliationRowResult[], systemOnly: SystemEmployeeData[], summary: Omit<BatchSummary, "health" | "exceptions">): BatchHealthScore {
  const factors: HealthFactor[] = [];
  const blockers: string[] = [];
  const tc = summary.truth_count || 1;

  // Factor 1: Match rate (25%)
  const matchRate = summary.matched / tc;
  const matchScore = Math.min(100, Math.round(matchRate * 100));
  factors.push({ label: "Tasa de match", weight: 25, score: matchScore, detail: `${summary.matched}/${tc} empleados matched` });

  // Factor 2: Exact match rate (25%)
  const exactRate = summary.exact_match / tc;
  const exactScore = Math.min(100, Math.round(exactRate * 100));
  factors.push({ label: "Match exacto", weight: 25, score: exactScore, detail: `${summary.exact_match}/${tc} exactos` });

  // Factor 3: No critical mismatches (20%)
  const critScore = summary.critical_mismatch === 0 ? 100 : Math.max(0, 100 - summary.critical_mismatch * 20);
  factors.push({ label: "Sin críticos", weight: 20, score: critScore, detail: `${summary.critical_mismatch} discrepancias críticas` });
  if (summary.critical_mismatch > 0) blockers.push(`${summary.critical_mismatch} discrepancias críticas sin resolver`);

  // Factor 4: No unmatched truth (15%)
  const unmatchScore = summary.unmatched_truth === 0 ? 100 : Math.max(0, 100 - summary.unmatched_truth * 25);
  factors.push({ label: "Sin faltantes", weight: 15, score: unmatchScore, detail: `${summary.unmatched_truth} empleados sin match` });
  if (summary.unmatched_truth > 0) blockers.push(`${summary.unmatched_truth} empleados no encontrados en sistema`);

  // Factor 5: Variance within threshold (15%)
  const varThreshold = 50; // $50 total acceptable
  const varScore = summary.total_variance <= 1 ? 100 : summary.total_variance <= varThreshold ? 80 : Math.max(0, 100 - Math.round(summary.total_variance / 10));
  factors.push({ label: "Varianza total", weight: 15, score: varScore, detail: `$${summary.total_variance.toFixed(2)} varianza` });

  const weightedScore = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0) / 100);

  let grade: "A" | "B" | "C" | "D" | "F";
  if (weightedScore >= 90) grade = "A";
  else if (weightedScore >= 75) grade = "B";
  else if (weightedScore >= 60) grade = "C";
  else if (weightedScore >= 40) grade = "D";
  else grade = "F";

  return { score: weightedScore, grade, factors, ready_to_close: blockers.length === 0 && weightedScore >= 75, blockers };
}

// ─── Batch Summary ───────────────────────────────────────────────────

export function computeBatchSummary(
  rows: ReconciliationRowResult[],
  systemOnlyEmployees: SystemEmployeeData[]
): BatchSummary {
  const truthCount = rows.length;
  const systemCount = new Set([
    ...rows.filter(r => r.system).map(r => r.system!.employee_id),
    ...systemOnlyEmployees.map(e => e.employee_id),
  ]).size;

  const matched = rows.filter(r => r.match.match_status === "MATCHED").length;
  const unmatchedTruth = rows.filter(r => r.match.match_status === "UNMATCHED").length;
  const exactMatch = rows.filter(r => r.classification.is_exact_match).length;
  const mismatch = rows.filter(r => !r.classification.is_exact_match && r.match.match_status === "MATCHED").length;
  const componentMismatch = rows.filter(r => r.classification.has_component_mismatch).length;
  const criticalMismatch = rows.filter(r => r.classification.has_critical_mismatch).length;

  const sum = (arr: (number | null)[]): number => arr.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0;

  const totals_truth: ComponentTotals = {
    hours: sum(rows.map(r => r.truth.total_hours)),
    total_pay: sum(rows.map(r => r.truth.total_pay)),
    pay_per_day: sum(rows.map(r => r.truth.pay_per_day)),
    ryde: sum(rows.map(r => r.truth.ryde)),
    tips: sum(rows.map(r => r.truth.tips)),
    reimbursements: sum(rows.map(r => r.truth.reimbursements)),
    discount: sum(rows.map(r => Math.abs(Number(r.truth.discount) || 0))),
    grand_total: sum(rows.map(r => r.truth.total)),
  };

  const matchedRows = rows.filter(r => r.system);
  const totals_system: ComponentTotals = {
    hours: sum(matchedRows.map(r => r.system!.total_hours)),
    total_pay: sum(matchedRows.map(r => r.system!.total_pay)),
    pay_per_day: sum(matchedRows.map(r => r.system!.pay_per_day)),
    ryde: sum(matchedRows.map(r => r.system!.ryde)),
    tips: sum(matchedRows.map(r => r.system!.tips)),
    reimbursements: sum(matchedRows.map(r => r.system!.reimbursements)),
    discount: 0,
    grand_total: sum(matchedRows.map(r => r.system!.total)),
  };

  const totals_variance: ComponentTotals = {
    hours: totals_system.hours - totals_truth.hours,
    total_pay: totals_system.total_pay - totals_truth.total_pay,
    pay_per_day: totals_system.pay_per_day - totals_truth.pay_per_day,
    ryde: totals_system.ryde - totals_truth.ryde,
    tips: totals_system.tips - totals_truth.tips,
    reimbursements: totals_system.reimbursements - totals_truth.reimbursements,
    discount: totals_system.discount - totals_truth.discount,
    grand_total: totals_system.grand_total - totals_truth.grand_total,
  };

  const totalVariance = Math.abs(totals_variance.grand_total);

  const match_breakdown: MatchBreakdown = {
    by_employer_id: rows.filter(r => r.match.matched_by === "employer_id").length,
    by_ssn: rows.filter(r => r.match.matched_by === "ssn_ein").length,
    by_email: rows.filter(r => r.match.matched_by === "email").length,
    by_phone: rows.filter(r => r.match.matched_by === "phone").length,
    by_external_id: rows.filter(r => r.match.matched_by === "external_id").length,
    by_full_name_exact: rows.filter(r => r.match.matched_by === "full_name_exact").length,
    by_alias: rows.filter(r => r.match.matched_by === "alias").length,
    by_fuzzy_name: rows.filter(r => r.match.matched_by === "fuzzy_name").length,
    unmatched: rows.filter(r => r.match.matched_by === "none").length,
  };

  const anomaly_summary: Record<string, number> = {};
  for (const row of rows) {
    for (const flag of row.anomaly_flags) {
      anomaly_summary[flag] = (anomaly_summary[flag] || 0) + 1;
    }
  }

  const top_issues: TopIssue[] = [];
  if (criticalMismatch > 0) top_issues.push({ severity: "critical", label: "Discrepancias críticas en total", count: criticalMismatch });
  if (unmatchedTruth > 0) top_issues.push({ severity: "critical", label: "Empleados sin match en sistema", count: unmatchedTruth });
  if (systemOnlyEmployees.length > 0) top_issues.push({ severity: "warning", label: "Empleados solo en sistema (no en truth)", count: systemOnlyEmployees.length });
  if (match_breakdown.by_fuzzy_name > 0) top_issues.push({ severity: "warning", label: "Matches por nombre aproximado (confirmar)", count: match_breakdown.by_fuzzy_name });
  if (anomaly_summary["PLACEHOLDER_SSN_EIN"]) top_issues.push({ severity: "info", label: "SSN/EIN placeholder (000-00-0000)", count: anomaly_summary["PLACEHOLDER_SSN_EIN"] });
  if (anomaly_summary["TOTAL_DOES_NOT_MATCH_COMPONENTS"]) top_issues.push({ severity: "warning", label: "Total no coincide con componentes", count: anomaly_summary["TOTAL_DOES_NOT_MATCH_COMPONENTS"] });
  if (anomaly_summary["MISSING_HOURS_WITH_PAY"]) top_issues.push({ severity: "info", label: "Pago sin horas registradas", count: anomaly_summary["MISSING_HOURS_WITH_PAY"] });
  if (anomaly_summary["MANUAL_ADJUSTMENT"]) top_issues.push({ severity: "info", label: "Ajustes manuales / observaciones", count: anomaly_summary["MANUAL_ADJUSTMENT"] });

  top_issues.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity] || b.count - a.count;
  });

  let batch_status = "MATCHED";
  if (criticalMismatch > 0) batch_status = "CRITICAL";
  else if (componentMismatch > 0 || unmatchedTruth > 0) batch_status = "MISMATCHED";

  const partialSummary = {
    truth_count: truthCount, system_count: systemCount, matched, unmatched_truth: unmatchedTruth,
    unmatched_system: systemOnlyEmployees.length, exact_match: exactMatch, mismatch, component_mismatch: componentMismatch,
    critical_mismatch: criticalMismatch, total_variance: totalVariance, totals_truth, totals_system, totals_variance,
    batch_status, match_breakdown, anomaly_summary, top_issues,
  };

  const health = computeHealthScore(rows, systemOnlyEmployees, partialSummary);
  const exceptions = buildExceptionSummary(rows, systemOnlyEmployees);

  return { ...partialSummary, health, exceptions };
}

// ─── Full Reconciliation Run ─────────────────────────────────────────

export function runReconciliation(
  truthRows: TruthRow[],
  systemData: SystemEmployeeData[],
  aliases: AliasEntry[],
  tolerance: ToleranceConfig,
  options?: { isHistorical?: boolean }
): { rows: ReconciliationRowResult[]; systemOnly: SystemEmployeeData[]; summary: BatchSummary } {
  const isHistorical = options?.isHistorical ?? false;

  const candidates = systemData.map(s => ({
    id: s.employee_id,
    first_name: s.first_name,
    last_name: s.last_name,
    phone: s.phone,
    email: s.email,
    external_id: s.external_id,
    employer_identification: s.employer_identification,
    verification_ssn_ein: s.verification_ssn_ein,
    full_name_normalized: normalizeName(`${s.first_name} ${s.last_name}`),
  }));

  const aliasEntries = aliases.map(a => ({
    alias_normalized: normalizeName(a.alias_normalized),
    employee_id: a.employee_id,
    confidence: a.confidence,
  }));

  const matches = matchEmployees(truthRows, candidates, aliasEntries);

  const matchedSystemIds = new Set<string>();
  const rows: ReconciliationRowResult[] = matches.map((match, i) => {
    const truth = truthRows[i];
    let system = match.system_employee_id
      ? systemData.find(s => s.employee_id === match.system_employee_id) ?? null
      : null;

    if (system) matchedSystemIds.add(system.employee_id);

    // ── Historical Mode: mirror truth → system so variances = 0 ──
    if (isHistorical) {
      const mirroredSystem: SystemEmployeeData = {
        employee_id: system?.employee_id ?? `historical_${i}`,
        first_name: system?.first_name ?? truth.first_name,
        last_name: system?.last_name ?? truth.last_name,
        phone: system?.phone,
        email: system?.email,
        external_id: system?.external_id,
        employer_identification: system?.employer_identification,
        verification_ssn_ein: system?.verification_ssn_ein,
        total_hours: truth.total_hours ?? 0,
        total_pay: truth.total_pay ?? 0,
        pay_per_day: truth.pay_per_day ?? 0,
        ryde: truth.ryde ?? 0,
        tips: truth.tips ?? 0,
        reimbursements: truth.reimbursements ?? 0,
        total: truth.total ?? 0,
        shift_count: system?.shift_count ?? 0,
        clock_count: system?.clock_count ?? 0,
        source_tags: ["historical_mirror"],
      };
      system = mirroredSystem;
      // Also force match status for unmatched rows in historical mode
      if (match.match_status === "UNMATCHED") {
        match = { ...match, match_status: "MATCHED", matched_by: "historical_mirror", match_confidence: 100, match_notes: "Auto-matched via historical mirror" };
      }
    }

    const variances = computeRowVariances(truth, system);
    const classification = classifyRow(truth, system, variances, match.match_status, tolerance);
    const anomaly_flags = detectAnomalies(truth, system);
    const baseRow = { truth, system, match, variances, classification, anomaly_flags };
    const exception_type = classifyException(baseRow, tolerance);

    return { ...baseRow, exception_type };
  });

  const systemOnly = isHistorical ? [] : systemData.filter(s => !matchedSystemIds.has(s.employee_id));
  const summary = computeBatchSummary(rows, systemOnly);

  return { rows, systemOnly, summary };
}

// ─── Executive Export Helpers ─────────────────────────────────────────

export function generateExecutiveCSV(rows: ReconciliationRowResult[], summary: BatchSummary): string[][] {
  return [
    ["RECONCILIATION EXECUTIVE SUMMARY"],
    [""],
    ["Metric", "Value"],
    ["Truth Employees", String(summary.truth_count)],
    ["System Employees", String(summary.system_count)],
    ["Matched", String(summary.matched)],
    ["Exact Match", String(summary.exact_match)],
    ["Component Mismatch", String(summary.component_mismatch)],
    ["Critical Mismatch", String(summary.critical_mismatch)],
    ["Unmatched (Truth)", String(summary.unmatched_truth)],
    ["Unmatched (System)", String(summary.unmatched_system)],
    [""],
    ["Health Score", `${summary.health.score}/100 (${summary.health.grade})`],
    ["Ready to Close", summary.health.ready_to_close ? "YES" : "NO"],
    ...(summary.health.blockers.length > 0 ? [["Blockers", summary.health.blockers.join("; ")]] : []),
    [""],
    ["Component", "Truth", "System", "Variance"],
    ["Hours", String(summary.totals_truth.hours), String(summary.totals_system.hours), String(summary.totals_variance.hours)],
    ["Total Pay", String(summary.totals_truth.total_pay), String(summary.totals_system.total_pay), String(summary.totals_variance.total_pay)],
    ["Pay Per Day", String(summary.totals_truth.pay_per_day), String(summary.totals_system.pay_per_day), String(summary.totals_variance.pay_per_day)],
    ["Ryde", String(summary.totals_truth.ryde), String(summary.totals_system.ryde), String(summary.totals_variance.ryde)],
    ["Tips", String(summary.totals_truth.tips), String(summary.totals_system.tips), String(summary.totals_variance.tips)],
    ["Reimbursements", String(summary.totals_truth.reimbursements), String(summary.totals_system.reimbursements), String(summary.totals_variance.reimbursements)],
    ["Discount", String(summary.totals_truth.discount), String(summary.totals_system.discount), String(summary.totals_variance.discount)],
    ["GRAND TOTAL", String(summary.totals_truth.grand_total), String(summary.totals_system.grand_total), String(summary.totals_variance.grand_total)],
    [""],
    ["EXCEPTIONS"],
    ["Employee", "Type", "Severity", "Description", "Variance"],
    ...summary.exceptions.items.map(e => [e.employee_name, e.type, e.severity, e.description, e.variance_amount != null ? String(e.variance_amount) : ""]),
  ];
}

export function generateMismatchCSV(rows: ReconciliationRowResult[]): string[][] {
  const mismatches = rows.filter(r => !r.classification.is_exact_match);
  return [
    ["Employee", "Status", "Match Method", "Confidence", "Truth Total", "System Total", "Variance", "Flags", "Observaciones"],
    ...mismatches.map(r => [
      `${r.truth.first_name} ${r.truth.last_name}`,
      r.classification.row_status,
      r.match.matched_by,
      String(r.match.match_confidence),
      String(r.truth.total ?? ""),
      String(r.system?.total ?? ""),
      String(r.variances.total ?? ""),
      r.anomaly_flags.join("; "),
      r.truth.observaciones || "",
    ]),
  ];
}

export function generateCriticalCSV(rows: ReconciliationRowResult[]): string[][] {
  const critical = rows.filter(r => r.classification.has_critical_mismatch);
  return [
    ["Employee", "Status", "Truth Total", "System Total", "Variance", "Flags"],
    ...critical.map(r => [
      `${r.truth.first_name} ${r.truth.last_name}`,
      r.classification.row_status,
      String(r.truth.total ?? ""),
      String(r.system?.total ?? ""),
      String(r.variances.total ?? ""),
      r.anomaly_flags.join("; "),
    ]),
  ];
}
