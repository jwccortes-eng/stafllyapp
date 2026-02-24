import * as XLSX from "xlsx";

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
  "social security number": "social_security_number",
  "verification ssn - ein": "verification_ssn_ein",
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

/**
 * Normalize a header string for matching
 */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_\s-]+/g, " ").replace(/[^\w\s().?]/g, "").trim();
}

/**
 * Map a raw header to our DB field key
 */
function mapHeader(raw: string): string | null {
  const norm = normalizeHeader(raw);
  // Direct match
  if (HEADER_MAP[norm]) return HEADER_MAP[norm];
  // Fuzzy match: try without special chars
  const stripped = norm.replace(/[^a-z ]/g, "").trim();
  for (const [key, val] of Object.entries(HEADER_MAP)) {
    const keyStripped = key.replace(/[^a-z ]/g, "").trim();
    if (keyStripped === stripped) return val;
  }
  return null;
}

/**
 * Parse Connecteam semicolon-delimited CSV.
 * This format has semicolons as field separators but is saved as CSV,
 * causing commas within values to create spurious CSV field breaks.
 */
function parseConnecteamCSV(rawText: string): Record<string, string>[] {
  const lines = rawText.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const cleanLine = (line: string): string[] => {
    // Remove trailing empty CSV fields
    line = line.replace(/,+\s*$/, "").trim();
    // Rejoin CSV-split fragments: "," or ", " between value parts
    line = line.replace(/"\s*,\s*"/g, ", ");
    // Unescape doubled quotes
    line = line.replace(/""/g, "\x01");
    // Remove remaining quotes
    line = line.replace(/"/g, "");
    // Restore escaped quotes
    line = line.replace(/\x01/g, '"');
    // Split by semicolons and trim each value
    return line.split(";").map(v => v.trim());
  };

  const headers = cleanLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = cleanLine(lines[i]);
    if (values.length < 2) continue;
    // Skip rows where first_name is empty
    if (!values[0]?.trim()) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Detect if text content is a Connecteam semicolon CSV
 */
function isConnecteamCSV(text: string): boolean {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
  // Check if the first line contains semicolons with typical Connecteam headers
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
 * Returns records with DB field keys (first_name, last_name, etc.)
 */
export function parseConnecteamFile(
  content: string | ArrayBuffer,
  fileName: string
): ParsedEmployee[] {
  let rawRows: Record<string, any>[];

  const isExcel = /\.xlsx?$/i.test(fileName);

  if (isExcel) {
    // Parse as Excel
    const wb = XLSX.read(content, { type: "binary" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  } else {
    // Parse as CSV
    const text = typeof content === "string"
      ? content
      : new TextDecoder().decode(content);

    if (isConnecteamCSV(text)) {
      rawRows = parseConnecteamCSV(text);
    } else {
      // Standard CSV - try XLSX parser
      const wb = XLSX.read(content, { type: typeof content === "string" ? "string" : "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    }
  }

  // Map raw headers to DB field keys
  const results: ParsedEmployee[] = [];

  for (const raw of rawRows) {
    const mapped: ParsedEmployee = {};
    for (const [rawHeader, value] of Object.entries(raw)) {
      const dbKey = mapHeader(rawHeader);
      if (dbKey && !mapped[dbKey]) {
        mapped[dbKey] = String(value ?? "").trim();
      }
    }
    // Skip if no name
    if (!mapped.first_name && !mapped.last_name) continue;
    results.push(mapped);
  }

  return results;
}
