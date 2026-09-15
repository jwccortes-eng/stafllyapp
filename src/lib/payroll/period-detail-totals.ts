/**
 * period-detail-totals — aritmética de presentación del detalle de nómina por persona.
 *
 * Solo lectura: NO modifica movimientos, base ni cierres externos.
 *
 * Regla de signo: las deducciones pueden estar almacenadas ya en negativo
 * (`total_value = -530`). El total calculado siempre usa el valor ABSOLUTO de
 * las deducciones y lo resta UNA sola vez. Nunca se resta un valor ya negativo.
 *
 * Dos verdades monetarias distintas, nunca mezcladas:
 *  - Total calculado en Stafly = base + extras aprobados − deducciones aprobadas.
 *  - Total aprobado (cierre externo) = `period_base_pay.approved_total_override`.
 */

export interface MovementLike {
  total_value: number;
  /** "extra" | "deduction" */
  category: string;
  /** "approved" | "pending" | null (null = aprobado por defecto, igual que el RPC) */
  approval_status?: string | null;
}

export interface PeriodDetailTotals {
  base: number;
  approvedExtras: number;
  /** Positivo. Se resta una sola vez. */
  approvedDeductions: number;
  pendingExtras: number;
  /** Positivo. */
  pendingDeductions: number;
  pendingCount: number;
  /** base + approvedExtras − approvedDeductions */
  calculatedTotal: number;
  /** Total aprobado del cierre externo, o null si no existe. */
  approvedTotal: number | null;
  hasExternalClose: boolean;
  /** approvedTotal − calculatedTotal (0 si no hay cierre externo). */
  externalDifference: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const isApproved = (m: MovementLike) => (m.approval_status ?? "approved") === "approved";

export function computePeriodDetailTotals(
  base: number,
  movements: MovementLike[],
  approvedTotalOverride: number | null | undefined,
): PeriodDetailTotals {
  let approvedExtras = 0;
  let approvedDeductions = 0;
  let pendingExtras = 0;
  let pendingDeductions = 0;
  let pendingCount = 0;

  for (const m of movements) {
    const value = Number(m.total_value) || 0;
    const approved = isApproved(m);
    if (!approved) pendingCount += 1;
    if (m.category === "deduction") {
      const abs = Math.abs(value);
      if (approved) approvedDeductions += abs;
      else pendingDeductions += abs;
    } else {
      if (approved) approvedExtras += value;
      else pendingExtras += value;
    }
  }

  const safeBase = Number(base) || 0;
  const calculatedTotal = round2(safeBase + approvedExtras - approvedDeductions);
  const approvedTotal =
    approvedTotalOverride === null || approvedTotalOverride === undefined
      ? null
      : round2(Number(approvedTotalOverride));

  return {
    base: round2(safeBase),
    approvedExtras: round2(approvedExtras),
    approvedDeductions: round2(approvedDeductions),
    pendingExtras: round2(pendingExtras),
    pendingDeductions: round2(pendingDeductions),
    pendingCount,
    calculatedTotal,
    approvedTotal,
    hasExternalClose: approvedTotal !== null && approvedTotal !== calculatedTotal,
    externalDifference: approvedTotal === null ? 0 : round2(approvedTotal - calculatedTotal),
  };
}
