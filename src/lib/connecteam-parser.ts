import { safeRead, safeSheetToJson, getSheetNames, getSheet } from "./safe-xlsx";
import type { SafeWorkbook } from "./safe-xlsx";

/**
 * Column mapping: Connecteam header → DB field key
 */
const HEADER_MAP: Record<string, string> = {
  "first name": "first_name",
  "last name": "last_name",
  "mobile phone": "phone_number",
  "phone": "phone_number",
  "country code": "country_code",
  "email": "email",
  "gender": "gender",
  "employer identification": "employer_identification",
  "birthday": "birthday",
  "address (street, apt).": "address",
  "address (street, apt.)": "address",
  "condado": "county",
  "start date": "start_date",
  "english level": "english_level",
  "role": "employee_role",
  "qualify": "qualify",
  // SSN/EIN fields removed for security — no longer stored
  "recommended by?": "recommended_by",
  "direct manager": "direct_manager",
  "you have car?": "has_car",
  "driver licence": "driver_licence",
  "end date": "end_date",
  "kiosk code": "kiosk_code",
  "date added": "date_added",
  "last login": "last_login",
  "connecteam user id": "connecteam_employee_id",
  "added via": "added_via",
  "added by": "added_by",
  "groups": "groups",
  "tags": "tags",
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_\s-]+/g, " ").replace(/[^\w\s().?]/g, "").trim();
}

function mapHeader(raw: string): string | null {
  const norm = normalizeHeader(raw);
  if (HEADER_MAP[norm]) return HEADER_MAP[norm];
  const stripped = norm.replace(/[^a-z ]/g, "").trim();
  for (const [key, val] of Object.entries(HEADER_MAP)) {
    const keyStripped = key.replace(/[^a-z ]/g, "").trim();
    if (keyStripped === stripped) return val;
  }
  return null;
}

function parseConnecteamCSV(rawText: string): Record<string, string>[] {
  const lines = rawText.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const cleanLine = (line: string): string[] => {
    line = line.replace(/,+\s*$/, "").trim();
    line = line.replace(/"\s*,\s*"/g, ", ");
    line = line.replace(/"/g, "");
    return line.split(";").map(v => v.trim());
  };

  const headers = cleanLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = cleanLine(lines[i]);
    if (values.length < 2) continue;
    if (!values[0]?.trim()) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function isConnecteamCSV(text: string): boolean {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
  return firstLine.includes(";") && (
    firstLine.toLowerCase().includes("first name") ||
    firstLine.toLowerCase().includes("connecteam")
  );
}

export interface ParsedEmployee {
  [key: string]: string;
}

/**
 * Parse a Connecteam export file (Excel or CSV) into normalized employee records.
 * Now async because ExcelJS parsing is async.
 */
export async function parseConnecteamFile(
  content: ArrayBuffer,
  fileName: string
): Promise<ParsedEmployee[]> {
  let rawRows: Record<string, any>[];

  const isExcel = /\.xlsx?$/i.test(fileName);

  if (isExcel) {
    const wb = await safeRead(content);
    const sheetNames = getSheetNames(wb);
    const ws = getSheet(wb, sheetNames[0]);
    rawRows = ws ? safeSheetToJson(ws, { defval: "" }) : [];
  } else {
    const text = new TextDecoder().decode(content);

    if (isConnecteamCSV(text)) {
      rawRows = parseConnecteamCSV(text);
    } else {
      // Standard CSV — parse as text rows
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return [];
      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
      rawRows = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.replace(/"/g, "").trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
        rawRows.push(row);
      }
    }
  }

  const results: ParsedEmployee[] = [];

  for (const raw of rawRows) {
    const mapped: ParsedEmployee = {};
    for (const [rawHeader, value] of Object.entries(raw)) {
      const dbKey = mapHeader(rawHeader);
      if (dbKey && !mapped[dbKey]) {
        let val = String(value ?? "").trim();
        if (/^[\s,]*$/.test(val)) val = "";
        mapped[dbKey] = val;
      }
    }
    if (!mapped.first_name && !mapped.last_name) continue;
    results.push(mapped);
  }

  return results;
}
