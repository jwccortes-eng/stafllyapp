/**
 * Auto-Approval Decision Engine for Payroll Reconciliation
 * 
 * Classifies each employee record into:
 * - auto_approved: within tolerance, clear classification, no conflicts
 * - needs_review: minor issues that need human verification
 * - blocked: critical problems preventing approval
 * - manual_action: requires explicit manual intervention
 */

import type { EmployeeFinalRecord } from "@/hooks/useReconciliationPeriod";

// ── Types ──

export type ApprovalStatus = "auto_approved" | "needs_review" | "blocked" | "manual_action";

export interface ApprovalTolerances {
  /** Absolute $ tolerance for auto-approval (default: $5) */
  absolute_tolerance: number;
  /** Percentage tolerance for auto-approval (default: 3%) */
  percentage_tolerance: number;
  /** Per shift-type overrides */
  type_overrides?: Partial<Record<string, { absolute?: number; percentage?: number }>>;
}

export interface ApprovalReason {
  code: string;
  label: string;
  severity: "info" | "warning" | "critical";
}

export interface ApprovalDecision {
  status: ApprovalStatus;
  reasons: ApprovalReason[];
  /** Primary reason label for display */
  primary_reason: string;
  /** Numeric confidence 0-100 */
  confidence: number;
  /** Computed values for audit */
  computed: {
    shift_calculated_total: number;
    payroll_reference_total: number;
    absolute_diff: number;
    percentage_diff: number;
    tolerance_used_absolute: number;
    tolerance_used_percentage: number;
    classification: string;
    has_rate: boolean;
    has_conflicts: boolean;
    has_critical_unmapped: boolean;
  };
}

export interface AutoApprovalSummary {
  auto_approved: number;
  needs_review: number;
  blocked: number;
  manual_action: number;
  total: number;
  auto_approval_rate: number;
  decisions: Map<string, ApprovalDecision>;
}

// ── Default tolerances ──

export const DEFAULT_TOLERANCES: ApprovalTolerances = {
  absolute_tolerance: 5,
  percentage_tolerance: 3,
  type_overrides: {
    full_day: { absolute: 1, percentage: 1 },
    half_day: { absolute: 1, percentage: 1 },
    mixed_daily: { absolute: 5, percentage: 3 },
    hourly: { absolute: 10, percentage: 5 },
    mixed: { absolute: 10, percentage: 5 },
    manual_adjustment: { absolute: 0, percentage: 0 }, // always needs review
  },
};

// ── Engine ──

function getTolerances(classification: string, config: ApprovalTolerances): { abs: number; pct: number } {
  const override = config.type_overrides?.[classification];
  return {
    abs: override?.absolute ?? config.absolute_tolerance,
    pct: override?.percentage ?? config.percentage_tolerance,
  };
}

export function evaluateRecord(
  record: EmployeeFinalRecord,
  tolerances: ApprovalTolerances = DEFAULT_TOLERANCES
): ApprovalDecision {
  const reasons: ApprovalReason[] = [];
  const classification = record.pay_classification;
  const { abs: tolAbs, pct: tolPct } = getTolerances(classification, tolerances);

  const shiftCalcTotal = record.shift_calculated_total || 0;
  const payrollRef = record.payroll_reference_total || record.source_payroll_total || 0;
  const grandTotal = record.grand_total || record.final_total_pay || 0;

  // Use shift-calc diff if available, otherwise compare grand_total vs payroll
  const absoluteDiff = shiftCalcTotal > 0
    ? Math.abs(record.shift_vs_payroll_diff || 0)
    : Math.abs(grandTotal - payrollRef);

  const referenceBase = shiftCalcTotal > 0 ? (record.daily_pay_total + record.weekend_pay_total) : payrollRef;
  const percentageDiff = referenceBase > 0 ? (absoluteDiff / referenceBase) * 100 : 0;

  const hasRate = !!(record.daily_rate || record.hourly_rate || (record as any).shift_daily_rate_used);
  const hasConflicts = record.conflict_count > 0;
  const hasCriticalUnmapped = (record.warnings || []).some((w: any) => String(w).startsWith("CRITICAL_UNMAPPED_RATIO:"));
  const hasShiftCalc = shiftCalcTotal > 0;
  const shiftFullDayCount = (record as any).shift_full_day_count || 0;
  const shiftHalfDayCount = (record as any).shift_half_day_count || 0;

  // ── BLOCKED conditions ──
  if (hasCriticalUnmapped) {
    reasons.push({ code: "critical_unmapped", label: "Bloqueado: >20% de registros sin clasificar", severity: "critical" });
  }
  if (classification === "unknown" && !hasShiftCalc) {
    reasons.push({ code: "unknown_classification", label: "Bloqueado: clasificación de pago no determinada", severity: "critical" });
  }
  if (grandTotal === 0 && (record.payroll_rows || []).length > 0) {
    reasons.push({ code: "zero_total", label: "Bloqueado: total calculado es $0 con filas de nómina", severity: "critical" });
  }

  // ── MANUAL ACTION conditions ──
  if (classification === "manual_adjustment" || (record.manual_adjustment_total || 0) > 0 && !hasShiftCalc) {
    reasons.push({ code: "manual_adjustment", label: "Acción manual: contiene ajustes manuales", severity: "warning" });
  }

  // ── NEEDS REVIEW conditions ──
  if (!hasRate && hasShiftCalc) {
    reasons.push({ code: "no_rate_configured", label: "Revisión: sin tarifa configurada — usando inferencia", severity: "warning" });
  }
  if (!hasRate && !hasShiftCalc) {
    reasons.push({ code: "no_rate_at_all", label: "Bloqueado: sin tarifa de pago configurada", severity: "critical" });
  }
  if (hasConflicts) {
    reasons.push({ code: "has_conflicts", label: `Revisión: ${record.conflict_count} conflicto(s) de matching`, severity: "warning" });
  }
  if (absoluteDiff > tolAbs && percentageDiff > tolPct) {
    reasons.push({
      code: "tolerance_exceeded",
      label: `Revisión: diferencia $${absoluteDiff.toFixed(2)} (${percentageDiff.toFixed(1)}%) excede tolerancia ($${tolAbs}/${tolPct}%)`,
      severity: "warning",
    });
  }
  if ((record.payroll_rows || []).length === 0 && (record.scheduled_shifts || []).length > 0) {
    reasons.push({ code: "no_payroll_rows", label: "Revisión: tiene turnos pero sin filas de nómina", severity: "warning" });
  }
  if (shiftFullDayCount === 0 && shiftHalfDayCount === 0 && hasShiftCalc) {
    reasons.push({ code: "shift_count_zero", label: "Revisión: shift-calc activo pero conteo de días = 0", severity: "warning" });
  }

  // ── AUTO-APPROVE conditions (positive) ──
  const withinTolerance = absoluteDiff <= tolAbs || percentageDiff <= tolPct;
  if (withinTolerance && hasShiftCalc && hasRate && !hasConflicts && !hasCriticalUnmapped) {
    reasons.push({ code: "within_tolerance", label: `Auto aprobado: diferencia $${absoluteDiff.toFixed(2)} dentro de tolerancia`, severity: "info" });
  }
  if (classification !== "unknown" && grandTotal > 0 && !hasConflicts && !hasCriticalUnmapped && withinTolerance) {
    reasons.push({ code: "clean_classification", label: "Auto aprobado: clasificación clara y sin conflictos", severity: "info" });
  }

  // ── Determine final status ──
  const criticalReasons = reasons.filter(r => r.severity === "critical");
  const warningReasons = reasons.filter(r => r.severity === "warning");
  const infoReasons = reasons.filter(r => r.severity === "info");

  let status: ApprovalStatus;
  let primaryReason: string;
  let confidence: number;

  if (criticalReasons.length > 0) {
    status = "blocked";
    primaryReason = criticalReasons[0].label;
    confidence = 0;
  } else if (reasons.some(r => r.code === "manual_adjustment" && !hasShiftCalc)) {
    status = "manual_action";
    primaryReason = "Requiere acción manual por ajustes especiales";
    confidence = 20;
  } else if (warningReasons.length > 0) {
    status = "needs_review";
    primaryReason = warningReasons[0].label;
    confidence = 40;
  } else if (infoReasons.length > 0 && grandTotal > 0) {
    status = "auto_approved";
    primaryReason = infoReasons[0].label;
    confidence = withinTolerance ? (absoluteDiff < 0.01 ? 100 : 90) : 70;
  } else {
    // Default: if we have a valid total and no issues, auto-approve
    if (grandTotal > 0 && classification !== "unknown" && !hasConflicts) {
      status = "auto_approved";
      primaryReason = "Auto aprobado: sin problemas detectados";
      confidence = 85;
    } else {
      status = "needs_review";
      primaryReason = "Requiere revisión: estado indeterminado";
      confidence = 30;
    }
  }

  return {
    status,
    reasons,
    primary_reason: primaryReason,
    confidence,
    computed: {
      shift_calculated_total: shiftCalcTotal,
      payroll_reference_total: payrollRef,
      absolute_diff: absoluteDiff,
      percentage_diff: percentageDiff,
      tolerance_used_absolute: tolAbs,
      tolerance_used_percentage: tolPct,
      classification,
      has_rate: hasRate,
      has_conflicts: hasConflicts,
      has_critical_unmapped: hasCriticalUnmapped,
    },
  };
}

/**
 * Run the auto-approval engine across all final records
 */
export function runAutoApproval(
  records: EmployeeFinalRecord[],
  tolerances: ApprovalTolerances = DEFAULT_TOLERANCES
): AutoApprovalSummary {
  const decisions = new Map<string, ApprovalDecision>();
  let auto_approved = 0;
  let needs_review = 0;
  let blocked = 0;
  let manual_action = 0;

  for (const record of records) {
    const decision = evaluateRecord(record, tolerances);
    decisions.set(record.employee_id, decision);

    switch (decision.status) {
      case "auto_approved": auto_approved++; break;
      case "needs_review": needs_review++; break;
      case "blocked": blocked++; break;
      case "manual_action": manual_action++; break;
    }
  }

  const total = records.length;
  return {
    auto_approved,
    needs_review,
    blocked,
    manual_action,
    total,
    auto_approval_rate: total > 0 ? Math.round((auto_approved / total) * 100) : 0,
    decisions,
  };
}
