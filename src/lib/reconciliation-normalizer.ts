/**
 * Normalizer: Converts raw imported rows into normalized structures
 * for schedules, clocks, and payroll.
 */
import {
  normalizeText, normalizePhone, normalizeEmail, hashRow,
  matchEmployee, classifyPayrollRow, detectColumns,
  type EmployeeRecord, type ColumnMapping,
} from "./reconciliation-engine";

export interface NormalizationResult<T> {
  normalized: T[];
  warnings: string[];
  errors: string[];
  columnMapping: ColumnMapping;
}

function parseDate(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = val.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // MM/DD/YYYY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${y}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }
  // Try Date.parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return null;
}

function parseTime(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = val.trim();
  // HH:MM or H:MM
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}:${hm[3] || "00"}`;
  // AM/PM
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    if (ampm[3].toLowerCase() === "pm" && h < 12) h += 12;
    if (ampm[3].toLowerCase() === "am" && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${ampm[2]}:00`;
  }
  return null;
}

function parseNumber(val: string | null | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(String(val).replace(/[,$]/g, "").trim());
  return isNaN(n) ? null : n;
}

function parseTimestamp(dateStr: string | null, timeStr: string | null): string | null {
  const d = parseDate(dateStr);
  const t = parseTime(timeStr);
  if (!d) return null;
  return t ? `${d}T${t}` : `${d}T00:00:00`;
}

export function normalizeScheduleRows(
  rawRows: Array<{ id: string; row_number: number; raw_data: Record<string, any> }>,
  employees: EmployeeRecord[]
): NormalizationResult<any> {
  if (rawRows.length === 0) return { normalized: [], warnings: [], errors: [], columnMapping: {} };

  const headers = Object.keys(rawRows[0].raw_data);
  const colMap = detectColumns(headers);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!colMap.employee_name && !colMap.external_id) {
    errors.push("Could not detect employee name or ID column");
  }

  const normalized = rawRows.map(raw => {
    const d = raw.raw_data;
    const nameRaw = d[colMap.employee_name || ""] || "";
    const phone = d[colMap.employee_phone || ""] || null;
    const email = d[colMap.employee_email || ""] || null;
    const extId = d[colMap.external_id || ""] || null;

    const empMatch = matchEmployee(nameRaw, phone, email, extId, employees);
    if (empMatch.ambiguous) warnings.push(`Row ${raw.row_number}: Ambiguous employee match for "${nameRaw}"`);
    if (!empMatch.employee_id) warnings.push(`Row ${raw.row_number}: No employee match for "${nameRaw}"`);

    const workDate = parseDate(d[colMap.work_date || ""]);
    const startTime = parseTime(d[colMap.start_time || ""]);
    const endTime = parseTime(d[colMap.end_time || ""]);
    const totalHours = parseNumber(d[colMap.total_hours || ""]);

    return {
      raw_row_id: raw.id,
      employee_name_raw: nameRaw,
      employee_name_normalized: normalizeText(nameRaw),
      employee_phone: normalizePhone(phone),
      employee_email: normalizeEmail(email),
      matched_employee_id: empMatch.ambiguous ? null : empMatch.employee_id,
      employee_match_confidence: empMatch.confidence,
      employee_match_method: empMatch.method,
      work_date: workDate,
      start_time: startTime,
      end_time: endTime,
      total_hours: totalHours,
      client_name: d[colMap.client_name || ""] || null,
      location_name: d[colMap.location_name || ""] || null,
      shift_title: d[colMap.shift_title || ""] || d[colMap.job_title || ""] || null,
      external_shift_id: extId,
      pay_type: "unknown",
      has_conflict: empMatch.ambiguous,
      conflict_details: empMatch.ambiguous ? { candidates: empMatch.candidates } : null,
    };
  });

  return { normalized, warnings, errors, columnMapping: colMap };
}

export function normalizeClockRows(
  rawRows: Array<{ id: string; row_number: number; raw_data: Record<string, any> }>,
  employees: EmployeeRecord[]
): NormalizationResult<any> {
  if (rawRows.length === 0) return { normalized: [], warnings: [], errors: [], columnMapping: {} };

  const headers = Object.keys(rawRows[0].raw_data);
  const colMap = detectColumns(headers);
  const warnings: string[] = [];
  const errors: string[] = [];

  const normalized = rawRows.map(raw => {
    const d = raw.raw_data;
    const nameRaw = d[colMap.employee_name || ""] || "";
    const phone = d[colMap.employee_phone || ""] || null;
    const email = d[colMap.employee_email || ""] || null;
    const extId = d[colMap.external_id || ""] || null;

    const empMatch = matchEmployee(nameRaw, phone, email, extId, employees);
    if (empMatch.ambiguous) warnings.push(`Row ${raw.row_number}: Ambiguous employee match for "${nameRaw}"`);

    const workDate = parseDate(d[colMap.work_date || ""]);
    const clockIn = parseTimestamp(d[colMap.work_date || ""], d[colMap.clock_in || ""] || d[colMap.start_time || ""]);
    const clockOut = parseTimestamp(d[colMap.work_date || ""], d[colMap.clock_out || ""] || d[colMap.end_time || ""]);
    const totalHours = parseNumber(d[colMap.total_hours || ""]);

    return {
      raw_row_id: raw.id,
      employee_name_raw: nameRaw,
      employee_name_normalized: normalizeText(nameRaw),
      employee_phone: normalizePhone(phone),
      employee_email: normalizeEmail(email),
      matched_employee_id: empMatch.ambiguous ? null : empMatch.employee_id,
      employee_match_confidence: empMatch.confidence,
      employee_match_method: empMatch.method,
      work_date: workDate,
      clock_in: clockIn,
      clock_out: clockOut,
      total_hours: totalHours,
      break_minutes: 0,
      location_name: d[colMap.location_name || ""] || null,
      client_name: d[colMap.client_name || ""] || null,
      external_clock_id: extId,
      clock_method: "import",
      has_conflict: empMatch.ambiguous,
      conflict_details: empMatch.ambiguous ? { candidates: empMatch.candidates } : null,
    };
  });

  return { normalized, warnings, errors, columnMapping: colMap };
}

export function normalizePayrollRows(
  rawRows: Array<{ id: string; row_number: number; raw_data: Record<string, any> }>,
  employees: EmployeeRecord[]
): NormalizationResult<any> {
  if (rawRows.length === 0) return { normalized: [], warnings: [], errors: [], columnMapping: {} };

  const headers = Object.keys(rawRows[0].raw_data);
  const colMap = detectColumns(headers);
  const warnings: string[] = [];
  const errors: string[] = [];

  const normalized = rawRows.map(raw => {
    const d = raw.raw_data;
    const nameRaw = d[colMap.employee_name || ""] || "";
    const phone = d[colMap.employee_phone || ""] || null;
    const email = d[colMap.employee_email || ""] || null;
    const extId = d[colMap.external_id || ""] || null;

    const empMatch = matchEmployee(nameRaw, phone, email, extId, employees);
    const classification = classifyPayrollRow(d);

    const workDate = parseDate(d[colMap.work_date || ""]);
    const totalHours = parseNumber(d[colMap.total_hours || ""]);
    const hourlyRate = parseNumber(d[colMap.hourly_rate || ""]);
    const totalPay = parseNumber(d[colMap.total_pay || ""]);

    return {
      raw_row_id: raw.id,
      employee_name_raw: nameRaw,
      employee_name_normalized: normalizeText(nameRaw),
      employee_phone: normalizePhone(phone),
      employee_email: normalizeEmail(email),
      matched_employee_id: empMatch.ambiguous ? null : empMatch.employee_id,
      employee_match_confidence: empMatch.confidence,
      employee_match_method: empMatch.method,
      work_date: workDate,
      total_hours: totalHours,
      hourly_rate: hourlyRate,
      total_pay: totalPay,
      pay_type: classification.pay_type,
      ride_amount: classification.ride_amount,
      weekend_amount: classification.weekend_amount,
      manual_amount: classification.manual_amount,
      base_pay: classification.base_pay,
      notes: classification.notes,
      has_conflict: empMatch.ambiguous,
      conflict_details: empMatch.ambiguous ? { candidates: empMatch.candidates } : null,
    };
  });

  return { normalized, warnings, errors, columnMapping: colMap };
}
