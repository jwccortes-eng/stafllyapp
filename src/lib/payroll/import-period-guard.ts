/**
 * Guardarraíles P0 de importación de nómina (espejo cliente).
 *
 * La autoridad es el servidor (`supabase/functions/_shared/payroll-import-guard.ts`).
 * Aquí se replica la misma lógica sólo para avisar antes de llamar al preview.
 * No cambia ningún cálculo de nómina.
 */

export interface DetectedFileRange {
  start: string;
  end: string;
}

const ISO = /(\d{4})-(\d{2})-(\d{2})/g;
const COMPACT = /(\d{4})(\d{2})(\d{2})/g;

function isValidDate(value: string): boolean {
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && value === d.toISOString().slice(0, 10);
}

/** Detecta el rango efectivo representado por el nombre del archivo. */
export function detectFileRange(fileName?: string | null): DetectedFileRange | null {
  if (!fileName) return null;
  const base = String(fileName);

  const iso = [...base.matchAll(ISO)].map((m) => `${m[1]}-${m[2]}-${m[3]}`).filter(isValidDate);
  if (iso.length >= 2) return { start: iso[0], end: iso[1] };

  const compact = [...base.matchAll(COMPACT)]
    .map((m) => `${m[1]}-${m[2]}-${m[3]}`)
    .filter(isValidDate);
  if (compact.length >= 2) return { start: compact[0], end: compact[1] };

  return null;
}

export interface GuardPeriod {
  start_date: string;
  end_date: string;
  status: string;
}

export interface GuardResult {
  fileRange: DetectedFileRange | null;
  blockers: string[];
  warnings: string[];
}

const BLOCKING_STATUSES = new Set(["closed", "paid", "locked"]);

export function evaluatePayrollImportGuards(input: {
  fileName?: string | null;
  period: GuardPeriod;
  publishedStatements: number;
}): GuardResult {
  const { period, publishedStatements } = input;
  const fileRange = detectFileRange(input.fileName);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!fileRange) {
    warnings.push(
      "El nombre del archivo no indica un rango de fechas. Verifica manualmente que corresponda al período seleccionado.",
    );
  } else if (fileRange.start !== period.start_date || fileRange.end !== period.end_date) {
    blockers.push(
      `Este archivo corresponde a ${fileRange.start} – ${fileRange.end}. ` +
        `El período seleccionado es ${period.start_date} – ${period.end_date}. ` +
        "Selecciona el período correcto antes de continuar.",
    );
  }

  if (BLOCKING_STATUSES.has(String(period.status).toLowerCase())) {
    blockers.push("Este período está cerrado y no acepta nuevas importaciones.");
  }

  if (publishedStatements > 0) {
    blockers.push(
      `Este período tiene ${publishedStatements} recibo(s) publicado(s). ` +
        "No se pueden modificar sus datos mediante importación normal.",
    );
  }

  return { fileRange, blockers, warnings };
}
