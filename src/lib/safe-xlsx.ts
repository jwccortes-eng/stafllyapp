import ExcelJS from "exceljs";

/**
 * Sanitize parsed rows to prevent prototype pollution.
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
 * Read an ArrayBuffer/Uint8Array and return an ExcelJS Workbook.
 */
export async function safeRead(
  data: ArrayBuffer | Uint8Array
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const uint8 = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  await wb.xlsx.load(uint8 as any);
  return wb;
}

/**
 * Get sheet names from a workbook.
 */
export function getSheetNames(wb: ExcelJS.Workbook): string[] {
  return wb.worksheets.map(ws => ws.name);
}

/**
 * Get a worksheet by name.
 */
export function getSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.getWorksheet(name);
}

/**
 * Convert an ExcelJS worksheet to an array of JSON objects.
 * Uses the first row as headers.
 */
export function safeSheetToJson<T extends Record<string, any>>(
  sheet: ExcelJS.Worksheet,
  opts?: { defval?: string }
): T[] {
  const rows: T[] = [];
  const headers: string[] = [];
  const defval = opts?.defval ?? undefined;

  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? `Column${colNumber}`).trim();
  });

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = Object.create(null) as Record<string, any>;
    headers.forEach((header, colNumber) => {
      if (!header || colNumber === 0) return;
      const cell = row.getCell(colNumber);
      let value = cell.value;
      if (value && typeof value === "object" && "richText" in (value as any)) {
        value = (value as any).richText.map((r: any) => r.text).join("");
      }
      if (value && typeof value === "object" && "result" in (value as any)) {
        value = (value as any).result;
      }
      obj[header] = value != null ? String(value) : (defval ?? "");
    });
    if (Object.values(obj).some(v => v !== "" && v != null)) {
      rows.push(sanitizeRow(obj as T));
    }
  });

  return rows;
}

/**
 * Create a workbook from JSON data and trigger download.
 */
export async function writeExcelFile(
  data: Record<string, any>[],
  sheetName: string,
  fileName: string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  ws.addRow(headers);
  const hRow = ws.getRow(1);
  hRow.font = { bold: true };
  hRow.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });

  data.forEach(row => {
    ws.addRow(headers.map(h => row[h] ?? ""));
  });

  headers.forEach((_, i) => {
    const col = ws.getColumn(i + 1);
    let maxLen = headers[i].length;
    data.forEach(row => {
      const val = String(row[headers[i]] ?? "");
      if (val.length > maxLen) maxLen = val.length;
    });
    col.width = Math.min(maxLen + 2, 40);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse a CSV or TXT string into an array of JSON objects.
 * Uses the first line as headers. Handles quoted fields.
 */
export function parseCSVToJson<T extends Record<string, any>>(
  text: string,
  opts?: { delimiter?: string; defval?: string }
): T[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const delimiter = opts?.delimiter ?? (text.includes("\t") ? "\t" : ",");
  const defval = opts?.defval ?? "";

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === delimiter) { fields.push(current.trim()); current = ""; }
        else { current += ch; }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]);
  const rows: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const obj = Object.create(null) as Record<string, any>;
    headers.forEach((h, idx) => {
      if (!h || h === "__proto__" || h === "constructor" || h === "prototype") return;
      obj[h] = values[idx] ?? defval;
    });
    if (Object.values(obj).some(v => v !== "" && v != null)) {
      rows.push(obj as T);
    }
  }
  return rows;
}

/**
 * Detect if a file is CSV/TXT (text) or Excel (binary) and parse to rows.
 */
export async function parseAnyFileToJson<T extends Record<string, any>>(
  file: File,
  opts?: { defval?: string; sheetIndex?: number }
): Promise<T[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv" || ext === "txt" || ext === "tsv") {
    const text = await file.text();
    return parseCSVToJson<T>(text, { defval: opts?.defval });
  }

  // Excel
  const data = await file.arrayBuffer();
  const wb = await safeRead(data);
  const names = getSheetNames(wb);
  const sheetIdx = opts?.sheetIndex ?? 0;
  const ws = getSheet(wb, names[sheetIdx] ?? names[0]);
  if (!ws) return [];
  return safeSheetToJson<T>(ws, { defval: opts?.defval });
}

export type SafeWorkbook = ExcelJS.Workbook;
export type SafeWorksheet = ExcelJS.Worksheet;
