/**
 * Payroll Reconciliation Engine
 * Component-level truth vs system comparison with anomaly detection
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
}

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
}

export interface ComponentTotals {
  hours: number;
  total_pay: number;
  pay_per_day: number;
  ryde: number;
  tips: number;
  reimbursements: number;
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

// ─── Matching Engine ─────────────────────────────────────────────────

interface EmployeeCandidate {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  external_id?: string;
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
  return truthRows.map((truth, idx) => {
    const truthName = normalizeName(`${truth.first_name} ${truth.last_name}`);
    const truthSSN = normalizeSSN(truth.verification_ssn_ein);

    // Tier 1: SSN match (non-placeholder)
    if (truthSSN && !isPlaceholderSSN(truth.verification_ssn_ein || "")) {
      // We don't have SSN in candidates typically, skip
    }

    // Tier 2: Exact name match
    for (const c of candidates) {
      if (c.full_name_normalized === truthName) {
        return { truth_index: idx, system_employee_id: c.id, match_status: "MATCHED" as const, match_confidence: 95, matched_by: "full_name_exact", match_notes: "" };
      }
    }

    // Tier 3: Alias match
    for (const a of aliases) {
      if (a.alias_normalized === truthName) {
        return { truth_index: idx, system_employee_id: a.employee_id, match_status: "MATCHED" as const, match_confidence: a.confidence, matched_by: "alias", match_notes: `Alias: ${truthName}` };
      }
    }

    // Tier 4: Fuzzy match
    let bestScore = Infinity;
    let bestCandidate: EmployeeCandidate | null = null;
    for (const c of candidates) {
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
      return { truth_index: idx, system_employee_id: bestCandidate.id, match_status: "MATCHED" as const, match_confidence: confidence, matched_by: "fuzzy_name", match_notes: `Distance: ${bestScore}` };
    }

    return { truth_index: idx, system_employee_id: null, match_status: "UNMATCHED" as const, match_confidence: 0, matched_by: "none", match_notes: "No match found" };
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

  const hasManualAdj = !!(truth.observaciones && truth.observaciones.trim().length > 0) ||
    (truth.total_hours == null || truth.total_hours === 0) && ((truth.total ?? 0) > 0);

  const hoursOk = withinTolerance(variances.hours, tolerance.hours);
  const payOk = withinTolerance(variances.total_pay, tolerance.money);
  const ppdOk = withinTolerance(variances.pay_per_day, tolerance.money);
  const rydeOk = withinTolerance(variances.ryde, tolerance.money);
  const tipsOk = withinTolerance(variances.tips, tolerance.tips);
  const reimbOk = withinTolerance(variances.reimbursements, tolerance.money);
  const totalOk = withinTolerance(variances.total, tolerance.money);

  const allOk = hoursOk && payOk && ppdOk && rydeOk && tipsOk && reimbOk && totalOk;
  const componentIssue = !allOk && totalOk;
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

  // Identity
  if (truth.verification_ssn_ein) {
    const norm = normalizeSSN(truth.verification_ssn_ein);
    if (norm === "000000000" || /^0+$/.test(norm)) flags.push("PLACEHOLDER_SSN_EIN");
    else if (norm.length > 0 && norm.length !== 9) flags.push("INVALID_SSN_EIN");
  }

  // Financial
  if ((truth.total_hours == null || truth.total_hours === 0) && (truth.total ?? 0) > 0) flags.push("MISSING_HOURS_WITH_PAY");
  if ((truth.total ?? 0) < 0) flags.push("NEGATIVE_PAY");
  if ((truth.total_hours ?? 0) > 0 && (truth.total ?? 0) === 0) flags.push("ZERO_PAY_WITH_HOURS");
  if ((truth.tips ?? 0) > 500) flags.push("HIGH_TIPS_OUTLIER");
  if ((truth.ryde ?? 0) > 500) flags.push("EXTREME_RYDE");

  // Observaciones → manual adjustment
  if (truth.observaciones && truth.observaciones.trim()) flags.push("MANUAL_ADJUSTMENT");

  // Total vs components
  const componentSum = (truth.total_pay ?? 0) + (truth.pay_per_day ?? 0) + (truth.ryde ?? 0) + (truth.tips ?? 0) + (truth.reimbursements ?? 0);
  if (truth.total != null && Math.abs(truth.total - componentSum) > 1) flags.push("TOTAL_DOES_NOT_MATCH_COMPONENTS");

  // Missing in system
  if (!system) flags.push("MISSING_IN_SYSTEM");

  return flags;
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
    grand_total: sum(matchedRows.map(r => r.system!.total)),
  };

  const totals_variance: ComponentTotals = {
    hours: totals_system.hours - totals_truth.hours,
    total_pay: totals_system.total_pay - totals_truth.total_pay,
    pay_per_day: totals_system.pay_per_day - totals_truth.pay_per_day,
    ryde: totals_system.ryde - totals_truth.ryde,
    tips: totals_system.tips - totals_truth.tips,
    reimbursements: totals_system.reimbursements - totals_truth.reimbursements,
    grand_total: totals_system.grand_total - totals_truth.grand_total,
  };

  const totalVariance = Math.abs(totals_variance.grand_total);

  let batch_status = "MATCHED";
  if (criticalMismatch > 0) batch_status = "CRITICAL";
  else if (componentMismatch > 0 || unmatchedTruth > 0) batch_status = "MISMATCHED";

  return {
    truth_count: truthCount,
    system_count: systemCount,
    matched,
    unmatched_truth: unmatchedTruth,
    unmatched_system: systemOnlyEmployees.length,
    exact_match: exactMatch,
    mismatch,
    component_mismatch: componentMismatch,
    critical_mismatch: criticalMismatch,
    total_variance: totalVariance,
    totals_truth,
    totals_system,
    totals_variance,
    batch_status,
  };
}

// ─── Full Reconciliation Run ─────────────────────────────────────────

export function runReconciliation(
  truthRows: TruthRow[],
  systemData: SystemEmployeeData[],
  aliases: AliasEntry[],
  tolerance: ToleranceConfig
): { rows: ReconciliationRowResult[]; systemOnly: SystemEmployeeData[]; summary: BatchSummary } {
  const candidates = systemData.map(s => ({
    id: s.employee_id,
    first_name: s.first_name,
    last_name: s.last_name,
    phone: s.phone,
    email: s.email,
    external_id: s.external_id,
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
    const system = match.system_employee_id
      ? systemData.find(s => s.employee_id === match.system_employee_id) ?? null
      : null;

    if (system) matchedSystemIds.add(system.employee_id);

    const variances = computeRowVariances(truth, system);
    const classification = classifyRow(truth, system, variances, match.match_status, tolerance);
    const anomaly_flags = detectAnomalies(truth, system);

    return { truth, system, match, variances, classification, anomaly_flags };
  });

  const systemOnly = systemData.filter(s => !matchedSystemIds.has(s.employee_id));
  const summary = computeBatchSummary(rows, systemOnly);

  return { rows, systemOnly, summary };
}
