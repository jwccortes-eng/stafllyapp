/**
 * Payroll rate truth — single client-side entry point.
 *
 * NEVER recalculates payroll. It asks the database for the SAME rate cascade
 * that `consolidate_period_base_pay` uses (RPC `resolve_payroll_hourly_rate`),
 * so the UI can never show a rate different from the one that actually pays.
 *
 * Read-only. No writes. No fallback to 0: a missing rate is reported as missing.
 */

import { supabase } from "@/integrations/supabase/client";

/** Labels: pay rate (worker cost) is NOT the bill rate (client price). */
export const PAY_RATE_LABEL = "Tarifa de pago al trabajador";
export const BILL_RATE_LABEL = "Tarifa de cobro al cliente";

export type PayrollRateSource =
  | "legacy_shifts"
  | "concept_employee_rate"
  | "concept_default"
  | "none"
  | "unknown";

export interface PayrollRateTruth {
  rate: number | null;
  source: PayrollRateSource;
  is_legacy: boolean;
  fallback_used: boolean;
  missing_rate: boolean;
  currency: string;
  concept: string;
  period_id: string;
  period_status: string | null;
}

export const RATE_SOURCE_LABELS: Record<PayrollRateSource, string> = {
  legacy_shifts: "Importación histórica del periodo",
  concept_employee_rate: "Tarifa por concepto del trabajador",
  concept_default: "Tarifa por defecto del concepto",
  none: "Sin tarifa configurada",
  unknown: "Origen desconocido",
};

export function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(Number(rate))) return "—";
  return `$${Number(rate).toFixed(2)}/h`;
}

/** Periods that can no longer be re-consolidated. */
export const LOCKED_PERIOD_STATUSES = ["closed", "paid"] as const;

export function isPeriodLocked(status: string | null | undefined): boolean {
  return !!status && (LOCKED_PERIOD_STATUSES as readonly string[]).includes(status);
}

export async function fetchPayrollRateTruth(input: {
  companyId: string;
  employeeId: string;
  periodId: string;
}): Promise<PayrollRateTruth | null> {
  const { companyId, employeeId, periodId } = input;
  if (!companyId || !employeeId || !periodId) return null;

  const { data, error } = await (supabase as any).rpc("resolve_payroll_hourly_rate", {
    _company_id: companyId,
    _employee_id: employeeId,
    _period_id: periodId,
  });

  if (error) {
    console.error("[payroll/rate-resolver] resolve_payroll_hourly_rate failed", error);
    return null;
  }
  if (!data) return null;

  const raw = data as Record<string, unknown>;
  const rate = raw.rate == null ? null : Number(raw.rate);
  return {
    rate: rate != null && Number.isFinite(rate) ? rate : null,
    source: (raw.source as PayrollRateSource) ?? "unknown",
    is_legacy: Boolean(raw.is_legacy),
    fallback_used: Boolean(raw.fallback_used),
    missing_rate: Boolean(raw.missing_rate),
    currency: String(raw.currency ?? "USD"),
    concept: String(raw.concept ?? "Hourly Rate"),
    period_id: String(raw.period_id ?? periodId),
    period_status: (raw.period_status as string | null) ?? null,
  };
}

/** Consolidation outcome as returned by `consolidate_period_base_pay`. */
export interface ConsolidationOutcome {
  success?: boolean;
  error?: string;
  error_code?: string;
  period_status?: string;
  missing_rate_count?: number;
  legacy_rate_count?: number;
  employees_consolidated?: number;
  skipped_imported?: number;
}

/** Human copy for the consolidation result (Spanish, operational tone). */
export function describeConsolidation(result: ConsolidationOutcome | null | undefined): {
  tone: "success" | "warning" | "error";
  title: string;
  description: string;
} {
  if (!result) {
    return { tone: "error", title: "No se pudo consolidar", description: "El backend no devolvió resultado. Reintente." };
  }
  if (result.error_code === "period_locked") {
    return {
      tone: "error",
      title: "Periodo bloqueado",
      description: `Este periodo está ${result.period_status === "paid" ? "pagado" : "cerrado"} y no puede recalcularse.`,
    };
  }
  if (result.error) {
    return { tone: "error", title: "Error al consolidar", description: result.error };
  }
  const missing = result.missing_rate_count ?? 0;
  const done = result.employees_consolidated ?? 0;
  if (missing > 0) {
    return {
      tone: "warning",
      title: "Consolidación parcial",
      description: `${done} trabajador(es) consolidados. ${missing} quedaron fuera por falta de ${PAY_RATE_LABEL.toLowerCase()}. Configure la tarifa y vuelva a consolidar.`,
    };
  }
  return {
    tone: "success",
    title: "Horas consolidadas",
    description: `${done} trabajador(es) actualizados. ${result.skipped_imported ?? 0} con import preservado.`,
  };
}
