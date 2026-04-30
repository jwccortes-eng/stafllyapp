/**
 * Weekly Payroll Reconciliation — read-only engine.
 *
 * Compares an Excel/CSV final payroll file against Stafly's `period_base_pay`
 * for a given period and produces buckets + totals + an exportable comparison.
 *
 * Hard rules:
 *   - No payroll recalculation.
 *   - No writes.
 *   - Stafly source is `period_base_pay.base_total_pay` only.
 *   - Matching priority: employer_identification (exact) → normalized full name.
 *   - Tolerance: $0.01.
 */

export type ReconBucket =
  | "matched_exact"
  | "amount_mismatch"
  | "missing_in_stafly"
  | "extra_in_stafly"
  | "name_id_mismatch"
  | "needs_review";

export interface ExcelRow {
  row_number: number;
  employer_identification: string | null;
  ssn_last4: string | null;
  first_name: string;
  last_name: string;
  total: number | null;
  raw: Record<string, unknown>;
}

export interface StaflyRow {
  employee_id: string;
  employer_identification: string | null;
  first_name: string;
  last_name: string;
  base_total_pay: number;
}

export interface ComparisonRow {
  bucket: ReconBucket;
  excel?: ExcelRow;
  stafly?: StaflyRow;
  excel_amount: number | null;
  stafly_amount: number | null;
  difference: number | null;
  match_method: "employer_id" | "name" | "none";
  notes?: string;
}

export interface ReconciliationSummary {
  excel_employees: number;
  stafly_employees: number;
  excel_total: number;
  stafly_total: number;
  difference: number;
  matched_exact: number;
  amount_mismatch: number;
  missing_in_stafly: number;
  extra_in_stafly: number;
  name_id_mismatch: number;
  needs_review: number;
  footer_excluded: number;
  status: "balanced" | "needs_review" | "blocked";
}

export const TOLERANCE = 0.01;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeName(first: string, last: string): string {
  const f = stripDiacritics((first || "").toLowerCase()).replace(/[^a-z\s]/g, "").trim();
  const l = stripDiacritics((last || "").toLowerCase()).replace(/[^a-z\s]/g, "").trim();
  return `${f} ${l}`.replace(/\s+/g, " ").trim();
}

function normalizeEmployerId(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Strip leading zeros and surrounding non-digits to be safe; keep canonical digits.
  const digits = s.replace(/[^\d]/g, "");
  return digits ? digits.replace(/^0+/, "") || "0" : s.toLowerCase();
}

function isFooterRow(r: ExcelRow): boolean {
  const full = `${r.first_name} ${r.last_name}`.toLowerCase().trim();
  if (!full) return true;
  if (/^(grand\s+)?total/.test(full)) return true;
  if (/^subtotal/.test(full)) return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/* Parser — Excel / CSV                                                        */
/* -------------------------------------------------------------------------- */

function normalizeHeader(h: string): string {
  return stripDiacritics(String(h ?? "").toLowerCase())
    .replace(/[\u00a0\s_]+/g, " ")
    .trim();
}

function findCol(headers: string[], aliases: string[]): number {
  const nh = headers.map(normalizeHeader);
  const na = aliases.map((a) => normalizeHeader(a));
  for (const a of na) {
    const exact = nh.findIndex((h) => h === a);
    if (exact !== -1) return exact;
  }
  for (const a of na) {
    const partial = nh.findIndex((h) => h.includes(a));
    if (partial !== -1) return partial;
  }
  return -1;
}

function parseMoney(val: unknown): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  let s = String(val).trim();
  if (!s) return null;
  s = s.replace(/[$€£¥\s\u00a0,]/g, "");
  if (!s || s === "-") return null;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export interface ParseResult {
  rows: ExcelRow[];
  headers: string[];
  detected: Record<string, { index: number; header: string | null }>;
  footer_excluded: number;
  warnings: string[];
}

export async function parseWeeklyPayrollFile(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let rawRows: unknown[][];
  let headers: string[];

  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const text = await file.text();
    const delim = ext === "tsv" || text.includes("\t") ? "\t" : ",";
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const parseLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') q = false;
          else cur += ch;
        } else {
          if (ch === '"') q = true;
          else if (ch === delim) {
            out.push(cur.trim());
            cur = "";
          } else cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    };
    headers = parseLine(lines[0] ?? "");
    rawRows = lines.slice(1).map(parseLine);
  } else {
    // xlsx
    const { read, utils } = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = read(buf, { type: "array" });
    const sheetName = wb.SheetNames.includes("PAYROLL") ? "PAYROLL" : wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const arr = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    headers = ((arr[0] as unknown[]) || []).map((v) => String(v ?? ""));
    rawRows = arr.slice(1) as unknown[][];
  }

  const cols = {
    employer_id: findCol(headers, [
      "employer identification",
      "employer id",
      "employee id",
      "id",
    ]),
    ssn_ein: findCol(headers, ["verification ssn ein", "verification ssn", "ssn", "ein"]),
    first_name: findCol(headers, ["first name", "firstname", "nombre"]),
    last_name: findCol(headers, ["last name", "lastname", "apellido"]),
    total: findCol(headers, ["total"]),
    total_pay: findCol(headers, ["total pay", "gross pay", "pago total"]),
  };

  const detected = {
    employer_id: { index: cols.employer_id, header: cols.employer_id >= 0 ? headers[cols.employer_id] : null },
    ssn_ein: { index: cols.ssn_ein, header: cols.ssn_ein >= 0 ? headers[cols.ssn_ein] : null },
    first_name: { index: cols.first_name, header: cols.first_name >= 0 ? headers[cols.first_name] : null },
    last_name: { index: cols.last_name, header: cols.last_name >= 0 ? headers[cols.last_name] : null },
    total: { index: cols.total, header: cols.total >= 0 ? headers[cols.total] : null },
  };

  const warnings: string[] = [];
  if (cols.first_name === -1 || cols.last_name === -1) warnings.push("Missing First/Last name column.");
  if (cols.total === -1 && cols.total_pay === -1) warnings.push("Missing TOTAL column.");

  const rows: ExcelRow[] = [];
  let footer = 0;
  rawRows.forEach((r, idx) => {
    if (!r || r.length === 0) return;
    const first = String(cols.first_name >= 0 ? r[cols.first_name] ?? "" : "").trim();
    const last = String(cols.last_name >= 0 ? r[cols.last_name] ?? "" : "").trim();

    const totalRaw =
      cols.total >= 0
        ? r[cols.total]
        : cols.total_pay >= 0
        ? r[cols.total_pay]
        : null;

    const ssn = cols.ssn_ein >= 0 ? String(r[cols.ssn_ein] ?? "").trim() : "";
    const last4 = ssn ? ssn.replace(/[^\d]/g, "").slice(-4) || null : null;

    const candidate: ExcelRow = {
      row_number: idx + 2, // +2 because of header row + 1-index
      employer_identification:
        cols.employer_id >= 0 ? String(r[cols.employer_id] ?? "").trim() || null : null,
      ssn_last4: last4,
      first_name: first,
      last_name: last,
      total: parseMoney(totalRaw),
      raw: Object.fromEntries(headers.map((h, j) => [h, r[j]])),
    };

    if (isFooterRow(candidate)) {
      footer++;
      return;
    }
    rows.push(candidate);
  });

  return { rows, headers, detected, footer_excluded: footer, warnings };
}

/* -------------------------------------------------------------------------- */
/* Reconciliation                                                              */
/* -------------------------------------------------------------------------- */

export interface ReconcileInput {
  excelRows: ExcelRow[];
  staflyRows: StaflyRow[];
  footer_excluded?: number;
}

export interface ReconcileResult {
  rows: ComparisonRow[];
  summary: ReconciliationSummary;
}

export function reconcile({ excelRows, staflyRows, footer_excluded = 0 }: ReconcileInput): ReconcileResult {
  const usedStafly = new Set<string>();
  const rows: ComparisonRow[] = [];

  // Index Stafly by employer_id and by normalized name
  const staflyByEmpId = new Map<string, StaflyRow>();
  const staflyByName = new Map<string, StaflyRow[]>();
  for (const s of staflyRows) {
    const eid = normalizeEmployerId(s.employer_identification);
    if (eid) staflyByEmpId.set(eid, s);
    const key = normalizeName(s.first_name, s.last_name);
    if (key) {
      const arr = staflyByName.get(key) ?? [];
      arr.push(s);
      staflyByName.set(key, arr);
    }
  }

  for (const e of excelRows) {
    const excelAmount = e.total;
    let match: StaflyRow | undefined;
    let method: ComparisonRow["match_method"] = "none";
    let notes: string | undefined;

    const eid = normalizeEmployerId(e.employer_identification);
    if (eid && staflyByEmpId.has(eid) && !usedStafly.has(staflyByEmpId.get(eid)!.employee_id)) {
      match = staflyByEmpId.get(eid);
      method = "employer_id";
    } else {
      const key = normalizeName(e.first_name, e.last_name);
      const candidates = (staflyByName.get(key) ?? []).filter((c) => !usedStafly.has(c.employee_id));
      if (candidates.length === 1) {
        match = candidates[0];
        method = "name";
      } else if (candidates.length > 1) {
        // Ambiguous: pick the closest amount if any
        if (excelAmount != null) {
          candidates.sort(
            (a, b) => Math.abs(a.base_total_pay - excelAmount) - Math.abs(b.base_total_pay - excelAmount),
          );
        }
        match = candidates[0];
        method = "name";
        notes = `Ambiguous name match (${candidates.length} candidates); picked closest by amount.`;
      }
    }

    if (!match) {
      rows.push({
        bucket: "missing_in_stafly",
        excel: e,
        excel_amount: excelAmount,
        stafly_amount: null,
        difference: excelAmount,
        match_method: "none",
        notes,
      });
      continue;
    }

    usedStafly.add(match.employee_id);
    const staflyAmount = match.base_total_pay;
    const diff = (excelAmount ?? 0) - staflyAmount;

    let bucket: ReconBucket;
    if (excelAmount == null) {
      bucket = "needs_review";
      notes = (notes ? notes + " " : "") + "Excel amount missing.";
    } else if (Math.abs(diff) <= TOLERANCE) {
      // Cross-check name/id consistency for matched row
      const eidStafly = normalizeEmployerId(match.employer_identification);
      const idDiffers = eid && eidStafly && eid !== eidStafly;
      const nameDiffers = normalizeName(e.first_name, e.last_name) !== normalizeName(match.first_name, match.last_name);
      if (method === "employer_id" && nameDiffers) {
        bucket = "name_id_mismatch";
        notes = (notes ? notes + " " : "") + "Names differ but employer_id matched and amount is exact.";
      } else if (method === "name" && idDiffers) {
        bucket = "name_id_mismatch";
        notes = (notes ? notes + " " : "") + "Employer IDs differ but name matched and amount is exact.";
      } else {
        bucket = "matched_exact";
      }
    } else {
      bucket = "amount_mismatch";
    }

    rows.push({
      bucket,
      excel: e,
      stafly: match,
      excel_amount: excelAmount,
      stafly_amount: staflyAmount,
      difference: excelAmount == null ? null : diff,
      match_method: method,
      notes,
    });
  }

  // Extras in Stafly that no Excel row claimed
  for (const s of staflyRows) {
    if (usedStafly.has(s.employee_id)) continue;
    rows.push({
      bucket: "extra_in_stafly",
      stafly: s,
      excel_amount: null,
      stafly_amount: s.base_total_pay,
      difference: -s.base_total_pay,
      match_method: "none",
    });
  }

  const sumExcel = excelRows.reduce((s, r) => s + (r.total ?? 0), 0);
  const sumStafly = staflyRows.reduce((s, r) => s + r.base_total_pay, 0);
  const counts = {
    matched_exact: rows.filter((r) => r.bucket === "matched_exact").length,
    amount_mismatch: rows.filter((r) => r.bucket === "amount_mismatch").length,
    missing_in_stafly: rows.filter((r) => r.bucket === "missing_in_stafly").length,
    extra_in_stafly: rows.filter((r) => r.bucket === "extra_in_stafly").length,
    name_id_mismatch: rows.filter((r) => r.bucket === "name_id_mismatch").length,
    needs_review: rows.filter((r) => r.bucket === "needs_review").length,
  };

  const totalDiff = sumExcel - sumStafly;
  let status: ReconciliationSummary["status"];
  if (
    Math.abs(totalDiff) <= TOLERANCE &&
    counts.amount_mismatch === 0 &&
    counts.missing_in_stafly === 0 &&
    counts.extra_in_stafly === 0 &&
    counts.needs_review === 0 &&
    counts.name_id_mismatch === 0
  ) {
    status = "balanced";
  } else if (
    counts.missing_in_stafly + counts.extra_in_stafly + counts.amount_mismatch >
    Math.max(5, excelRows.length * 0.1)
  ) {
    status = "blocked";
  } else {
    status = "needs_review";
  }

  const summary: ReconciliationSummary = {
    excel_employees: excelRows.length,
    stafly_employees: staflyRows.length,
    excel_total: sumExcel,
    stafly_total: sumStafly,
    difference: totalDiff,
    ...counts,
    footer_excluded,
    status,
  };

  // Sort comparison rows: mismatches first, then matched
  const order: Record<ReconBucket, number> = {
    amount_mismatch: 0,
    missing_in_stafly: 1,
    extra_in_stafly: 2,
    name_id_mismatch: 3,
    needs_review: 4,
    matched_exact: 5,
  };
  rows.sort((a, b) => {
    const d = order[a.bucket] - order[b.bucket];
    if (d !== 0) return d;
    const an = a.excel ? `${a.excel.last_name} ${a.excel.first_name}` : a.stafly ? `${a.stafly.last_name} ${a.stafly.first_name}` : "";
    const bn = b.excel ? `${b.excel.last_name} ${b.excel.first_name}` : b.stafly ? `${b.stafly.last_name} ${b.stafly.first_name}` : "";
    return an.localeCompare(bn);
  });

  return { rows, summary };
}
