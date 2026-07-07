/**
 * exportDryRunCsv — client-side CSV export for the Native Payroll Dry-Run.
 *
 * READ-ONLY / LOCAL-ONLY:
 *  - Builds a CSV from data already in memory. No network calls, no storage
 *    upload, no email.
 *  - Watermarked so it cannot be mistaken for official payroll.
 *  - Never includes money, pay rates, SSN/EIN, documents, or scheduled_shift
 *    hours. Only native `time_entries` totals and Connecteam period totals
 *    already surfaced in the UI.
 */

export interface DryRunCsvRow {
  employee_id: string;
  worker_name: string;
  connecteam_period_hours: number | null;
  native_time_entries_hours: number | null;
  delta_hours: number | null;
  delta_percent: number | null;
  status: string;
  reasons: string[];
  closed_entries_count: number;
  open_entries_count: number;
  entries_without_shift_id: number;
  abnormal_duration_count: number;
  midnight_cross_count: number;
  overlap_count: number;
  comparable: boolean;
  first_issue_date: string | null;
  largest_daily_native_hours: number | null;
}

export interface DryRunCsvMeta {
  company_id: string;
  company_name: string;
  period_id: string;
  period_label: string;
  generated_at: string; // ISO
}

const HEADER = [
  "DRY_RUN_READ_ONLY_NOT_PAYROLL",
  "source_reference",
  "native_source",
  "official_payroll_source",
  "generated_at",
  "company_id",
  "company_name",
  "period_id",
  "period_label",
  "employee_id",
  "worker_name",
  "connecteam_period_hours",
  "native_time_entries_hours",
  "delta_hours",
  "delta_percent",
  "status",
  "reasons",
  "closed_entries_count",
  "open_entries_count",
  "entries_without_shift_id",
  "abnormal_duration_count",
  "midnight_cross_count",
  "overlap_count",
  "comparable",
  "first_issue_date",
  "largest_daily_native_hours",
];

function escape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildDryRunCsv(meta: DryRunCsvMeta, rows: DryRunCsvRow[]): string {
  const lines: string[] = [];
  lines.push(HEADER.join(","));
  for (const r of rows) {
    lines.push(
      [
        "true",
        "period_base_pay.total_work_hours",
        "time_entries_closed_only",
        "Connecteam / reconciliación externa",
        meta.generated_at,
        meta.company_id,
        meta.company_name,
        meta.period_id,
        meta.period_label,
        r.employee_id,
        r.worker_name,
        r.connecteam_period_hours ?? "",
        r.native_time_entries_hours ?? "",
        r.delta_hours ?? "",
        r.delta_percent != null ? r.delta_percent.toFixed(2) : "",
        r.status,
        r.reasons.join("|"),
        r.closed_entries_count,
        r.open_entries_count,
        r.entries_without_shift_id,
        r.abnormal_duration_count,
        r.midnight_cross_count,
        r.overlap_count,
        r.comparable ? "true" : "false",
        r.first_issue_date ?? "",
        r.largest_daily_native_hours != null
          ? r.largest_daily_native_hours.toFixed(2)
          : "",
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadDryRunCsv(
  meta: DryRunCsvMeta,
  rows: DryRunCsvRow[],
): void {
  const csv = buildDryRunCsv(meta, rows);
  // Prepend a BOM so Excel opens UTF-8 cleanly.
  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safePeriod = meta.period_label.replace(/[^\w.-]+/g, "_");
  a.href = url;
  a.download = `dry-run_NOT_PAYROLL_${safePeriod}_${meta.generated_at.slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
