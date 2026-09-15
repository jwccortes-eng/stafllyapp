/**
 * Historial de pagos del trabajador — "Mis pagos".
 *
 * Une, SIN duplicar, las dos fuentes canónicas que ya existen:
 *
 *   1. Recibos nativos publicados  → RPC `worker_pay_statements` (frozen_total)
 *   2. Reportes históricos importados (Connecteam) → `period_base_pay` con
 *      `import_id`, visibles al trabajador por la política RLS
 *      "Employees can view own base pay".
 *
 * Reglas duras:
 *   - No se crea ninguna tabla, RPC ni pantalla nueva.
 *   - El importe nativo es SIEMPRE `frozen_total` (nunca se recalcula).
 *   - El importe histórico es SIEMPRE `base_total_pay` tal como se importó.
 *   - Si un periodo tiene recibo nativo publicado, el registro histórico del
 *     mismo periodo NO se muestra (el recibo manda). Nunca se suman ambos.
 *   - Solo lectura. Este módulo jamás escribe.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  fetchWorkerPayStatements,
  type WorkerPayStatementSummary,
} from "@/lib/payroll/pay-statement";

export type PaymentHistoryKind = "native" | "historical";

export interface HistoricalPayReport {
  period_id: string;
  start_date: string;
  end_date: string;
  sequence_number: number | null;
  amount: number;
  company_id: string;
}

export interface PaymentHistoryItem {
  key: string;
  kind: PaymentHistoryKind;
  period_id: string;
  start_date: string;
  end_date: string;
  sequence_number: number | null;
  amount: number;
  company_id: string;
  company_name: string | null;
  /** Solo para recibos nativos: permite abrir el desglose congelado. */
  statement: WorkerPayStatementSummary | null;
  paid_at: string | null;
}

/**
 * Unión pura. `native` gana sobre `historical` en el mismo periodo.
 * Orden: periodo más reciente primero.
 */
export function mergePaymentHistory(
  native: WorkerPayStatementSummary[],
  historical: HistoricalPayReport[],
): PaymentHistoryItem[] {
  const nativeItems: PaymentHistoryItem[] = native.map((s) => ({
    key: `native:${s.statement_id}`,
    kind: "native",
    period_id: s.period_id,
    start_date: s.start_date,
    end_date: s.end_date,
    sequence_number: s.sequence_number,
    amount: s.frozen_total,
    company_id: s.company_id,
    company_name: s.company_name,
    statement: s,
    paid_at: s.paid_at,
  }));

  const covered = new Set(nativeItems.map((i) => `${i.company_id}|${i.period_id}`));

  const historicalItems: PaymentHistoryItem[] = historical
    .filter((h) => !covered.has(`${h.company_id}|${h.period_id}`))
    .map((h) => ({
      key: `historical:${h.company_id}:${h.period_id}`,
      kind: "historical",
      period_id: h.period_id,
      start_date: h.start_date,
      end_date: h.end_date,
      sequence_number: h.sequence_number,
      amount: h.amount,
      company_id: h.company_id,
      company_name: null,
      statement: null,
      paid_at: null,
    }));

  return [...nativeItems, ...historicalItems].sort((a, b) =>
    b.start_date.localeCompare(a.start_date),
  );
}

export interface PaymentHistorySummary {
  /** Número de pagos visibles (nativos + históricos, sin duplicados). */
  count: number;
  /** Importe del pago visible más reciente por fecha de periodo. */
  latest: number;
  /** Suma de los pagos visibles cuyo periodo termina en el año en curso. */
  ytd: number;
  nativeCount: number;
  historicalCount: number;
}

export function summarizePaymentHistory(
  items: PaymentHistoryItem[],
  now: Date = new Date(),
): PaymentHistorySummary {
  const year = now.getFullYear();
  const ytd = items
    .filter((i) => Number(i.end_date.slice(0, 4)) === year)
    .reduce((s, i) => s + i.amount, 0);
  return {
    count: items.length,
    latest: items[0]?.amount ?? 0,
    ytd,
    nativeCount: items.filter((i) => i.kind === "native").length,
    historicalCount: items.filter((i) => i.kind === "historical").length,
  };
}

/**
 * Lee los reportes históricos importados del propio trabajador.
 * RLS limita las filas a `employees.user_id = auth.uid()`: no hay forma de
 * ver filas de otra persona ni de otra empresa.
 */
export async function fetchWorkerHistoricalReports(): Promise<HistoricalPayReport[]> {
  const { data: bp, error } = await supabase
    .from("period_base_pay")
    .select("period_id, base_total_pay, company_id")
    .not("import_id", "is", null);

  if (error) throw error;
  const rows = (bp ?? []) as Array<{
    period_id: string;
    base_total_pay: number | string | null;
    company_id: string;
  }>;
  if (rows.length === 0) return [];

  const periodIds = [...new Set(rows.map((r) => r.period_id))];
  const { data: periods, error: pErr } = await supabase
    .from("pay_periods")
    .select("id, start_date, end_date, sequence_number")
    .in("id", periodIds);
  if (pErr) throw pErr;

  const byId = new Map(
    ((periods ?? []) as any[]).map((p) => [p.id as string, p]),
  );

  return rows
    .map((r) => {
      const p = byId.get(r.period_id);
      if (!p) return null;
      return {
        period_id: r.period_id,
        start_date: p.start_date as string,
        end_date: p.end_date as string,
        sequence_number: p.sequence_number != null ? Number(p.sequence_number) : null,
        amount: Number(r.base_total_pay) || 0,
        company_id: r.company_id,
      } satisfies HistoricalPayReport;
    })
    .filter((x): x is HistoricalPayReport => x !== null);
}

/** Historial completo listo para pintar. Solo lectura. */
export async function fetchWorkerPaymentHistory(): Promise<PaymentHistoryItem[]> {
  const [native, historical] = await Promise.all([
    fetchWorkerPayStatements(),
    fetchWorkerHistoricalReports().catch(() => [] as HistoricalPayReport[]),
  ]);
  return mergePaymentHistory(native, historical);
}
