/**
 * Normalizer: Converts raw imported rows into normalized structures
 * for schedules, clocks, and payroll.
 * Includes system-row filtering, alias support, and match diagnostics.
 */
import {
  normalizeText, normalizePhone, normalizeEmail, hashRow,
  matchEmployee, classifyPayrollRow, detectColumns, resolveEmployeeName,
  type EmployeeRecord, type ColumnMapping, type EmployeeMatchStatus,
} from "./reconciliation-engine";

// ─── System / Non-Employee Row Detection ───

const SYSTEM_NAME_PATTERNS = [
  /^conecteam/i,
  /^general\s*admin/i,
  /^help$/i,
  /^admin$/i,
  /^support$/i,
  /^test\s*(user|account)/i,
  /^system/i,
  /^n\/?a$/i,
  /^setup/i,
  /^placeholder/i,
];

const SYSTEM_EMAIL_PATTERNS = [
  /^conecteam@/i,
  /^admin@/i,
  /^help@/i,
  /^support@/i,
  /^noreply@/i,
  /^test@/i,
];

export interface EmployeeAlias {
  employee_id: string;
  alias_name_normalized: string;
}

export interface ManualNameResolution {
  imported_name_normalized: string;
  selected_employee_id: string;
  resolution_source?: string | null;
}

export function isSystemRow(nameRaw: string, emailRaw?: string | null): boolean {
  const name = (nameRaw || "").trim();
  if (!name || name.length < 2) return true;
  // All digits or special chars only
  if (/^[\d\s\-_.@#]+$/.test(name)) return true;

  const normalized = normalizeText(name);
  for (const pattern of SYSTEM_NAME_PATTERNS) {
    if (pattern.test(name) || pattern.test(normalized)) return true;
  }

  if (emailRaw) {
    for (const pattern of SYSTEM_EMAIL_PATTERNS) {
      if (pattern.test(emailRaw.trim())) return true;
    }
  }

  return false;
}

// ─── Diagnostics ───

export interface ImportDiagnostics {
  totalRows: number;
  systemRows: number;
  systemRowNames: string[];
  blankNameRows: number;
  realEmployeeRows: number;
  matched: number;
  matchedActive: number;
  matchedInactive: number;
  matchedByAlias: number;
  matchedByMethod: Record<string, number>;
  matchedByStatus: Record<string, number>;
  unmatched: number;
  unmatchedNames: string[];
  ambiguous: number;
  likelyAliasMatches: number;
  likelyAliasNames: string[];
  companyEmployeesActive: number;
  companyEmployeesInactive: number;
}

export interface NormalizationResult<T> {
  normalized: T[];
  warnings: string[];
  errors: string[];
  columnMapping: ColumnMapping;
  diagnostics: ImportDiagnostics;
}

// ─── Enhanced Employee Matching with Aliases ───

export function matchEmployeeWithAliases(
  nameRaw: string | null,
  phone: string | null,
  email: string | null,
  externalId: string | null,
  employees: EmployeeRecord[],
  aliases: EmployeeAlias[],
  manualResolutions: ManualNameResolution[] = [],
) {
  const normalizedName = normalizeText(nameRaw);

  if (normalizedName) {
    const manual = manualResolutions.find((r) => r.imported_name_normalized === normalizedName);
    if (manual) {
      const resolvedEmployee = employees.find((e) => e.id === manual.selected_employee_id);
      if (resolvedEmployee) {
        const fullName = `${resolvedEmployee.first_name} ${resolvedEmployee.last_name}`.trim();
        return {
          employee_id: resolvedEmployee.id,
          confidence: 1,
          method: manual.resolution_source || "manual_ambiguous_resolution",
          match_status: resolvedEmployee.is_active === false ? "matched_inactive_employee" : "matched_active_employee",
          ambiguous: false,
          candidates: [{ id: resolvedEmployee.id, name: fullName, confidence: 1, method: "manual_ambiguous_resolution", is_active: resolvedEmployee.is_active }],
        };
      }
    }

    const alias = aliases.find((a) => a.alias_name_normalized === normalizedName);
    if (alias) {
      const emp = employees.find((e) => e.id === alias.employee_id);
      if (emp) {
        return {
          employee_id: alias.employee_id,
          confidence: 0.85,
          method: "alias",
          match_status: emp.is_active === false ? "matched_inactive_employee" : "likely_alias_match",
          ambiguous: false,
          candidates: [{ id: alias.employee_id, name: `${emp.first_name} ${emp.last_name}`.trim(), confidence: 0.85, method: "alias", is_active: emp.is_active }],
        };
      }
    }
  }

  return matchEmployee(nameRaw, phone, email, externalId, employees);
}

// ─── Parsers (unchanged) ───

function parseDate(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = val.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${y}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return null;
}

function parseTime(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = val.trim();
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}:${hm[3] || "00"}`;
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

// ─── Core normalizer with diagnostics ───

function emptyDiagnostics(employees: EmployeeRecord[]): ImportDiagnostics {
  return { totalRows: 0, systemRows: 0, systemRowNames: [], blankNameRows: 0, realEmployeeRows: 0, matched: 0, matchedActive: 0, matchedInactive: 0, matchedByAlias: 0, matchedByMethod: {}, matchedByStatus: {}, unmatched: 0, unmatchedNames: [], ambiguous: 0, likelyAliasMatches: 0, likelyAliasNames: [], companyEmployeesActive: employees.filter(e => e.is_active !== false).length, companyEmployeesInactive: employees.filter(e => e.is_active === false).length };
}

function buildDiagnostics(
  totalRows: number,
  systemRowNames: string[],
  blankNameRows: number,
  normalized: any[],
  employees: EmployeeRecord[]
): ImportDiagnostics {
  const matched = normalized.filter(r => r.matched_employee_id);
  const unmatched = normalized.filter(r => !r.matched_employee_id && !r._is_system);
  const ambiguous = normalized.filter(r => r.has_conflict);

  const likelyAlias = unmatched.filter(r =>
    r.employee_match_confidence > 0 && r.employee_match_confidence < 0.75
  );

  const matchedByMethod: Record<string, number> = {};
  const matchedByStatus: Record<string, number> = {};
  for (const r of matched) {
    matchedByMethod[r.employee_match_method] = (matchedByMethod[r.employee_match_method] || 0) + 1;
    const status = r._match_status || "matched_active_employee";
    matchedByStatus[status] = (matchedByStatus[status] || 0) + 1;
  }

  const matchedActive = matched.filter(r => r._match_status === "matched_active_employee").length;
  const matchedInactive = matched.filter(r => r._match_status === "matched_inactive_employee").length;
  const matchedByAlias = matched.filter(r => r.employee_match_method === "alias").length;

  const activeEmps = employees.filter((e: any) => e.is_active !== false);
  const inactiveEmps = employees.filter((e: any) => e.is_active === false);

  return {
    totalRows,
    systemRows: systemRowNames.length,
    systemRowNames: [...new Set(systemRowNames)],
    blankNameRows,
    realEmployeeRows: normalized.filter(r => !r._is_system).length,
    matched: matched.length,
    matchedActive,
    matchedInactive,
    matchedByAlias,
    matchedByMethod,
    matchedByStatus,
    unmatched: unmatched.length,
    unmatchedNames: [...new Set(unmatched.map(r => r.employee_name_raw))],
    ambiguous: ambiguous.length,
    likelyAliasMatches: likelyAlias.length,
    likelyAliasNames: [...new Set(likelyAlias.map(r => r.employee_name_raw))],
    companyEmployeesActive: activeEmps.length,
    companyEmployeesInactive: inactiveEmps.length,
  };
}

export function normalizeScheduleRows(
  rawRows: Array<{ id: string; row_number: number; raw_data: Record<string, any> }>,
  employees: EmployeeRecord[],
  aliases: EmployeeAlias[] = [],
  manualResolutions: ManualNameResolution[] = [],
  customColumnMapping?: ColumnMapping,
): NormalizationResult<any> {
  if (rawRows.length === 0) return { normalized: [], warnings: [], errors: [], columnMapping: {}, diagnostics: emptyDiagnostics(employees) };

  const headers = Object.keys(rawRows[0].raw_data);
  const colMap = customColumnMapping ?? detectColumns(headers);
  const warnings: string[] = [];
  const errors: string[] = [];
  const systemRowNames: string[] = [];
  let blankNameRows = 0;

  if (!colMap.employee_name && !colMap.employee_first_name && !colMap.external_id) {
    errors.push("Could not detect employee name or ID column");
  }

  const normalized = rawRows.map(raw => {
    const d = raw.raw_data;
    const nameRaw = resolveEmployeeName(d, colMap);
    const phone = d[colMap.employee_phone || ""] || null;
    const email = d[colMap.employee_email || ""] || null;
    const extId = d[colMap.external_id || ""] || null;

    // Check for system/non-employee rows
    if (!nameRaw.trim()) {
      blankNameRows++;
      return {
        raw_row_id: raw.id,
        employee_name_raw: nameRaw,
        employee_name_normalized: "",
        _is_system: true,
        _system_reason: "blank_name",
        matched_employee_id: null,
        employee_match_confidence: 0,
        employee_match_method: "excluded",
        work_date: null, start_time: null, end_time: null, total_hours: null,
        client_name: null, location_name: null, shift_title: null,
        external_shift_id: null, pay_type: "excluded",
        has_conflict: false, conflict_details: null,
      };
    }

    if (isSystemRow(nameRaw, email)) {
      systemRowNames.push(nameRaw.trim());
      return {
        raw_row_id: raw.id,
        employee_name_raw: nameRaw,
        employee_name_normalized: normalizeText(nameRaw),
        _is_system: true,
        _system_reason: "system_placeholder",
        matched_employee_id: null,
        employee_match_confidence: 0,
        employee_match_method: "excluded",
        work_date: null, start_time: null, end_time: null, total_hours: null,
        client_name: null, location_name: null, shift_title: null,
        external_shift_id: null, pay_type: "excluded",
        has_conflict: false, conflict_details: null,
      };
    }

    const empMatch = matchEmployeeWithAliases(nameRaw, phone, email, extId, employees, aliases, manualResolutions);
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
      _match_status: empMatch.match_status,
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
      _is_system: false,
    };
  });

  const diagnostics = buildDiagnostics(rawRows.length, systemRowNames, blankNameRows, normalized, employees);

  return { normalized, warnings, errors, columnMapping: colMap, diagnostics };
}

export function normalizeClockRows(
  rawRows: Array<{ id: string; row_number: number; raw_data: Record<string, any> }>,
  employees: EmployeeRecord[],
  aliases: EmployeeAlias[] = [],
  manualResolutions: ManualNameResolution[] = [],
  customColumnMapping?: ColumnMapping,
): NormalizationResult<any> {
  if (rawRows.length === 0) return { normalized: [], warnings: [], errors: [], columnMapping: {}, diagnostics: emptyDiagnostics(employees) };

  const headers = Object.keys(rawRows[0].raw_data);
  const colMap = customColumnMapping ?? detectColumns(headers);
  const warnings: string[] = [];
  const errors: string[] = [];
  const systemRowNames: string[] = [];
  let blankNameRows = 0;

  const normalized = rawRows.map(raw => {
    const d = raw.raw_data;
    const nameRaw = resolveEmployeeName(d, colMap);
    const phone = d[colMap.employee_phone || ""] || null;
    const email = d[colMap.employee_email || ""] || null;
    const extId = d[colMap.external_id || ""] || null;

    if (!nameRaw.trim()) { blankNameRows++; return buildExcludedRow(raw.id, nameRaw, "blank_name"); }
    if (isSystemRow(nameRaw, email)) { systemRowNames.push(nameRaw.trim()); return buildExcludedRow(raw.id, nameRaw, "system_placeholder"); }

    const empMatch = matchEmployeeWithAliases(nameRaw, phone, email, extId, employees, aliases, manualResolutions);
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
      _match_status: empMatch.match_status,
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
      _is_system: false,
    };
  });

  const diagnostics = buildDiagnostics(rawRows.length, systemRowNames, blankNameRows, normalized, employees);
  return { normalized, warnings, errors, columnMapping: colMap, diagnostics };
}

export function normalizePayrollRows(
  rawRows: Array<{ id: string; row_number: number; raw_data: Record<string, any> }>,
  employees: EmployeeRecord[],
  aliases: EmployeeAlias[] = [],
  manualResolutions: ManualNameResolution[] = [],
  customColumnMapping?: ColumnMapping,
): NormalizationResult<any> {
  if (rawRows.length === 0) return { normalized: [], warnings: [], errors: [], columnMapping: {}, diagnostics: emptyDiagnostics(employees) };

  const headers = Object.keys(rawRows[0].raw_data);
  const colMap = customColumnMapping ?? detectColumns(headers);
  const warnings: string[] = [];
  const errors: string[] = [];
  const systemRowNames: string[] = [];
  let blankNameRows = 0;

  const normalized = rawRows.map(raw => {
    const d = raw.raw_data;
    const nameRaw = resolveEmployeeName(d, colMap);
    const phone = d[colMap.employee_phone || ""] || null;
    const email = d[colMap.employee_email || ""] || null;
    const extId = d[colMap.external_id || ""] || null;

    if (!nameRaw.trim()) { blankNameRows++; return buildExcludedRow(raw.id, nameRaw, "blank_name"); }
    if (isSystemRow(nameRaw, email)) { systemRowNames.push(nameRaw.trim()); return buildExcludedRow(raw.id, nameRaw, "system_placeholder"); }

    const empMatch = matchEmployeeWithAliases(nameRaw, phone, email, extId, employees, aliases, manualResolutions);
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
      _match_status: empMatch.match_status,
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
      _is_system: false,
    };
  });

  const diagnostics = buildDiagnostics(rawRows.length, systemRowNames, blankNameRows, normalized, employees);
  return { normalized, warnings, errors, columnMapping: colMap, diagnostics };
}

// ─── Helper ───

function buildExcludedRow(rawRowId: string, nameRaw: string, reason: string) {
  return {
    raw_row_id: rawRowId,
    employee_name_raw: nameRaw,
    employee_name_normalized: normalizeText(nameRaw),
    _is_system: true,
    _system_reason: reason,
    matched_employee_id: null,
    employee_match_confidence: 0,
    employee_match_method: "excluded",
    work_date: null,
    total_hours: null,
    has_conflict: false,
    conflict_details: null,
  };
}
