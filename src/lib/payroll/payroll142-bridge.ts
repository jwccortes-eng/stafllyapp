import { supabase } from "@/integrations/supabase/client";

/**
 * Bridge de cierre externo aprobado (Payroll 142).
 *
 * Reglas canónicas:
 * - Solo la hoja `PAYROLL` es autoridad financiera. `All Employees` y `SECRETARIA`
 *   nunca determinan importes (SECRETARIA solo sirve como control informativo).
 * - El cliente NO parsea dinero ni decide identidad: solo extrae celdas crudas.
 *   El parseo, el matching y la validación viven en la edge function
 *   `import-payroll-extras` (modo `preview` / `import`).
 * - `preview` no escribe absolutamente nada.
 */

export const PAYROLL_SHEET = "PAYROLL";
export const SECRETARIA_SHEET = "SECRETARIA";

export interface Payroll142RawRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  employerIdentification: string;
  basePay: unknown;
  payperDay: unknown;
  ryde: unknown;
  tips: unknown;
  reimbursements: unknown;
  travelHours: unknown;
  otros: unknown;
  discount: unknown;
  approvedTotal: unknown;
  observations?: string;
}

export interface BridgePreviewComponent {
  key: string;
  conceptId: string;
  conceptName: string;
  category: string;
  raw: string;
  value: number;
  alreadyExists: boolean;
}

export interface BridgePreviewRow {
  rowNumber: number;
  worker: string;
  employerIdentification: string;
  employeeId: string | null;
  identityStatus: "MATCHED" | "AMBIGUOUS" | "NOT_FOUND";
  identityMethod: string;
  basePay: number | null;
  basePayRaw: string;
  components: BridgePreviewComponent[];
  componentSum: number;
  approvedTotal: number | null;
  approvedTotalRaw: string;
  difference: number;
  hasApprovedTotalOverride: boolean;
  internalNote: string | null;
  basePayAlreadyExists: boolean;
  warnings: string[];
  status: "OK" | "REVIEW" | "BLOCKED";
}

export interface BridgeSummary {
  mode: "preview" | "import";
  sheet: string;
  fileName: string | null;
  period: { id: string; startDate: string; endDate: string; status: string };
  workers: number;
  matched: number;
  ambiguous: number;
  notFound: number;
  parseIssues: number;
  approvedTotalOverrides: number;
  grandApprovedTotal: number;
  grandComponentSum: number;
  grandDifference: number;
  canImport: boolean;
  blockers: string[];
}

export interface BridgePreviewResult {
  summary: BridgeSummary;
  rows: BridgePreviewRow[];
}

export interface BridgeImportResult {
  summary: BridgeSummary;
  basePayRows: number;
  movementsInserted: number;
  skippedExistingMovements: number;
}

const HEADER_ALIASES: Record<keyof Omit<Payroll142RawRow, "rowNumber">, string[]> = {
  firstName: ["first name", "firstname", "nombre"],
  lastName: ["last name", "lastname", "apellido"],
  employerIdentification: ["employer identification", "employer id", "identification"],
  basePay: ["total pay"],
  payperDay: ["payper day", "pay per day", "payperday"],
  ryde: ["ryde", "ride"],
  tips: ["tips", "propinas"],
  reimbursements: ["reimbursements", "reimbursement", "reintegros"],
  travelHours: ["travel hours", "travel"],
  otros: ["otros", "otros pagos"],
  discount: ["discount", "descuento", "descuentos"],
  approvedTotal: ["total"],
  observations: ["observaciones", "observacion", "notes", "notas"],
};

function findHeader(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, key: h.toLowerCase().trim() }));
  for (const alias of aliases) {
    const exact = normalized.find((h) => h.key === alias);
    if (exact) return exact.raw;
  }
  for (const alias of aliases) {
    const partial = normalized.find((h) => h.key.includes(alias));
    if (partial) return partial.raw;
  }
  return null;
}

/** Extrae filas crudas del sheet PAYROLL. No parsea dinero ni resuelve identidad. */
export function extractPayrollRows(json: Record<string, unknown>[]): Payroll142RawRow[] {
  if (!json.length) return [];
  const headers = Object.keys(json[0]);
  const map = {} as Record<string, string | null>;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    map[field] = findHeader(headers, aliases);
  }

  const cell = (row: Record<string, unknown>, field: string) => {
    const header = map[field];
    return header ? row[header] : undefined;
  };

  const rows: Payroll142RawRow[] = [];
  json.forEach((row, idx) => {
    const firstName = String(cell(row, "firstName") ?? "").trim();
    const lastName = String(cell(row, "lastName") ?? "").trim();
    const employerIdentification = String(cell(row, "employerIdentification") ?? "").trim();
    if (!firstName && !lastName && !employerIdentification) return;
    // Fila de totales del propio Excel
    if (/^(total|totales|grand total)$/i.test(firstName)) return;
    if (/^system$/i.test(firstName)) return;

    rows.push({
      rowNumber: idx + 2,
      firstName,
      lastName,
      employerIdentification,
      basePay: cell(row, "basePay"),
      payperDay: cell(row, "payperDay"),
      ryde: cell(row, "ryde"),
      tips: cell(row, "tips"),
      reimbursements: cell(row, "reimbursements"),
      travelHours: cell(row, "travelHours"),
      otros: cell(row, "otros"),
      discount: cell(row, "discount"),
      approvedTotal: cell(row, "approvedTotal"),
      observations: String(cell(row, "observations") ?? "").trim() || undefined,
    });
  });

  return rows;
}

async function invokeBridge(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("import-payroll-extras", { body: payload });
  if (error) {
    const message = (data as any)?.error ?? error.message;
    throw new Error(message || "No se pudo procesar el cierre aprobado.");
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export async function previewExternalPayrollClose(params: {
  companyId: string;
  periodId: string;
  rows: Payroll142RawRow[];
  fileName?: string;
}): Promise<BridgePreviewResult> {
  const data = await invokeBridge({
    mode: "preview",
    companyId: params.companyId,
    periodId: params.periodId,
    sheetName: PAYROLL_SHEET,
    fileName: params.fileName,
    rows: params.rows,
  });
  return { summary: data.summary, rows: data.rows };
}

export async function importExternalPayrollClose(params: {
  companyId: string;
  periodId: string;
  rows: Payroll142RawRow[];
  fileName?: string;
  expectedGrandTotal: number;
  acknowledgeOverrides: boolean;
}): Promise<BridgeImportResult> {
  const data = await invokeBridge({
    mode: "import",
    companyId: params.companyId,
    periodId: params.periodId,
    sheetName: PAYROLL_SHEET,
    fileName: params.fileName,
    rows: params.rows,
    expectedGrandTotal: params.expectedGrandTotal,
    acknowledgeOverrides: params.acknowledgeOverrides,
  });
  return {
    summary: data.summary,
    basePayRows: data.basePayRows,
    movementsInserted: data.movementsInserted,
    skippedExistingMovements: data.skippedExistingMovements,
  };
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
