/**
 * Pay Statement — adaptador canónico del recibo de pago publicado.
 *
 * Fuente única de verdad:
 *   pay_statements (cabecera congelada) + movements (line items canónicos)
 *
 * Reglas duras:
 *   - El total mostrado al trabajador es SIEMPRE `frozen_total` (server-side).
 *     Nunca se recalcula en el cliente.
 *   - El trabajador jamás lee `movements` directamente: todo pasa por los RPC
 *     `worker_pay_statements` y `worker_pay_statement_detail`, que solo devuelven
 *     líneas aprobadas, visibles y con nota visible (nunca la nota interna).
 *   - No se usan horas programadas ni `time_entries` para calcular nada.
 */
import { supabase } from "@/integrations/supabase/client";

export type PayStatementSource = "external_approved" | "stafly_calculated";

export interface WorkerPayStatementSummary {
  statement_id: string;
  company_id: string;
  company_name: string | null;
  period_id: string;
  start_date: string;
  end_date: string;
  sequence_number: number | null;
  source: PayStatementSource;
  frozen_total: number;
  frozen_base_total: number;
  frozen_extras_total: number;
  frozen_deductions_total: number;
  line_count: number;
  published_at: string | null;
  paid_at: string | null;
}

export interface PayStatementLine {
  id: string;
  concept_name: string;
  category: "extra" | "deduction";
  unit_label: string | null;
  quantity: number | null;
  rate: number | null;
  total_value: number;
  /** Nota escrita explícitamente para el trabajador. Nunca la nota interna. */
  note: string | null;
}

export interface WorkerPayStatementDetail extends
  Omit<WorkerPayStatementSummary, "statement_id" | "company_id" | "company_name" | "line_count"> {
  statement_id: string;
  lines: PayStatementLine[];
}

// ---------------------------------------------------------------------------
// Clasificación de conceptos (etiquetas del Excel de payroll aprobado)
// ---------------------------------------------------------------------------

export type PayBucketKey =
  | "base"
  | "per_day"
  | "ride"
  | "tips"
  | "reimbursement"
  | "travel"
  | "other"
  | "discount";

export const PAY_BUCKET_LABEL: Record<PayBucketKey, string> = {
  base: "Pago base",
  per_day: "Pago por día",
  ride: "Transporte / Ride",
  tips: "Propinas",
  reimbursement: "Reintegros",
  travel: "Horas de viaje",
  other: "Otros",
  discount: "Descuentos",
};

const EARNING_ORDER: PayBucketKey[] = ["base", "per_day", "ride", "tips", "reimbursement", "travel", "other"];

export function classifyConcept(name: string, category: string): PayBucketKey {
  if (category === "deduction") return "discount";
  const n = (name || "").toLowerCase();
  if (/transporte|ryde|\bride\b/.test(n)) return "ride";
  if (/propina|\btip/.test(n)) return "tips";
  if (/reintegro|reembols|reimburs/.test(n)) return "reimbursement";
  if (/viaje|travel/.test(n)) return "travel";
  if (/(pago\s*\/?\s*d[ií]a)|per\s*day|daily|weekend job|jornada/.test(n)) return "per_day";
  return "other";
}

export interface PayBucket {
  key: PayBucketKey;
  label: string;
  amount: number;
  lines: PayStatementLine[];
}

export interface PayStatementBreakdown {
  earnings: PayBucket[];
  adjustments: PayBucket[];
  total: number;
}

/**
 * Construye el desglose visible. Los buckets vacíos NO se devuelven.
 * `total` es siempre el total congelado del statement.
 */
export function buildStatementBreakdown(detail: WorkerPayStatementDetail): PayStatementBreakdown {
  const map = new Map<PayBucketKey, PayBucket>();

  const push = (key: PayBucketKey, amount: number, line?: PayStatementLine) => {
    const existing = map.get(key) ?? { key, label: PAY_BUCKET_LABEL[key], amount: 0, lines: [] };
    existing.amount += amount;
    if (line) existing.lines.push(line);
    map.set(key, existing);
  };

  if (Number(detail.frozen_base_total) !== 0) {
    push("base", Number(detail.frozen_base_total));
  }

  for (const line of detail.lines) {
    const key = classifyConcept(line.concept_name, line.category);
    push(key, key === "discount" ? Math.abs(Number(line.total_value)) : Number(line.total_value), line);
  }

  const earnings = EARNING_ORDER
    .map((k) => map.get(k))
    .filter((b): b is PayBucket => !!b && (b.amount !== 0 || b.lines.length > 0));

  const discount = map.get("discount");
  const adjustments = discount && (discount.amount !== 0 || discount.lines.length > 0) ? [discount] : [];

  return { earnings, adjustments, total: Number(detail.frozen_total) };
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export async function fetchWorkerPayStatements(): Promise<WorkerPayStatementSummary[]> {
  const { data, error } = await supabase.rpc("worker_pay_statements");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    statement_id: r.statement_id,
    company_id: r.company_id,
    company_name: r.company_name ?? null,
    period_id: r.period_id,
    start_date: r.start_date,
    end_date: r.end_date,
    sequence_number: r.sequence_number ?? null,
    source: (r.source ?? "external_approved") as PayStatementSource,
    frozen_total: Number(r.frozen_total) || 0,
    frozen_base_total: Number(r.frozen_base_total) || 0,
    frozen_extras_total: Number(r.frozen_extras_total) || 0,
    frozen_deductions_total: Number(r.frozen_deductions_total) || 0,
    line_count: Number(r.line_count) || 0,
    published_at: r.published_at ?? null,
    paid_at: r.paid_at ?? null,
  }));
}

export async function fetchWorkerPayStatementDetail(
  statementId: string,
): Promise<WorkerPayStatementDetail | null> {
  const { data, error } = await supabase.rpc("worker_pay_statement_detail", {
    _statement_id: statementId,
  });
  if (error) throw error;
  if (!data) return null;
  const d = data as any;
  return {
    statement_id: d.statement_id,
    period_id: d.period_id,
    start_date: d.start_date,
    end_date: d.end_date,
    sequence_number: d.sequence_number ?? null,
    source: (d.source ?? "external_approved") as PayStatementSource,
    frozen_total: Number(d.frozen_total) || 0,
    frozen_base_total: Number(d.frozen_base_total) || 0,
    frozen_extras_total: Number(d.frozen_extras_total) || 0,
    frozen_deductions_total: Number(d.frozen_deductions_total) || 0,
    published_at: d.published_at ?? null,
    paid_at: d.paid_at ?? null,
    lines: ((d.lines ?? []) as any[]).map((l) => ({
      id: l.id,
      concept_name: l.concept_name ?? "",
      category: (l.category ?? "extra") as "extra" | "deduction",
      unit_label: l.unit_label ?? null,
      quantity: l.quantity != null ? Number(l.quantity) : null,
      rate: l.rate != null ? Number(l.rate) : null,
      total_value: Number(l.total_value) || 0,
      note: l.note ?? null,
    })),
  };
}

/** Estado visible del recibo para el trabajador. */
export function statementStatusLabel(s: { paid_at: string | null }): string {
  return s.paid_at ? "Pagado" : "Publicado";
}

export function fmtStatementMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}
