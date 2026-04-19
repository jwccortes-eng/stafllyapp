import { useCompanyConfig } from "@/hooks/useCompanyConfig";

/**
 * Per-company payroll consecutive numbering configuration.
 *
 * Stored in `company_settings` under key `payroll_sequence`.
 * A DB trigger (`assign_pay_period_sequence`) reads this on INSERT
 * to assign `pay_periods.sequence_number` automatically — regardless
 * of whether the period is organic, imported, or reconciled.
 */
export interface PayrollSequenceConfig {
  /** When false, no sequence is auto-assigned. Existing values are preserved. */
  use_payroll_sequence: boolean;
  /** Visible prefix shown to users (e.g. "P-", "PR-"). UI-only — not stored in sequence_number. */
  prefix: string;
  /** Next number the trigger will try to use. The trigger always picks max+1 if greater. */
  next_number: number;
  /** Zero-padding width for display (e.g. 4 → "0042"). UI-only. */
  padding: number;
  /** Numbering scope — resets per year or runs continuously. */
  scope: "all_time" | "year";
}

export const PAYROLL_SEQUENCE_DEFAULTS: PayrollSequenceConfig = {
  use_payroll_sequence: false,
  prefix: "",
  next_number: 1,
  padding: 0,
  scope: "all_time",
};

/**
 * Format a sequence number for display using the company config.
 * Examples:
 *   formatSequence(42, { prefix: "P-", padding: 4 }) => "P-0042"
 *   formatSequence(115, { prefix: "", padding: 0 }) => "115"
 */
export function formatSequence(
  num: number | null | undefined,
  config: Pick<PayrollSequenceConfig, "prefix" | "padding">,
): string {
  if (num == null) return "—";
  const padded = config.padding > 0 ? String(num).padStart(config.padding, "0") : String(num);
  return `${config.prefix}${padded}`;
}

export function usePayrollSequenceConfig() {
  return useCompanyConfig<PayrollSequenceConfig>(
    "payroll_sequence",
    PAYROLL_SEQUENCE_DEFAULTS,
  );
}
