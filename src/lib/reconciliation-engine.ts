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
  is_active?: boolean;
  hire_date?: string | null;
  termination_date?: string | null;
  employee_role?: string | null;
}

export type EmployeeMatchStatus =
  | "matched_active_employee"
  | "matched_inactive_employee"
  | "matched_historical_employee"
  | "likely_alias_match"
  | "true_missing_employee"
  | "ignored_system_row"
  | "ambiguous_match";

export interface EmployeeMatchResult {
  employee_id: string | null;
  confidence: number;
  method: string;
  match_status: EmployeeMatchStatus;
  ambiguous: boolean;
  candidates: Array<{ id: string; name: string; confidence: number; method: string; is_active?: boolean }>;
}

function fuzzyNameScore(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  // Try both orderings (handles first/last name inversion)
  const score1 = _partScore(a, b);
  const aParts = a.split(" ").filter(Boolean);
  const reversed = [...aParts].reverse().join(" ");
  const score2 = reversed !== a ? _partScore(reversed, b) : 0;
  return Math.max(score1, score2);
}

function _partScore(a: string, b: string): number {
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
    const fullName = `${emp.first_name} ${emp.last_name}`;

    // Priority 1: External/Connecteam ID
    if (externalId && (emp.external_id === externalId || emp.connecteam_id === externalId)) {
      candidates.push({ id: emp.id, name: fullName, confidence: 1.0, method: "external_id", is_active: emp.is_active });
      continue;
    }
    // Priority 2: Phone
    if (normPhone && empPhone && normPhone === empPhone) {
      candidates.push({ id: emp.id, name: fullName, confidence: 0.95, method: "phone", is_active: emp.is_active });
      continue;
    }
    // Priority 3: Email
    if (normEmail && empEmail && normEmail === empEmail) {
      candidates.push({ id: emp.id, name: fullName, confidence: 0.90, method: "email", is_active: emp.is_active });
      continue;
    }
    // Priority 4: Exact name
    if (normName && empName && normName === empName) {
      candidates.push({ id: emp.id, name: fullName, confidence: 0.75, method: "exact_name", is_active: emp.is_active });
      continue;
    }
    // Priority 5: Fuzzy name
    if (normName && empName) {
      const score = fuzzyNameScore(normName, empName);
      if (score >= 0.6) {
        candidates.push({ id: emp.id, name: fullName, confidence: score * 0.6, method: "fuzzy_name", is_active: emp.is_active });
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  if (candidates.length === 0) {
    return { employee_id: null, confidence: 0, method: "none", match_status: "true_missing_employee", ambiguous: false, candidates: [] };
  }

  const top = candidates[0];
  const isAmbiguous = candidates.length > 1 && (
    (top.confidence < 0.75) || (candidates[1].confidence > 0.5)
  );

  if (isAmbiguous && top.confidence < 0.75) {
    return {
      employee_id: top.id,
      confidence: top.confidence,
      method: top.method,
      match_status: "ambiguous_match",
      ambiguous: true,
      candidates,
    };
  }

  // Determine match status based on employee active state
  const matchStatus: EmployeeMatchStatus = top.is_active === false
    ? "matched_inactive_employee"
    : "matched_active_employee";

  return {
    employee_id: top.id,
    confidence: top.confidence,
    method: top.method,
    match_status: matchStatus,
    ambiguous: isAmbiguous,
    candidates,
  };
}

// ─── Pay Modifier Detection ───
// PAGA DOBLE / DOUBLE PAY is a pay modifier, NOT a separate category.
// These rows are normal worked shifts that happen to pay double.
const PAGA_DOBLE_PATTERN = /\b(paga\s*doble|double\s*pay|doble\s*pago)\b/i;
// Strip numeric prefix + PAGA DOBLE from title to get the underlying shift identity
const PAGA_DOBLE_TITLE_STRIP = /^(\d+\s*[-–—]?\s*)?(paga\s*doble|double\s*pay|doble\s*pago)\s*/i;

/** Returns true if a title/label contains a double-pay modifier */
export function hasDoublePay(text: string | null | undefined): boolean {
  return !!text && PAGA_DOBLE_PATTERN.test(text);
}

/** Strip PAGA DOBLE and numeric prefixes to get the base shift title for matching */
export function stripPayModifiers(title: string | null | undefined): string {
  if (!title) return "";
  return title.replace(PAGA_DOBLE_TITLE_STRIP, "").replace(/^\s*[-–—]\s*/, "").trim();
}

// ─── Compensation Category Detection ───
export type ShiftCategory = "hourly" | "daily_pay" | "ride_pay" | "availability_block" | "regular";

// Expanded patterns to match real Connecteam export variants
const WEEKEND_JOB_PATTERN = /\b(weekend\s*(job|shift)|wj|trabajo\s*de?\s*fin\s*de?\s*semana)\b/i;
const PAY_RIDE_PATTERN = /\b(pay\s*ride|ride\s*pay|payride|transporte|transportation)\b/i;
// Also match "99 - PAY RIDE" style prefixed titles
const PAY_RIDE_PREFIXED = /^\d+\s*[-–—]\s*pay\s*ride/i;

// Non-work / availability-blocking schedule rows from Connecteam
const AVAILABILITY_BLOCK_PATTERN = /\b(unavailable|no\s*disponible|shift\s*block(ing)?|block(ed|ing)\s*(shift|schedule)?|breaking\s*policy|policy\s*block|monitoring|no[- ]?show\s*block(ing)?|not\s*available|day\s*off|off\s*day|blocked|休|disponibilidad|bloqueo|restricci[oó]n)\b/i;

export function detectShiftCategory(
  jobTitle: string | null | undefined,
  shiftTitle: string | null | undefined,
  clientName: string | null | undefined,
  locationName: string | null | undefined,
  notes?: string | null,
): ShiftCategory {
  const fields = [jobTitle, shiftTitle, clientName, locationName, notes].map(f => (f || ""));
  const combined = fields.join(" ");
  // Check availability/blocking FIRST — these are not real work
  if (AVAILABILITY_BLOCK_PATTERN.test(combined)) return "availability_block";
  // Strip PAGA DOBLE before checking other categories — it's just a pay modifier
  const strippedCombined = fields.map(f => stripPayModifiers(f) || f).join(" ");
  if (WEEKEND_JOB_PATTERN.test(strippedCombined)) return "daily_pay";
  if (PAY_RIDE_PATTERN.test(strippedCombined)) return "ride_pay";
  // Check shift_title specifically for prefixed patterns like "99 - PAY RIDE"
  const strippedTitle = stripPayModifiers(shiftTitle);
  if (strippedTitle && PAY_RIDE_PREFIXED.test(strippedTitle.trim())) return "ride_pay";
  return "regular";
}

export function isClockExemptCategory(cat: ShiftCategory): boolean {
  return cat === "daily_pay" || cat === "ride_pay" || cat === "availability_block";
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
  job_title?: string | null;
  shift_title?: string | null;
  notes?: string | null;
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
  notes?: string | null;
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
    // Detect special compensation BEFORE employee check — these categories
    // are valid even without a matched employee (e.g. Weekend shift, Pay Ride)
    const category = detectShiftCategory(sched.job_title, sched.shift_title, sched.client_name, sched.location_name, sched.notes);

    // Check if this is a double-pay modifier (PAGA DOBLE) — NOT clock-exempt
    const isDoublePay = hasDoublePay(sched.shift_title) || hasDoublePay(sched.job_title);

    if (isClockExemptCategory(category)) {
      const label = category === "daily_pay" ? "daily_pay_weekend_job" : category === "ride_pay" ? "ride_pay" : "availability_block";
      const flags = [label, "clock_exempt"];
      if (isDoublePay) flags.push("double_pay");
      results.push({
        schedule_id: sched.id,
        clock_id: null,
        payroll_id: null,
        employee_id: sched.matched_employee_id,
        confidence: 95,
        match_type: "schedule_clock",
        match_status: "exact",
        hours_variance: null,
        pay_variance: null,
        conflict_flags: flags,
      });
      continue;
    }

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
      const matchFlags = [...bestMatch.flags];
      if (isDoublePay) matchFlags.push("double_pay");
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
        conflict_flags: matchFlags,
      });
    } else {
      const unmatchedFlags: string[] = ["unmatched_schedule"];
      if (isDoublePay) unmatchedFlags.push("double_pay");
      results.push({
        schedule_id: sched.id, clock_id: null, payroll_id: null,
        employee_id: sched.matched_employee_id, confidence: 0,
        match_type: "schedule_clock", match_status: "unmatched",
        hours_variance: null, pay_variance: null,
        conflict_flags: unmatchedFlags,
      });
    }
  }

  // Orphan clocks (no schedule) — also check if clock itself is a compensation category
  for (const clock of clocks) {
    if (usedClocks.has(clock.id)) continue;
    const clockCat = detectShiftCategory(null, null, clock.client_name, clock.location_name, clock.notes);
    if (isClockExemptCategory(clockCat)) {
      const label = clockCat === "daily_pay" ? "daily_pay_weekend_job" : clockCat === "ride_pay" ? "ride_pay" : "availability_block";
      results.push({
        schedule_id: null, clock_id: clock.id, payroll_id: null,
        employee_id: clock.matched_employee_id, confidence: 90,
        match_type: "schedule_clock", match_status: "exact",
        hours_variance: null, pay_variance: null,
        conflict_flags: [label, "clock_exempt"],
      });
      continue;
    }
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

// Known manual-adjustment keywords in notes/job fields
const MANUAL_KEYWORDS = /\b(bonus|tip|propina|ajuste|manual|reimburs|reintegro|descuento|deduccion)\b/i;

export function classifyPayrollRow(row: Record<string, any>): PayrollClassification {
  const totalPay = parseFloat(row["Total pay"] || row["total_pay"] || row["TotalPay"] || "0") || 0;
  const totalHours = parseFloat(row["Total hours"] || row["total_hours"] || row["TotalHours"] || "0") || 0;
  const jobTitle = normalizeText(row["Job title"] || row["job_title"] || row["Job"] || "");
  const shiftTitle = normalizeText(row["Shift title"] || row["shift_title"] || row["Shift"] || "");
  const notesField = (row["Notes"] || row["notes"] || row["Employee notes"] || "").toString();

  // 1. Ride detection (by title keyword or exact ride amounts with no hours)
  if (jobTitle.includes("ride") || shiftTitle.includes("ride")) {
    return { pay_type: "pay_ride", base_pay: 0, ride_amount: totalPay, weekend_amount: 0, manual_amount: 0, confidence: 90, notes: "Detected as ride payment (title)" };
  }
  if (totalHours === 0 && (totalPay === RIDE_REGULAR || totalPay === RIDE_SPECIAL)) {
    return { pay_type: "pay_ride", base_pay: 0, ride_amount: totalPay, weekend_amount: 0, manual_amount: 0, confidence: 85, notes: `Ride amount: $${totalPay}` };
  }

  // 2. Weekend job detection
  if (jobTitle.includes("weekend") || shiftTitle.includes("weekend")) {
    return { pay_type: "weekend_job", base_pay: 0, ride_amount: 0, weekend_amount: totalPay, manual_amount: 0, confidence: 85, notes: "Weekend job detected" };
  }

  // 3. Hourly detection (has hours AND pay)
  if (totalHours > 0 && totalPay > 0) {
    const impliedRate = totalPay / totalHours;
    if (impliedRate >= 10 && impliedRate <= 200) {
      return { pay_type: "hourly", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 85, notes: `Hourly @ $${impliedRate.toFixed(2)}/hr × ${totalHours}h` };
    }
  }

  // 4. Daily pay detection (exact or decomposable amounts)
  if (totalPay === DAILY_FULL || totalPay === DAILY_HALF) {
    return { pay_type: "daily", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 85, notes: `Daily rate: $${totalPay}` };
  }
  if (totalPay > 0) {
    // Try daily decomposition: totalPay = F * DAILY_FULL + H * DAILY_HALF
    for (let f = 0; f <= 7; f++) {
      const rem = totalPay - f * DAILY_FULL;
      if (rem < 0) break;
      if (rem === 0 && f > 0) {
        return { pay_type: "daily", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 80, notes: `Daily: ${f} full days = $${totalPay}` };
      }
      if (DAILY_HALF > 0) {
        const h = rem / DAILY_HALF;
        if (h > 0 && h <= 7 && h === Math.round(h)) {
          return { pay_type: "daily", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 78, notes: `Daily: ${f}F + ${h}H = $${totalPay}` };
        }
      }
    }
  }

  // 5. Only classify as manual_adjustment if keywords confirm it
  if (totalPay > 0 && totalHours === 0 && MANUAL_KEYWORDS.test(notesField + " " + jobTitle + " " + shiftTitle)) {
    return { pay_type: "manual_adjustment", base_pay: 0, ride_amount: 0, weekend_amount: 0, manual_amount: totalPay, confidence: 70, notes: "Manual adjustment (keyword match)" };
  }

  // 6. Fallback: unknown (NOT manual_adjustment by default)
  if (totalPay > 0 && totalHours === 0) {
    return { pay_type: "unknown", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 40, notes: "No hours — could not classify (review needed)" };
  }

  return { pay_type: "unknown", base_pay: totalPay, ride_amount: 0, weekend_amount: 0, manual_amount: 0, confidence: 30, notes: "Could not classify" };
}

// ─── Column Detection ───
export interface ColumnMapping {
  employee_name?: string;
  employee_first_name?: string;
  employee_last_name?: string;
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
  notes?: string;
}

// Patterns that are NOTES columns — must be excluded from employee_name matching
const NOTES_EXCLUSION_PATTERNS = [
  /\bnotes?\b/i, /\bcomment/i, /\bobs(ervacion)?/i, /\bnotas?\b/i,
  /\bcomentario/i, /\bdescription/i, /\bdetail/i,
];

function isNotesColumn(header: string): boolean {
  const h = normalizeHeader(header);
  return NOTES_EXCLUSION_PATTERNS.some(p => p.test(h));
}

// Aliases sorted from most specific to least specific per field
const COLUMN_ALIASES: Record<string, string[]> = {
  notes: ["employee notes", "manager notes", "notes", "note", "comments", "notas", "comentarios", "observaciones", "description"],
  employee_first_name: ["first name", "first_name", "nombre", "given name", "primer nombre"],
  employee_last_name: ["last name", "last_name", "apellido", "surname", "family name"],
  employee_name: ["full name", "employee name", "worker name", "nombre completo", "nombre empleado", "empleado", "employee", "worker", "name", "nombre", "user", "users", "person", "staff"],
  employee_phone: ["phone number", "phone", "mobile", "tel", "telefono", "celular"],
  employee_email: ["email address", "email", "correo", "e-mail"],
  external_id: ["connecteam id", "external id", "employee id", "worker id", "user id", "emp id", "employer id"],
  work_date: ["shift date", "work date", "schedule date", "fecha turno", "fecha", "date", "day", "start date"],
  start_time: ["scheduled start", "start time", "hora inicio", "check in", "start"],
  end_time: ["scheduled end", "end time", "hora fin", "check out", "end"],
  clock_in: ["clock in", "actual start", "punch in", "entrada", "check-in", "clock-in", "in"],
  clock_out: ["clock out", "actual end", "punch out", "salida", "check-out", "clock-out", "out"],
  total_hours: ["total hours", "worked hours", "total time", "hours worked", "hours", "horas", "duration", "shift hours"],
  total_pay: ["total pay", "gross pay", "total amount", "total", "amount", "pay", "pago", "monto", "gross"],
  hourly_rate: ["hourly rate", "pay rate", "rate", "tarifa", "hourly rate (usd)"],
  job_title: ["job title", "job name", "job", "puesto", "position", "rol"],
  shift_title: ["shift title", "shift name", "shift", "turno", "scheduled shift title"],
  client_name: ["client name", "client", "customer", "cliente", "account"],
  location_name: ["location name", "location", "site", "ubicacion", "place", "address"],
};

// Field detection priority: detect notes first to prevent stealing, then specific fields, employee_name last
const DETECTION_ORDER: (keyof ColumnMapping)[] = [
  "notes",
  "external_id", "employee_email", "employee_phone",
  "employee_first_name", "employee_last_name",
  "clock_in", "clock_out", "start_time", "end_time",
  "work_date", "total_hours", "total_pay", "hourly_rate",
  "job_title", "shift_title", "client_name", "location_name",
  "employee_name",
];

function normalizeHeader(h: string): string {
  if (!h) return "";
  return h.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normHeaders = headers.map(normalizeHeader);
  const usedIndices = new Set<number>();

  for (const field of DETECTION_ORDER) {
    const aliases = COLUMN_ALIASES[field];
    if (!aliases) continue;
    let bestIdx = -1;
    let bestPriority = Infinity;

    for (let i = 0; i < normHeaders.length; i++) {
      if (usedIndices.has(i)) continue;
      const nh = normHeaders[i];
      if (!nh) continue;

      // For employee_name: skip anything that looks like notes
      if (field === "employee_name" && isNotesColumn(headers[i])) continue;

      for (let a = 0; a < aliases.length; a++) {
        const alias = normalizeHeader(aliases[a]);
        let priority = Infinity;

        // Tier 1: Exact match
        if (nh === alias) {
          priority = a;
        }
        // Tier 2: Header starts with alias
        else if (nh.startsWith(alias + " ") || nh.startsWith(alias)) {
          priority = 100 + a;
        }
        // Tier 3: Header contains alias (only for multi-word aliases to avoid greedy matching)
        else if (alias.includes(" ") && nh.includes(alias)) {
          priority = 200 + a;
        }

        if (priority < bestPriority) {
          bestPriority = priority;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      mapping[field] = headers[bestIdx];
      usedIndices.add(bestIdx);
    }
  }

  return mapping;
}

/**
 * Resolve the employee name from a raw data row using column mapping.
 * Supports combined "employee_name" or separate "first_name" + "last_name".
 */
export function resolveEmployeeName(d: Record<string, any>, colMap: ColumnMapping): string {
  // Try combined name first
  const combined = (d[colMap.employee_name || ""] || "").trim();
  if (combined) return combined;
  // Fall back to first + last
  const first = (d[colMap.employee_first_name || ""] || "").trim();
  const last = (d[colMap.employee_last_name || ""] || "").trim();
  if (first || last) return `${first} ${last}`.trim();
  return "";
}

/**
 * Content-based heuristic: check if a column contains free-text notes rather than person names.
 * Samples a few values and checks for long text, sentences, etc.
 */
export function detectSuspiciousNameColumn(
  rows: Record<string, any>[],
  columnKey: string,
): { suspicious: boolean; reason: string } {
  const sample = rows.slice(0, Math.min(20, rows.length));
  let longTextCount = 0;
  let sentenceCount = 0;
  let emptyCount = 0;

  for (const row of sample) {
    const val = (row[columnKey] || "").toString().trim();
    if (!val) { emptyCount++; continue; }
    if (val.length > 40) longTextCount++;
    if (/\s{2,}|[.!?;]|\bpero\b|\bporque\b|\bpara\b/i.test(val)) sentenceCount++;
  }

  const nonEmpty = sample.length - emptyCount;
  if (nonEmpty === 0) return { suspicious: false, reason: "" };

  if (longTextCount / nonEmpty > 0.3) return { suspicious: true, reason: `${Math.round(longTextCount / nonEmpty * 100)}% de valores tienen >40 chars — parece texto libre, no nombres` };
  if (sentenceCount / nonEmpty > 0.2) return { suspicious: true, reason: `${Math.round(sentenceCount / nonEmpty * 100)}% de valores contienen frases — parece notas/comentarios` };
  return { suspicious: false, reason: "" };
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
