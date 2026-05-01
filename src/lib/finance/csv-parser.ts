/**
 * Lightweight CSV parser for bank/credit-card exports.
 * Handles quoted fields and basic header inference.
 * Returns extracted-item candidates ready to insert into
 * finance_import_extracted_items (review_status='pending').
 */

export interface ParsedCsvRow {
  transaction_date: string | null;
  description_raw: string;
  merchant_guess: string;
  amount: number | null;
  currency: string;
  category_guess: string | null;
  is_recurring_guess: boolean;
  confidence_score: number;
  raw_payload: Record<string, string>;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  headers: string[];
  totalRows: number;
  totalDebit: number;
  totalCredit: number;
  inferredInstitution: string | null;
  warnings: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const DATE_KEYS = ["date", "transaction date", "posted date", "post date", "trans date"];
const DESC_KEYS = ["description", "memo", "details", "merchant", "name", "payee"];
const AMOUNT_KEYS = ["amount", "transaction amount", "amt"];
const DEBIT_KEYS = ["debit", "withdrawal", "charge"];
const CREDIT_KEYS = ["credit", "deposit", "payment"];

function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex((h) => h === c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function parseAmount(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // MM/DD/YYYY or M/D/YYYY
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    let [_, m, d, y] = us;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // try Date.parse fallback
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function guessMerchant(desc: string): string {
  return desc
    .replace(/\s+#\d+.*$/i, "")
    .replace(/\s+\d{2}\/\d{2}.*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 80);
}

function guessCategory(desc: string): string | null {
  const d = desc.toLowerCase();
  if (/uber|lyft|gas|shell|exxon|chevron|parking/.test(d)) return "Transportation";
  if (/amazon|walmart|target|costco/.test(d)) return "Personal";
  if (/uber eats|doordash|grubhub|restaurant|cafe|starbucks|mcdonald/.test(d)) return "Food";
  if (/netflix|spotify|hulu|disney|hbo|apple\.com\/bill/.test(d)) return "Subscriptions";
  if (/aws|google|github|openai|stripe|figma|notion|slack/.test(d)) return "Software";
  if (/electric|water|comcast|xfinity|verizon|t-mobile|att/.test(d)) return "Utilities";
  if (/insurance|geico|progressive|allstate/.test(d)) return "Insurance";
  if (/payment|autopay|interest charge|fee/.test(d)) return "Fees & Interest";
  if (/payroll|deposit|salary/.test(d)) return "Income";
  return null;
}

const RECURRING_HINTS = [/netflix/, /spotify/, /hulu/, /apple\.com\/bill/, /aws/, /google\s*\*/, /github/, /openai/, /\bsubscription\b/, /\bmonthly\b/];

function isLikelyRecurring(desc: string): boolean {
  const d = desc.toLowerCase();
  return RECURRING_HINTS.some((rx) => rx.test(d));
}

function inferInstitution(headers: string[], firstRow: string[]): string | null {
  const blob = (headers.join(" ") + " " + firstRow.join(" ")).toLowerCase();
  if (blob.includes("chase")) return "Chase";
  if (blob.includes("amex") || blob.includes("american express")) return "American Express";
  if (blob.includes("capital one")) return "Capital One";
  if (blob.includes("bank of america") || blob.includes("bofa")) return "Bank of America";
  if (blob.includes("wells fargo")) return "Wells Fargo";
  if (blob.includes("citi")) return "Citi";
  if (blob.includes("discover")) return "Discover";
  return null;
}

export function parseCsv(text: string): CsvParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], headers: [], totalRows: 0, totalDebit: 0, totalCredit: 0, inferredInstitution: null, warnings: ["Empty file"] };
  }

  const headers = splitCsvLine(lines[0]);
  const dateIdx = findCol(headers, DATE_KEYS);
  const descIdx = findCol(headers, DESC_KEYS);
  const amountIdx = findCol(headers, AMOUNT_KEYS);
  const debitIdx = findCol(headers, DEBIT_KEYS);
  const creditIdx = findCol(headers, CREDIT_KEYS);

  if (dateIdx < 0) warnings.push("No date column detected");
  if (descIdx < 0) warnings.push("No description column detected");
  if (amountIdx < 0 && debitIdx < 0 && creditIdx < 0) warnings.push("No amount column detected");

  const rows: ParsedCsvRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  const firstDataRow = lines.length > 1 ? splitCsvLine(lines[1]) : [];
  const inferredInstitution = inferInstitution(headers, firstDataRow);

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length === 0 || cells.every((c) => !c)) continue;

    const date = parseDate(cells[dateIdx]);
    const desc = (cells[descIdx] ?? "").trim();
    let amount: number | null = null;

    if (amountIdx >= 0) {
      amount = parseAmount(cells[amountIdx]);
    } else {
      const debit = parseAmount(cells[debitIdx]);
      const credit = parseAmount(cells[creditIdx]);
      if (debit && debit > 0) amount = -debit;
      else if (credit && credit > 0) amount = credit;
    }

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = cells[idx] ?? ""; });

    if (amount != null) {
      if (amount < 0) totalDebit += Math.abs(amount);
      else totalCredit += amount;
    }

    let confidence = 50;
    if (date) confidence += 15;
    if (desc) confidence += 15;
    if (amount != null) confidence += 20;

    rows.push({
      transaction_date: date,
      description_raw: desc,
      merchant_guess: guessMerchant(desc),
      amount,
      currency: "USD",
      category_guess: guessCategory(desc),
      is_recurring_guess: isLikelyRecurring(desc),
      confidence_score: Math.min(100, confidence),
      raw_payload: raw,
    });
  }

  return {
    rows,
    headers,
    totalRows: rows.length,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    inferredInstitution,
    warnings,
  };
}
