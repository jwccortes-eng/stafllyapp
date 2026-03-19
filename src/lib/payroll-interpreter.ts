/**
 * Payroll Interpretation Engine
 * 
 * Analyzes payroll Excel rows and classifies payments as:
 * hourly, daily, ride, manual_adjustment, mixed, or unknown.
 * 
 * Uses company_compensation_rules for decomposition logic.
 */

export type InterpretedPaymentType = "hourly" | "daily" | "ride" | "manual_adjustment" | "mixed" | "unknown";

export interface CompanyRule {
  rule_type: string;
  rule_name: string;
  amount: number;
  unit_type: string;
  applies_to_role: string | null;
  applies_to_employee: string | null;
  is_active: boolean;
  priority: number;
}

export interface PayrollRow {
  rowIndex: number;
  employeeName: string;
  hours?: number | null;
  rate?: number | null;
  total: number;
  notes?: string | null;
  rawPayload: Record<string, any>;
}

export interface InterpretedEntry {
  rowIndex: number;
  rawEmployeeName: string;
  rawTotalAmount: number;
  interpretedPaymentType: InterpretedPaymentType;
  detectedHourlyRate: number | null;
  detectedDailyUnits: number | null;
  detectedDailyFullDays: number | null;
  detectedDailyHalfDays: number | null;
  detectedRideType: string | null;
  detectedRideAmount: number | null;
  detectedManualAdjustment: number | null;
  confidenceScore: number;
  interpretationNotes: string;
  suggestedCompensationChange: boolean;
  matchedEmployeeId: string | null;
  rawRowPayload: Record<string, any>;
}

export interface Employee {
  id: string;
  first_name: string | null;
  last_name: string | null;
  employee_role: string | null;
}

/* ── Fuzzy name matching ── */
function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-záéíóúñü\s]/g, "").replace(/\s+/g, " ").trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const partsA = na.split(" ");
  const partsB = nb.split(" ");
  let matches = 0;
  for (const pa of partsA) {
    if (partsB.some(pb => pb === pa || (pa.length > 2 && pb.startsWith(pa)))) matches++;
  }
  const maxParts = Math.max(partsA.length, partsB.length);
  return maxParts > 0 ? matches / maxParts : 0;
}

export function matchEmployee(name: string, employees: Employee[]): { employee: Employee; score: number } | null {
  let best: { employee: Employee; score: number } | null = null;
  for (const emp of employees) {
    const fullName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
    const score = nameSimilarity(name, fullName);
    if (score > (best?.score ?? 0.5)) {
      best = { employee: emp, score };
    }
  }
  return best;
}

/* ── Daily decomposition ── */
export interface DailyDecomposition {
  fullDays: number;
  halfDays: number;
  remainder: number;
  confidence: number;
}

export function decomposeDailyAmount(
  total: number,
  fullDayRate: number,
  halfDayRate: number
): DailyDecomposition | null {
  if (fullDayRate <= 0) return null;

  let bestFit: DailyDecomposition | null = null;
  const maxFull = Math.floor(total / fullDayRate) + 1;

  for (let f = 0; f <= maxFull && f <= 7; f++) {
    const remaining = total - f * fullDayRate;
    if (remaining < 0) break;

    if (remaining === 0) {
      return { fullDays: f, halfDays: 0, remainder: 0, confidence: 100 };
    }

    if (halfDayRate > 0) {
      const h = Math.round(remaining / halfDayRate);
      const computed = f * fullDayRate + h * halfDayRate;
      const diff = Math.abs(total - computed);

      if (diff < 0.01 && h >= 0 && h <= 7) {
        return { fullDays: f, halfDays: h, remainder: 0, confidence: 98 };
      }

      if (diff <= 5 && h >= 0 && h <= 7) {
        const confidence = Math.max(50, 95 - diff * 5);
        if (!bestFit || confidence > bestFit.confidence) {
          bestFit = { fullDays: f, halfDays: h, remainder: diff, confidence };
        }
      }
    }
  }

  return bestFit;
}

/* ── Ride detection ── */
export function detectRide(
  total: number,
  regularRideRate: number,
  specialRideRate: number
): { type: "regular" | "special"; amount: number; confidence: number } | null {
  if (total === regularRideRate) return { type: "regular", amount: total, confidence: 100 };
  if (total === specialRideRate) return { type: "special", amount: total, confidence: 100 };

  if (regularRideRate > 0 && total % regularRideRate === 0 && total / regularRideRate <= 5) {
    return { type: "regular", amount: total, confidence: 90 };
  }
  if (specialRideRate > 0 && total % specialRideRate === 0 && total / specialRideRate <= 5) {
    return { type: "special", amount: total, confidence: 90 };
  }

  return null;
}

/* ── Hourly detection ── */
function detectHourly(row: PayrollRow): { rate: number; hours: number; confidence: number } | null {
  if (row.hours && row.hours > 0 && row.rate && row.rate > 0) {
    return { rate: row.rate, hours: row.hours, confidence: 95 };
  }
  if (row.hours && row.hours > 0 && row.total > 0) {
    const impliedRate = row.total / row.hours;
    if (impliedRate >= 10 && impliedRate <= 200) {
      return { rate: Math.round(impliedRate * 100) / 100, hours: row.hours, confidence: 80 };
    }
  }
  return null;
}

/* ── Main interpreter ── */
export function interpretPayrollRows(
  rows: PayrollRow[],
  rules: CompanyRule[],
  employees: Employee[],
  existingRates: Map<string, number>
): InterpretedEntry[] {
  const dailyFullRules = rules.filter(r => r.rule_type === "daily_full" && r.is_active);
  const dailyHalfRules = rules.filter(r => r.rule_type === "daily_half" && r.is_active);
  const rideRegular = rules.find(r => r.rule_type === "ride_regular" && r.is_active);
  const rideSpecial = rules.find(r => r.rule_type === "ride_special" && r.is_active);

  const defaultFullRate = dailyFullRules[0]?.amount ?? 200;
  const defaultHalfRate = dailyHalfRules[0]?.amount ?? 125;
  const regularRideRate = rideRegular?.amount ?? 100;
  const specialRideRate = rideSpecial?.amount ?? 160;

  return rows.map(row => {
    const match = matchEmployee(row.employeeName, employees);
    const matchedEmployeeId = match?.employee.id ?? null;
    const notes: string[] = [];
    let type: InterpretedPaymentType = "unknown";
    let confidence = 0;
    let detectedHourlyRate: number | null = null;
    let detectedDailyFullDays: number | null = null;
    let detectedDailyHalfDays: number | null = null;
    let detectedDailyUnits: number | null = null;
    let detectedRideType: string | null = null;
    let detectedRideAmount: number | null = null;
    let detectedManualAdjustment: number | null = null;
    let suggestedChange = false;

    if (match) {
      notes.push(`Empleado: ${match.employee.first_name} ${match.employee.last_name} (${(match.score * 100).toFixed(0)}%)`);
    } else {
      notes.push(`⚠ Empleado no encontrado: "${row.employeeName}"`);
    }

    // 1. Try hourly
    const hourly = detectHourly(row);
    if (hourly) {
      type = "hourly";
      confidence = hourly.confidence;
      detectedHourlyRate = hourly.rate;
      notes.push(`Hora: $${hourly.rate} × ${hourly.hours}h`);

      if (matchedEmployeeId) {
        const prevRate = existingRates.get(matchedEmployeeId);
        if (prevRate && Math.abs(prevRate - hourly.rate) > 0.01) {
          suggestedChange = true;
          notes.push(`⚠ Cambio de tarifa detectado: $${prevRate} → $${hourly.rate}`);
        }
      }
    }

    // 2. Try ride
    if (type === "unknown" && row.total > 0) {
      const ride = detectRide(row.total, regularRideRate, specialRideRate);
      if (ride) {
        type = "ride";
        confidence = ride.confidence;
        detectedRideType = ride.type;
        detectedRideAmount = ride.amount;
        notes.push(`Ride ${ride.type}: $${ride.amount}`);
      }
    }

    // 3. Try daily decomposition
    if (type === "unknown" && row.total > 0) {
      // Try employee-specific rules first
      let employeeFullRate = defaultFullRate;
      let employeeHalfRate = defaultHalfRate;

      if (matchedEmployeeId) {
        const empFullRule = dailyFullRules.find(r => r.applies_to_employee === matchedEmployeeId);
        const empHalfRule = dailyHalfRules.find(r => r.applies_to_employee === matchedEmployeeId);
        if (empFullRule) employeeFullRate = empFullRule.amount;
        if (empHalfRule) employeeHalfRate = empHalfRule.amount;
      }

      const decomp = decomposeDailyAmount(row.total, employeeFullRate, employeeHalfRate);
      if (decomp && decomp.confidence >= 60) {
        type = "daily";
        confidence = decomp.confidence;
        detectedDailyFullDays = decomp.fullDays;
        detectedDailyHalfDays = decomp.halfDays;
        detectedDailyUnits = decomp.fullDays + decomp.halfDays * 0.5;
        notes.push(`Día: ${decomp.fullDays}F + ${decomp.halfDays}H = $${row.total} (conf: ${decomp.confidence}%)`);
      }
    }

    // 4. Check for manual adjustment patterns
    if (type === "unknown") {
      const notesStr = (row.notes ?? "").toLowerCase();
      if (notesStr.includes("manual") || notesStr.includes("ajuste") || notesStr.includes("bonus") || notesStr.includes("tip")) {
        type = "manual_adjustment";
        confidence = 70;
        detectedManualAdjustment = row.total;
        notes.push(`Ajuste manual detectado: $${row.total}`);
      }
    }

    // 5. If still unknown, check if it could be mixed
    if (type === "unknown" && row.total > 0) {
      // Could be a combination — low confidence
      type = "unknown";
      confidence = 20;
      notes.push(`No se pudo clasificar: $${row.total}`);
    }

    return {
      rowIndex: row.rowIndex,
      rawEmployeeName: row.employeeName,
      rawTotalAmount: row.total,
      interpretedPaymentType: type,
      detectedHourlyRate,
      detectedDailyUnits,
      detectedDailyFullDays,
      detectedDailyHalfDays,
      detectedRideType,
      detectedRideAmount,
      detectedManualAdjustment,
      confidenceScore: confidence,
      interpretationNotes: notes.join(" | "),
      suggestedCompensationChange: suggestedChange,
      matchedEmployeeId,
      rawRowPayload: row.rawPayload,
    };
  });
}

/* ── Excel sheet detection ── */
export function findPayrollSheet(sheetNames: string[]): string | null {
  for (const name of sheetNames) {
    if (name.toLowerCase().replace(/\s+/g, "") === "payroll") return name;
  }
  for (const name of sheetNames) {
    if (name.toLowerCase().includes("payroll")) return name;
  }
  for (const name of sheetNames) {
    if (name.toLowerCase().includes("nomina") || name.toLowerCase().includes("nómina")) return name;
  }
  return sheetNames[0] ?? null;
}

/* ── Column detection ── */
export interface DetectedColumns {
  employeeCol: number | null;
  hoursCol: number | null;
  rateCol: number | null;
  totalCol: number | null;
  notesCol: number | null;
}

const EMPLOYEE_PATTERNS = /^(name|employee|empleado|nombre|worker|trabajador)$/i;
const HOURS_PATTERNS = /^(hours|hrs|horas|total.?hours|worked.?hours)$/i;
const RATE_PATTERNS = /^(rate|hourly.?rate|tarifa|pay.?rate|precio)$/i;
const TOTAL_PATTERNS = /^(total|amount|monto|pago|pay|total.?pay|salary|salario)$/i;
const NOTES_PATTERNS = /^(notes|notas|comments|comentarios|obs|observaciones)$/i;

export function detectColumns(headers: string[]): DetectedColumns {
  const result: DetectedColumns = {
    employeeCol: null,
    hoursCol: null,
    rateCol: null,
    totalCol: null,
    notesCol: null,
  };

  headers.forEach((h, i) => {
    const clean = h.trim();
    if (EMPLOYEE_PATTERNS.test(clean)) result.employeeCol = i;
    else if (HOURS_PATTERNS.test(clean)) result.hoursCol = i;
    else if (RATE_PATTERNS.test(clean)) result.rateCol = i;
    else if (TOTAL_PATTERNS.test(clean)) result.totalCol = i;
    else if (NOTES_PATTERNS.test(clean)) result.notesCol = i;
  });

  // Fallback: first text column as employee, last numeric-looking column as total
  if (result.employeeCol === null) result.employeeCol = 0;
  if (result.totalCol === null) {
    for (let i = headers.length - 1; i >= 0; i--) {
      if (!EMPLOYEE_PATTERNS.test(headers[i]?.trim())) {
        result.totalCol = i;
        break;
      }
    }
  }

  return result;
}

/* ── Parse rows from raw sheet data ── */
export function parsePayrollRows(
  sheetData: any[][],
  columns: DetectedColumns,
  headerRowIndex: number
): PayrollRow[] {
  const rows: PayrollRow[] = [];

  for (let i = headerRowIndex + 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || row.length === 0) continue;

    const empName = columns.employeeCol !== null ? String(row[columns.employeeCol] ?? "").trim() : "";
    if (!empName || empName.length < 2) continue;

    const total = columns.totalCol !== null ? Number(row[columns.totalCol]) || 0 : 0;
    if (total === 0) continue;

    rows.push({
      rowIndex: i + 1,
      employeeName: empName,
      hours: columns.hoursCol !== null ? Number(row[columns.hoursCol]) || null : null,
      rate: columns.rateCol !== null ? Number(row[columns.rateCol]) || null : null,
      total,
      notes: columns.notesCol !== null ? String(row[columns.notesCol] ?? "") : null,
      rawPayload: Object.fromEntries(row.map((v: any, ci: number) => [String(ci), v])),
    });
  }

  return rows;
}
