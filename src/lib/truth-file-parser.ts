/**
 * Truth File Parser
 * Parses payroll truth files (XLSX/CSV) into structured TruthRow[]
 */
import { read, utils } from "xlsx";
import type { TruthRow } from "./payroll-reconciliation-engine";

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u00a0\s_]+/g, " ").trim();
}

function findCol(headers: string[], aliases: string[]): number {
  const nh = headers.map(normalizeHeader);
  const na = aliases.map(a => a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
  for (const a of na) {
    const exact = nh.findIndex(h => h === a);
    if (exact !== -1) return exact;
  }
  for (const a of na) {
    const partial = nh.findIndex(h => h.includes(a));
    if (partial !== -1) return partial;
  }
  return -1;
}

function parseMoney(val: unknown): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  let s = String(val).trim();
  if (!s) return null;
  s = s.replace(/[$¤€£¥\s\u00a0,]/g, "");
  if (!s || s === "-") return null;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function parseHours(val: unknown): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const s = String(val).trim().replace(/[,\s]/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function isSummaryRow(firstName: string, lastName: string): boolean {
  const full = `${firstName} ${lastName}`.toLowerCase().trim();
  if (!full) return true;
  if (full.startsWith("total") || full === "grand total" || full.startsWith("subtotal")) return true;
  if (/^total\s/i.test(firstName)) return true;
  return false;
}

export interface TruthParseResult {
  rows: TruthRow[];
  raw_headers: string[];
  detected_columns: Record<string, { index: number; header: string | null }>;
  skipped_summary_rows: number;
  duplicate_names: string[];
  parse_warnings: string[];
}

export function parseTruthFile(data: ArrayBuffer | Uint8Array): TruthParseResult {
  const wb = read(data, { type: "array" });
  const sheetName = wb.SheetNames.includes("PAYROLL") ? "PAYROLL" : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  const raw2d = utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
  const headers = ((raw2d[0] || []) as unknown[]).map(v => String(v ?? ""));
  const warnings: string[] = [];

  const cols = {
    employer_id: findCol(headers, ["employer identification", "employer id"]),
    ssn_ein: findCol(headers, ["verification ssn - ein", "verification ssn", "ssn", "ein", "ssn/ein"]),
    first_name: findCol(headers, ["first name", "firstname", "nombre"]),
    last_name: findCol(headers, ["last name", "lastname", "apellido"]),
    total_hours: findCol(headers, ["total work hours", "total hours", "hours", "horas"]),
    total_pay: findCol(headers, ["total pay", "gross pay", "pago total"]),
    pay_per_day: findCol(headers, ["payper day", "pay per day", "pago por dia"]),
    ryde: findCol(headers, ["ryde", "ride", "rides"]),
    tips: findCol(headers, ["tips", "propinas"]),
    reimbursements: findCol(headers, ["reimbursements", "reembolsos", "reimbursement"]),
    total: findCol(headers, ["total"]),
    observaciones: findCol(headers, ["observaciones", "observations", "notes", "notas"]),
    date: findCol(headers, ["date", "fecha"]),
    corte: findCol(headers, ["corte", "cut", "periodo"]),
  };

  // Find TOTAL column strictly (exact match)
  if (cols.total === -1) {
    const nh = headers.map(normalizeHeader);
    const exact = nh.findIndex(h => h === "total");
    if (exact !== -1) cols.total = exact;
  }

  const getColHeader = (idx: number) => idx >= 0 ? headers[idx] : null;
  const detected_columns: Record<string, { index: number; header: string | null }> = {};
  for (const [key, idx] of Object.entries(cols)) {
    detected_columns[key] = { index: idx, header: getColHeader(idx) };
  }

  const rows: TruthRow[] = [];
  let skippedSummary = 0;
  const nameCount = new Map<string, number>();

  for (let i = 1; i < raw2d.length; i++) {
    const row = raw2d[i];
    if (!row || row.length === 0) continue;

    const firstName = String(cols.first_name >= 0 ? row[cols.first_name] ?? "" : "").trim();
    const lastName = String(cols.last_name >= 0 ? row[cols.last_name] ?? "" : "").trim();

    if (isSummaryRow(firstName, lastName)) { skippedSummary++; continue; }
    if (!firstName && !lastName) continue;

    const fullNorm = `${firstName} ${lastName}`.toLowerCase().trim();
    nameCount.set(fullNorm, (nameCount.get(fullNorm) || 0) + 1);

    const truthRow: TruthRow = {
      employer_identification: cols.employer_id >= 0 ? String(row[cols.employer_id] ?? "").trim() || undefined : undefined,
      verification_ssn_ein: cols.ssn_ein >= 0 ? String(row[cols.ssn_ein] ?? "").trim() || undefined : undefined,
      first_name: firstName,
      last_name: lastName,
      total_hours: parseHours(cols.total_hours >= 0 ? row[cols.total_hours] : null),
      total_pay: parseMoney(cols.total_pay >= 0 ? row[cols.total_pay] : null),
      pay_per_day: parseMoney(cols.pay_per_day >= 0 ? row[cols.pay_per_day] : null),
      ryde: parseMoney(cols.ryde >= 0 ? row[cols.ryde] : null),
      tips: parseMoney(cols.tips >= 0 ? row[cols.tips] : null),
      reimbursements: parseMoney(cols.reimbursements >= 0 ? row[cols.reimbursements] : null),
      total: parseMoney(cols.total >= 0 ? row[cols.total] : null),
      observaciones: cols.observaciones >= 0 ? String(row[cols.observaciones] ?? "").trim() || undefined : undefined,
      date: cols.date >= 0 ? String(row[cols.date] ?? "").trim() || undefined : undefined,
      corte: cols.corte >= 0 ? String(row[cols.corte] ?? "").trim() || undefined : undefined,
      raw: Object.fromEntries(headers.map((h, j) => [h, row[j]])),
    };

    rows.push(truthRow);
  }

  const duplicateNames = Array.from(nameCount.entries()).filter(([, c]) => c > 1).map(([n]) => n);
  if (duplicateNames.length > 0) warnings.push(`Duplicate names found: ${duplicateNames.join(", ")}`);

  return {
    rows,
    raw_headers: headers,
    detected_columns,
    skipped_summary_rows: skippedSummary,
    duplicate_names: duplicateNames,
    parse_warnings: warnings,
  };
}
