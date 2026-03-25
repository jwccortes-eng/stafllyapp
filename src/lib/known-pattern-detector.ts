/**
 * Known Pattern Detector
 * 
 * Identifies recurring mismatch patterns across payroll closes
 * and suggests auto-resolutions based on historical learnings.
 * 
 * HARD RULES (never auto-resolve):
 * - Scheduled hours must NEVER be used for payroll amounts
 * - Truth file is authoritative in truth-based closure mode
 * - Only clocked hours, truth amounts, or approved manual adjustments for pay
 */

export interface DetectedPattern {
  patternKey: string;
  patternLabel: string;
  description: string;
  affectedEmployeeIds: string[];
  suggestedResolution: "approve" | "flag" | "suppress" | null;
  confidence: number; // 0-100
}

interface RecordForAnalysis {
  employee_id: string;
  employee_name?: string;
  grand_total: number;
  source_payroll_total: number;
  base_pay: number;
  total_scheduled_hours: number;
  total_worked_hours: number;
  shift_calculation_source: string;
  reconciliation_status: string;
  warnings: string[];
  scheduled_shifts: any[];
  worked_shifts: any[];
  payroll_rows: any[];
}

/**
 * Detect known patterns in a set of reconciliation records.
 * Each pattern maps to a durable business rule.
 */
export function detectKnownPatterns(records: RecordForAnalysis[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Pattern 1: System inferred > Truth with no operational evidence
  // This is the "Jonathan Lopez" pattern — bogus clock inflates system amount
  const truthOverrideCandidates = records.filter(r =>
    r.shift_calculation_source === "truth_validation" &&
    r.source_payroll_total > 0 &&
    r.grand_total > r.source_payroll_total * 1.5 &&
    ((r.scheduled_shifts || []).length + (r.worked_shifts || []).length + (r.payroll_rows || []).length) === 0
  );
  if (truthOverrideCandidates.length > 0) {
    patterns.push({
      patternKey: "system_inflated_no_evidence",
      patternLabel: "Sistema inflado sin evidencia operativa",
      description: `${truthOverrideCandidates.length} empleado(s) donde el monto del sistema excede significativamente el truth pagado sin registros operativos respaldando el monto del sistema. Resolución: usar Truth como cierre.`,
      affectedEmployeeIds: truthOverrideCandidates.map(r => r.employee_id),
      suggestedResolution: "approve",
      confidence: 95,
    });
  }

  // Pattern 2: Exact match with evidence — auto-approvable
  const exactWithEvidence = records.filter(r =>
    Math.abs(r.grand_total - r.source_payroll_total) < 1 &&
    r.source_payroll_total > 0 &&
    ((r.scheduled_shifts || []).length + (r.worked_shifts || []).length + (r.payroll_rows || []).length) > 0
  );
  if (exactWithEvidence.length > 0) {
    patterns.push({
      patternKey: "exact_match_with_evidence",
      patternLabel: "Coincidencia exacta con evidencia",
      description: `${exactWithEvidence.length} empleado(s) con coincidencia exacta entre sistema y truth, respaldada por registros operativos.`,
      affectedEmployeeIds: exactWithEvidence.map(r => r.employee_id),
      suggestedResolution: "approve",
      confidence: 99,
    });
  }

  // Pattern 3: Identity only — employee mapped but zero data
  const identityOnly = records.filter(r =>
    r.grand_total === 0 &&
    r.source_payroll_total === 0 &&
    ((r.scheduled_shifts || []).length + (r.worked_shifts || []).length + (r.payroll_rows || []).length) === 0
  );
  if (identityOnly.length > 0) {
    patterns.push({
      patternKey: "identity_only_no_data",
      patternLabel: "Identidad sin datos",
      description: `${identityOnly.length} empleado(s) mapeados pero sin ningún dato financiero u operativo en el periodo.`,
      affectedEmployeeIds: identityOnly.map(r => r.employee_id),
      suggestedResolution: "suppress",
      confidence: 90,
    });
  }

  // Pattern 4: Minor variance within tolerance ($10 / 5%)
  const minorVariance = records.filter(r => {
    const delta = Math.abs(r.grand_total - r.source_payroll_total);
    const pct = r.source_payroll_total > 0 ? delta / r.source_payroll_total : 0;
    return delta > 0.01 && delta <= 10 && pct <= 0.05 && r.source_payroll_total > 0;
  });
  if (minorVariance.length > 0) {
    patterns.push({
      patternKey: "minor_variance_within_tolerance",
      patternLabel: "Varianza menor dentro de tolerancia",
      description: `${minorVariance.length} empleado(s) con varianza ≤$10 / ≤5%. Probable redondeo o diferencia de timing.`,
      affectedEmployeeIds: minorVariance.map(r => r.employee_id),
      suggestedResolution: "approve",
      confidence: 85,
    });
  }

  // Pattern 5: Anomalous clock entries detected
  const anomalous = records.filter(r =>
    r.warnings?.some((w: string) => w.includes("anomal") || w.includes("excede") || w.includes("16h") || w.includes("3x"))
  );
  if (anomalous.length > 0) {
    patterns.push({
      patternKey: "anomalous_clock_entries",
      patternLabel: "Fichajes anómalos detectados",
      description: `${anomalous.length} empleado(s) con fichajes que exceden 16h o 3x la duración programada. Estos fichajes se han excluido del cálculo de nómina.`,
      affectedEmployeeIds: anomalous.map(r => r.employee_id),
      suggestedResolution: "flag",
      confidence: 90,
    });
  }

  return patterns;
}
