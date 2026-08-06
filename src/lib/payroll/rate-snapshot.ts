/**
 * Payroll rate snapshots — read-only historical truth.
 *
 * A snapshot is the immutable photograph taken when a period was consolidated:
 * real hours from time_entries, the rate actually applied, its source and
 * effective window, the overtime rule, who consolidated and when.
 *
 * Payroll history is reconstructed from here, NEVER from the worker's current
 * rate. No writes: the table is append-only and only the consolidation
 * function can insert into it.
 */

import { supabase } from "@/integrations/supabase/client";
import type { PayrollRateSource } from "./rate-resolver";

export interface PayrollRateSnapshot {
  id: string;
  company_id: string;
  employee_id: string;
  payroll_period_id: string;
  concept_id: string | null;
  concept_name: string | null;
  time_entry_ids: string[];
  time_entry_count: number;
  hours_source: string;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  pay_rate: number;
  currency: string;
  rate_source: PayrollRateSource;
  is_legacy_source: boolean;
  source_entity_id: string | null;
  source_version: string | null;
  effective_date: string | null;
  effective_from: string | null;
  effective_to: string | null;
  rate_changed_mid_period: boolean;
  rate_by_work_date: Array<{ work_date: string; rate: number | null }>;
  overtime_multiplier: number;
  overtime_threshold_hours: number;
  gross_base_amount: number;
  period_status_at_resolution: string | null;
  resolved_at: string;
  resolved_by: string | null;
  consolidation_version: number;
  audit_reference: string | null;
}

const SNAPSHOT_COLUMNS =
  "id, company_id, employee_id, payroll_period_id, concept_id, concept_name, time_entry_ids, time_entry_count, hours_source, total_hours, regular_hours, overtime_hours, pay_rate, currency, rate_source, is_legacy_source, source_entity_id, source_version, effective_date, effective_from, effective_to, rate_changed_mid_period, rate_by_work_date, overtime_multiplier, overtime_threshold_hours, gross_base_amount, period_status_at_resolution, resolved_at, resolved_by, consolidation_version, audit_reference";

function normalize(row: Record<string, unknown>): PayrollRateSnapshot {
  return {
    ...(row as unknown as PayrollRateSnapshot),
    total_hours: Number(row.total_hours ?? 0),
    regular_hours: Number(row.regular_hours ?? 0),
    overtime_hours: Number(row.overtime_hours ?? 0),
    pay_rate: Number(row.pay_rate ?? 0),
    overtime_multiplier: Number(row.overtime_multiplier ?? 1.5),
    overtime_threshold_hours: Number(row.overtime_threshold_hours ?? 40),
    gross_base_amount: Number(row.gross_base_amount ?? 0),
    time_entry_ids: (row.time_entry_ids as string[]) ?? [],
    rate_by_work_date:
      (row.rate_by_work_date as PayrollRateSnapshot["rate_by_work_date"]) ?? [],
  };
}

/** Latest (highest consolidation_version) snapshot for a worker in a period. */
export async function fetchLatestRateSnapshot(input: {
  companyId: string;
  employeeId: string;
  periodId: string;
}): Promise<PayrollRateSnapshot | null> {
  const { companyId, employeeId, periodId } = input;
  if (!companyId || !employeeId || !periodId) return null;

  const { data, error } = await (supabase as any)
    .from("payroll_period_rate_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .eq("payroll_period_id", periodId)
    .order("consolidation_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[payroll/rate-snapshot] fetchLatestRateSnapshot failed", error);
    return null;
  }
  return data ? normalize(data as Record<string, unknown>) : null;
}

/** All snapshots of a period (latest version per worker first). */
export async function fetchPeriodRateSnapshots(input: {
  companyId: string;
  periodId: string;
}): Promise<PayrollRateSnapshot[]> {
  const { companyId, periodId } = input;
  if (!companyId || !periodId) return [];

  const { data, error } = await (supabase as any)
    .from("payroll_period_rate_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .eq("company_id", companyId)
    .eq("payroll_period_id", periodId)
    .order("consolidation_version", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("[payroll/rate-snapshot] fetchPeriodRateSnapshots failed", error);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

/** Keeps only the current version per worker (snapshots are append-only). */
export function latestPerEmployee(rows: PayrollRateSnapshot[]): PayrollRateSnapshot[] {
  const byEmployee = new Map<string, PayrollRateSnapshot>();
  for (const row of rows) {
    const current = byEmployee.get(row.employee_id);
    if (!current || row.consolidation_version > current.consolidation_version) {
      byEmployee.set(row.employee_id, row);
    }
  }
  return [...byEmployee.values()];
}

/** Historical reconstruction, without ever reading the worker's current rate. */
export function describeSnapshot(snapshot: PayrollRateSnapshot): string {
  const ot =
    snapshot.overtime_hours > 0
      ? ` (${snapshot.regular_hours}h regulares + ${snapshot.overtime_hours}h extra x${snapshot.overtime_multiplier})`
      : "";
  return `${snapshot.total_hours}h reales${ot} a $${snapshot.pay_rate.toFixed(2)}/h = $${snapshot.gross_base_amount.toFixed(2)}`;
}
