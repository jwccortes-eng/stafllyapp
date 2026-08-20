/**
 * Bulk publish de recibos de pago — adaptador canónico.
 *
 * Reglas duras:
 *   - El total mostrado al admin es SIEMPRE `frozen_total_preview`
 *     = COALESCE(approved_total_override, computed_total).
 *     Nunca se recalcula en el cliente, nunca se usa `computed_total` como
 *     "Total a publicar".
 *   - `approved_total_override = 0` es un valor VÁLIDO: se compara contra null,
 *     nunca por falsy.
 *   - La previsualización masiva es de solo lectura (RPC STABLE).
 *   - La publicación masiva delega en `publish_pay_statement` server-side y
 *     omite (skip) los recibos ya publicados: no se republican jamás.
 */
import { supabase } from "@/integrations/supabase/client";

export type BulkReadiness = "ready" | "published" | "blocked";

export interface BulkPreviewRow {
  employee_id: string;
  employer_identification: string | null;
  worker_name: string | null;
  company_id: string | null;
  base: number;
  extras: number;
  deductions: number;
  computed_total: number;
  approved_total_override: number | null;
  approved_total_source: string | null;
  frozen_total_preview: number;
  has_override: boolean;
  pending_count: number;
  line_count: number;
  statement_id: string | null;
  statement_status: string | null;
  published_frozen_total: number | null;
  published_at: string | null;
  portal_access: boolean;
  readiness: BulkReadiness;
  blocking_reason: string | null;
}

export interface BulkPublishResult {
  published: { employee_id: string; statement_id: string; frozen_total: number }[];
  skipped: { employee_id: string; reason: string }[];
  blocked: { employee_id: string; reason: string; pending_count?: number }[];
  failed: { employee_id: string; reason: string }[];
  published_count: number;
  published_total: number;
  skipped_count: number;
  blocked_count: number;
  failed_count: number;
}

/** `null` semantics explícitas: 0 es un override válido. */
export function resolveFrozenPreview(
  override: number | null | undefined,
  computed: number,
): number {
  return override === null || override === undefined ? round2(computed) : round2(Number(override));
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function fetchBulkPreview(periodId: string): Promise<BulkPreviewRow[]> {
  const { data, error } = await supabase.rpc("bulk_pay_statement_preview" as never, {
    _period_id: periodId,
    _employee_ids: null,
  } as never);
  if (error) throw error;
  const rows = ((data as any)?.rows ?? []) as any[];
  return rows.map((r) => ({
    employee_id: r.employee_id,
    employer_identification: r.employer_identification ?? null,
    worker_name: r.worker_name ?? null,
    company_id: r.company_id ?? null,
    base: Number(r.base) || 0,
    extras: Number(r.extras) || 0,
    deductions: Number(r.deductions) || 0,
    computed_total: Number(r.computed_total) || 0,
    approved_total_override:
      r.approved_total_override === null || r.approved_total_override === undefined
        ? null
        : Number(r.approved_total_override),
    approved_total_source: r.approved_total_source ?? null,
    frozen_total_preview: Number(r.frozen_total_preview) || 0,
    has_override: Boolean(r.has_override),
    pending_count: Number(r.pending_count) || 0,
    line_count: Number(r.line_count) || 0,
    statement_id: r.statement_id ?? null,
    statement_status: r.statement_status ?? null,
    published_frozen_total:
      r.published_frozen_total === null || r.published_frozen_total === undefined
        ? null
        : Number(r.published_frozen_total),
    published_at: r.published_at ?? null,
    portal_access: Boolean(r.portal_access),
    readiness: (r.readiness ?? "blocked") as BulkReadiness,
    blocking_reason: r.blocking_reason ?? null,
  }));
}

export async function bulkPublish(
  periodId: string,
  employeeIds: string[],
): Promise<BulkPublishResult> {
  const { data, error } = await supabase.rpc("bulk_publish_pay_statements" as never, {
    _period_id: periodId,
    _employee_ids: employeeIds,
    _source: "external_approved",
  } as never);
  if (error) throw error;
  const d = (data ?? {}) as any;
  return {
    published: d.published ?? [],
    skipped: d.skipped ?? [],
    blocked: d.blocked ?? [],
    failed: d.failed ?? [],
    published_count: Number(d.published_count) || 0,
    published_total: Number(d.published_total) || 0,
    skipped_count: Number(d.skipped_count) || 0,
    blocked_count: Number(d.blocked_count) || 0,
    failed_count: Number(d.failed_count) || 0,
  };
}

export const bulkMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
