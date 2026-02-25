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

export type SafeWorkbook = ExcelJS.Workbook;
export type SafeWorksheet = ExcelJS.Worksheet;
