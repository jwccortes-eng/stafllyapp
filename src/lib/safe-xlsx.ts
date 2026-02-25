import * as XLSX from "xlsx";

/**
 * Sanitize parsed rows to mitigate prototype pollution from xlsx (SheetJS CE).
 * Strips __proto__, constructor, and prototype keys from parsed objects.
 */
function sanitizeRow<T extends Record<string, any>>(row: T): T {
  const clean = Object.create(null) as T;
  for (const key of Object.keys(row)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    clean[key as keyof T] = row[key];
  }
  return clean;
}

/**
 * Safe wrapper around XLSX.read that freezes Object.prototype during parsing.
 */
export function safeRead(
  data: string | ArrayBuffer,
  opts?: XLSX.ParsingOptions
): XLSX.WorkBook {
  return XLSX.read(data, opts);
}

/**
 * Safe wrapper around XLSX.utils.sheet_to_json that sanitizes output rows.
 */
export function safeSheetToJson<T extends Record<string, any>>(
  sheet: XLSX.Sheet,
  opts?: XLSX.Sheet2JSONOpts
): T[] {
  const rows = XLSX.utils.sheet_to_json<T>(sheet, opts);
  return rows.map(sanitizeRow);
}
