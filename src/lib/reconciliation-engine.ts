/**
 * Staged Reconciliation Engine
 * Handles normalization, employee matching, shift matching,
 * payroll classification, and confidence scoring.
 */

// ─── Text Normalization ───
export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/\s+/g, " ");
}

export function normalizePhone(p: string | null | undefined): string {
  if (!p) return "";
  return p.replace(/[^\d]/g, "").replace(/^1(\d{10})$/, "$1");
}

export function normalizeEmail(e: string | null | undefined): string {
  if (!e) return "";
  return e.toLowerCase().trim();
}

export function hashRow(obj: Record<string, any>): string {
  const sorted = Object.keys(obj).sort().map(k => `${k}:${obj[k] ?? ""}`).join("|");
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) - hash + sorted.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── Employee Matching ───
export interface EmployeeRecord {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  external_id?: string | null;
  connecteam_id?: string | null;
}

export interface EmployeeMatchResult {
  employee_id: string | null;
  confidence: number;
  method: string;
  ambiguous: boolean;
  candidates: Array<{ id: string; name: string; confidence: number; method: string }>;
}

function fuzzyNameScore(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const aParts = a.split(" ").filter(Boolean);
  const bParts = b.split(" ").filter(Boolean);
  let matched = 0;
  const used = new Set<number>();
  for (const ap of aParts) {
    for (let i = 0; i < bParts.length; i++) {
      if (used.has(i)) continue;
      if (bParts[i] === ap || bParts[i].startsWith(ap) || ap.startsWith(bParts[i])) {
        matched++;
        used.add(i);
        break;
      }
    }
  }
  const total = Math.max(aParts.length, bParts.length);
  return total > 0 ? matched / total : 0;
}

export function matchEmployee(
  nameRaw: string | null,
  phone: string | null,
  email: string | null,
  externalId: string | null,
  employees: EmployeeRecord[]
): EmployeeMatchResult {
  const candidates: EmployeeMatchResult["candidates"] = [];
  const normName = normalizeText(nameRaw);
  const normPhone = normalizePhone(phone);
  const normEmail = normalizeEmail(email);

  for (const emp of employees) {
    const empName = normalizeText(`${emp.first_name} ${emp.last_name}`);
    const empPhone = normalizePhone(emp.phone);
    const empEmail = normalizeEmail(emp.email);

    // Priority 1: External/Connecteam ID
    if (externalId && (emp.external_id === externalId || emp.connecteam_id === externalId)) {
      candidates.push({ id: emp.id, name: `${emp.first_name} ${emp.last_name}`, confidence: 1.0, method: "external_id" });
      continue;
    }
    // Priority 2: Phone
    if (normPhone && empPhone && normPhone === empPhone) {
      candidates.push({ id: emp.id, name: `${emp.first_name} ${emp.last_name}`, confidence: 0.95, method: "phone" });
      continue;
    }
    // Priority 3: Email
    if (normEmail && empEmail && normEmail === empEmail) {
      candidates.push({ id: emp.id, name: `${emp.first_name} ${emp.last_name}`, confidence: 0.90, method: "email" });
      continue;
    }
    // Priority 4: Exact name
    if (normName && empName && normName === empName) {
      candidates.push({ id: emp.id, name: `${emp.first_name} ${emp.last_name}`, confidence: 0.75, method: "exact_name" });
      continue;
    }
    // Priority 5: Fuzzy name
    if (normName && empName) {
      const score = fuzzyNameScore(normName, empName);
      if (score >= 0.6) {
        candidates.push({ id: emp.id, name: `${emp.first_name} ${emp.last_name}`, confidence: score * 0.6, method: "fuzzy_name" });
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  if (candidates.length === 0) {
    return { employee_id: null, confidence: 0, method: "none", ambiguous: false, candidates: [] };
  }
  if (candidates.length === 1 || candidates[0].confidence >= 0.75) {
    return {
      employee_id: candidates[0].id,
      confidence: candidates[0].confidence,
      method: candidates[0].method,
      ambiguous: candidates.length > 1 && candidates[1].confidence > 0.5,
      candidates,
    };
  }
  // Multiple candidates, ambiguous
  return {
    employee_id: candidates[0].id,
    confidence: candidates[0].confidence,
    method: candidates[0].method,
    ambiguous: true,
    candidates,
  };
}

// ─── Shift Matching ───
export interface NormalizedScheduleRow {
  id: string;
  matched_employee_id: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
  client_name: string | null;
  location_name: string | null;
  external_shift_id: string | null;
}

export interface NormalizedClockRow {
  id: string;
  matched_employee_id: string | null;
  work_date: string | null;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  location_name: string | null;
  client_name: string | null;
  external_clock_id: string | null;
}

export interface NormalizedPayrollRow {
  id: string;
  matched_employee_id: string | null;
  work_date: string | null;
  total_hours: number | null;
  total_pay: number | null;
  pay_type: string | null;
}

export interface ShiftMatchResult {
  schedule_id: string | null;
  clock_id: string | null;
  payroll_id: string | null;
  employee_id: string | null;
  confidence: number;
  match_type: "schedule_clock" | "clock_payroll" | "schedule_payroll" | "three_way";
  match_status: "exact" | "probable" | "ambiguous" | "unmatched";
  hours_variance: number | null;
  pay_variance: number | null;
  conflict_flags: string[];
}

export function matchScheduleToClock(
  schedules: NormalizedScheduleRow[],
  clocks: NormalizedClockRow[]
): ShiftMatchResult[] {
  const results: ShiftMatchResult[] = [];
  const usedClocks = new Set<string>();

  for (const sched of schedules) {
    if (!sched.matched_employee_id) continue;
    let bestMatch: { clock: NormalizedClockRow; score: number; flags: string[] } | null = null;

    for (const clock of clocks) {
      if (usedClocks.has(clock.id)) continue;
      if (clock.matched_employee_id !== sched.matched_employee_id) continue;

      let score = 0;
      const flags: string[] = [];

      // Date match
      if (sched.work_date && clock.work_date) {
        if (sched.work_date === clock.work_date) score += 40;
        else {
          // Midnight split: check +/- 1 day
          const sd = new Date(sched.work_date);
          const cd = new Date(clock.work_date);
          const diff = Math.abs(sd.getTime() - cd.getTime()) / 86400000;
          if (diff <= 1) { score += 20; flags.push("midnight_split"); }
          else continue;
        }
      } else continue;

      // Location/client match
      if (sched.location_name && clock.location_name &&
          normalizeText(sched.location_name) === normalizeText(clock.location_name)) {
        score += 20;
      } else if (sched.client_name && clock.client_name &&
                 normalizeText(sched.client_name) === normalizeText(clock.client_name)) {
        score += 15;
      }

      // Time match
      if (sched.start_time && clock.clock_in) {
        const schedStart = sched.start_time.substring(0, 5);
        const clockStart = clock.clock_in.substring(11, 16);
        if (schedStart === clockStart) score += 20;
        else score += 10;
      }

      // Hours match
      if (sched.total_hours && clock.total_hours) {
        const diff = Math.abs(sched.total_hours - clock.total_hours);
        if (diff <= 0.25) score += 20;
        else if (diff <= 1) { score += 10; flags.push("hours_mismatch"); }
        else flags.push("hours_mismatch");
      }

      if (score > (bestMatch?.score ?? 0)) {
        bestMatch = { clock, score, flags };
      }
    }

    if (bestMatch && bestMatch.score >= 40) {
      usedClocks.add(bestMatch.clock.id);
      const hoursVar = (sched.total_hours && bestMatch.clock.total_hours)
        ? bestMatch.clock.total_hours - sched.total_hours : null;
      results.push({
        schedule_id: sched.id,
        clock_id: bestMatch.clock.id,
        payroll_id: null,
        employee_id: sched.matched_employee_id,
        confidence: Math.min(bestMatch.score, 100),
        match_type: "schedule_clock",
        match_status: bestMatch.score >= 80 ? "exact" : bestMatch.score >= 60 ? "probable" : "ambiguous",
        hours_variance: hoursVar,
        pay_variance: null,
        conflict_flags: bestMatch.flags,
      });
    } else {
      results.push({
        schedule_id: sched.id, clock_id: null, payroll_id: null,
        employee_id: sched.matched_employee_id, confidence: 0,
        match_type: "schedule_clock", match_status: "unmatched",
        hours_variance: null, pay_variance: null,
        conflict_flags: ["unmatched_schedule"],
      });
    }
  }

  // Orphan clocks (no schedule)
  for (const clock of clocks) {
    if (usedClocks.has(clock.id)) continue;
    results.push({
      schedule_id: null, clock_id: clock.id, payroll_id: null,
      employee_id: clock.matched_employee_id, confidence: 0,
      match_type: "schedule_clock", match_status: "unmatched",
      hours_variance: null, pay_variance: null,
      conflict_flags: ["clock_without_schedule"],
    });
  }

  return results;
}

// ─── Payroll Classification ───
export type PayrollType = "hourly" | "daily" | "weekend_job" | "pay_ride" | "manual_adjustment" | "mixed" | "unknown";

export interface PayrollClassification {
  pay_type: PayrollType;
  base_pay: number;
  ride_amount: number;
  weekend_amount: number;
  manual_amount: number;
  confidence: number;
  notes: string;
}

const DAILY_FULL = 200;
const DAILY_HALF = 125;
const RIDE_REGULAR = 100;
const RIDE_SPECIAL = 160;

export function classifyPayrollRow(row: Record<string, any>): PayrollClassification {
  const totalPay = parseFloat(row["Total pay"] || row["total_pay"] || row["TotalPay"] || "0") || 0;
  const totalHours = parseFloat(row["Total hours"] || row["total_hours"] || row["TotalHours"] || "0") || 0;
  const jobTitle = normalizeText(row["Job title"] || row["job_title"] || row["Job"] || "");
  const shiftTitle = normalizeText(row["Shift title"] || row["shift_title"] || row["Shift"] || "");

  // Ride detection
  if (totalPay === RIDE_REGULAR || totalPay === RIDE_SPECIAL || jobTitle.includes("ride") || shiftTitle.includes("ride")) {
    return { pay_type: "pay_ride", base_pay: 0, ride_amount: totalPay, weekend_amount: 0, manual_amount: 0, confidence: 90, notes: "Detected as ride payment" };
  }

  // Weekend job detection
  if (jobTitle.includes("weekend") || shiftTitle.includes("weekend")) {
    return { pay_type: "weekend_job", base_pay: 0, ride_amount: 0, weekend_amount: totalPay, manual_amount: 0, confidence: 85, notes: "Weekend job detected" };
  }

  // Daily pay detection
  if (totalPay === DAILY_FULL || totalPay === DAILY_HALF) {
    return { pay_type: "daily", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 85, notes: `Daily rate: $${totalPay}` };
  }
  if (totalPay > 0 && totalPay % DAILY_FULL === 0) {
    return { pay_type: "daily", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 75, notes: `Multiple daily: ${totalPay / DAILY_FULL} days` };
  }

  // Hourly detection
  if (totalHours > 0 && totalPay > 0) {
    const impliedRate = totalPay / totalHours;
    if (impliedRate >= 10 && impliedRate <= 100) {
      return { pay_type: "hourly", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 80, notes: `Hourly @ $${impliedRate.toFixed(2)}/hr` };
    }
  }

  // Manual adjustment detection (odd amounts, no hours)
  if (totalPay > 0 && totalHours === 0) {
    return { pay_type: "manual_adjustment", base_pay: 0, ride_amount: 0, weekend_amount: 0, manual_amount: totalPay, confidence: 60, notes: "Possible manual adjustment (no hours)" };
  }

  return { pay_type: "unknown", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 30, notes: "Could not classify" };
}

// ─── Column Detection ───
export interface ColumnMapping {
  employee_name?: string;
  employee_phone?: string;
  employee_email?: string;
  external_id?: string;
  work_date?: string;
  start_time?: string;
  end_time?: string;
  clock_in?: string;
  clock_out?: string;
  total_hours?: string;
  total_pay?: string;
  hourly_rate?: string;
  job_title?: string;
  shift_title?: string;
  client_name?: string;
  location_name?: string;
}

const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  employee_name: ["employee", "name", "worker", "full name", "nombre", "empleado", "user"],
  employee_phone: ["phone", "mobile", "tel", "telefono", "celular"],
  employee_email: ["email", "correo", "e-mail"],
  external_id: ["id", "employee id", "external id", "connecteam id", "user id"],
  work_date: ["date", "shift date", "work date", "fecha", "day"],
  start_time: ["start", "start time", "hora inicio", "check in", "scheduled start"],
  end_time: ["end", "end time", "hora fin", "check out", "scheduled end"],
  clock_in: ["clock in", "actual start", "entrada", "check-in", "punch in"],
  clock_out: ["clock out", "actual end", "salida", "check-out", "punch out"],
  total_hours: ["hours", "total hours", "worked hours", "horas", "duration", "total time"],
  total_pay: ["total pay", "pay", "total", "amount", "pago", "monto", "gross"],
  hourly_rate: ["rate", "hourly rate", "pay rate", "tarifa"],
  job_title: ["job", "job title", "puesto", "position", "rol"],
  shift_title: ["shift", "shift title", "turno", "shift name"],
  client_name: ["client", "customer", "cliente", "account"],
  location_name: ["location", "site", "ubicacion", "place", "address"],
};

export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normHeaders = headers.map(h => normalizeText(h));

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof ColumnMapping, string[]][]) {
    for (let i = 0; i < normHeaders.length; i++) {
      const nh = normHeaders[i];
      if (aliases.some(a => nh === a || nh.includes(a))) {
        if (!mapping[field]) {
          mapping[field] = headers[i];
        }
      }
    }
  }

  return mapping;
}

// ─── Deduplication ───
export function detectDuplicates<T extends { row_hash?: string }>(rows: T[]): Map<number, boolean> {
  const seen = new Map<string, number>();
  const dupes = new Map<number, boolean>();

  rows.forEach((row, idx) => {
    const hash = row.row_hash || "";
    if (!hash) { dupes.set(idx, false); return; }
    if (seen.has(hash)) {
      dupes.set(idx, true);
      dupes.set(seen.get(hash)!, false); // first occurrence is not a dupe
    } else {
      seen.set(hash, idx);
      dupes.set(idx, false);
    }
  });

  return dupes;
}
