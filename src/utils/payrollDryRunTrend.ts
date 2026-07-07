/**
 * payrollDryRunTrend — READ-ONLY helpers for the batch/trend view of the
 * Native Payroll Dry-Run.
 *
 * HARD RULES (same as the single-period view):
 *  - No writes anywhere. No RPC mutations. No storage uploads.
 *  - No payroll calculation. Compares already-persisted hours only.
 *  - `period_base_pay.total_work_hours` is the Connecteam / reconciliación
 *    reference. `scheduled_shifts` is NEVER used as a source of pay.
 *  - No money, rates, SSN/EIN, or documents surfaced.
 */
import { detectTimeEntryOverlaps } from "./detectTimeEntryOverlaps";

export interface TrendPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  sequence_number: number | null;
}

export interface TrendPBP {
  employee_id: string;
  total_work_hours: number | null;
}

export interface TrendTE {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number | null;
}

export type PeriodStatus = "stable" | "review" | "high_risk";

export interface PeriodCriticalWorker {
  employee_id: string;
  deltaHours: number;
  reasons: string[];
}

export interface PeriodMetrics {
  period: TrendPeriod;
  workers: number;
  comparable: number;
  comparablePct: number | null;
  connecteamHours: number;
  nativeHours: number;
  deltaHours: number;
  deltaPercent: number | null;
  criticalWorkers: number;
  notComparableWorkers: number;
  openEntries: number;
  noShiftEntries: number;
  abnormalEntries: number;
  midnightEntries: number;
  overlapEntries: number;
  status: PeriodStatus;
  criticalList: PeriodCriticalWorker[];
}

const MINOR_DELTA_HOURS = 0.5;
const CRITICAL_DELTA_HOURS = 2;
const ABNORMAL_MAX_HOURS = 16;

/**
 * Compute per-period metrics from already-loaded PBP + TE rows.
 * Read-only — no side effects.
 */
export function computePeriodMetrics(
  period: TrendPeriod,
  pbp: TrendPBP[],
  entries: TrendTE[],
): PeriodMetrics {
  const pbpMap = new Map<string, TrendPBP>();
  for (const r of pbp) pbpMap.set(r.employee_id, r);

  interface Agg {
    hours: number;
    entries: number;
    open: number;
    noShiftLink: number;
    midnight: number;
    abnormal: number;
  }
  const nativeAgg = new Map<string, Agg>();
  for (const e of entries) {
    const a = nativeAgg.get(e.employee_id) ?? {
      hours: 0, entries: 0, open: 0, noShiftLink: 0, midnight: 0, abnormal: 0,
    };
    a.entries += 1;
    if (!e.shift_id) a.noShiftLink += 1;
    if (!e.clock_out) {
      a.open += 1;
    } else {
      const inD = new Date(e.clock_in);
      const outD = new Date(e.clock_out);
      const sameDay =
        inD.getFullYear() === outD.getFullYear() &&
        inD.getMonth() === outD.getMonth() &&
        inD.getDate() === outD.getDate();
      if (!sameDay) a.midnight += 1;
      const rawMin =
        Math.round((outD.getTime() - inD.getTime()) / 60000) -
        (e.break_minutes ?? 0);
      const h = rawMin / 60;
      if (h <= 0 || h > ABNORMAL_MAX_HOURS) a.abnormal += 1;
      a.hours += Math.max(0, h);
    }
    nativeAgg.set(e.employee_id, a);
  }

  const overlaps = detectTimeEntryOverlaps(entries);

  const ids = new Set<string>([...pbpMap.keys(), ...nativeAgg.keys()]);
  let connecteam = 0;
  let native = 0;
  let comparable = 0;
  let notCmp = 0;
  let critical = 0;
  let openTotal = 0;
  let noShiftTotal = 0;
  let abnormalTotal = 0;
  let midnightTotal = 0;
  let overlapTotal = 0;
  const criticalList: PeriodCriticalWorker[] = [];

  ids.forEach((id) => {
    const p = pbpMap.get(id);
    const n = nativeAgg.get(id);
    const conn = p?.total_work_hours ?? null;
    const nat = n ? Number(n.hours.toFixed(2)) : null;
    openTotal += n?.open ?? 0;
    noShiftTotal += n?.noShiftLink ?? 0;
    abnormalTotal += n?.abnormal ?? 0;
    midnightTotal += n?.midnight ?? 0;
    overlapTotal += overlaps.get(id)?.total ?? 0;

    if (conn == null || nat == null) {
      notCmp += 1;
      return;
    }
    comparable += 1;
    connecteam += conn;
    native += nat;
    const delta = Number((nat - conn).toFixed(2));
    const abs = Math.abs(delta);
    if (abs >= CRITICAL_DELTA_HOURS) {
      critical += 1;
      const reasons: string[] = ["delta_critical"];
      if ((n?.open ?? 0) > 0) reasons.push("open_entries");
      if ((n?.noShiftLink ?? 0) > 0) reasons.push("no_shift_link");
      if ((n?.abnormal ?? 0) > 0) reasons.push("abnormal_duration");
      if ((n?.midnight ?? 0) > 0) reasons.push("midnight_cross");
      if ((overlaps.get(id)?.total ?? 0) > 0) reasons.push("overlap_entries");
      criticalList.push({
        employee_id: id,
        deltaHours: delta,
        reasons,
      });
    } else if (abs >= MINOR_DELTA_HOURS) {
      // minor — no-op counter
    }
  });

  const deltaHours = Number((native - connecteam).toFixed(2));
  const deltaPercent =
    connecteam > 0 ? Number(((deltaHours / connecteam) * 100).toFixed(2)) : null;
  const workers = ids.size;
  const comparablePct =
    workers > 0 ? Math.round((comparable / workers) * 100) : null;

  return {
    period,
    workers,
    comparable,
    comparablePct,
    connecteamHours: Number(connecteam.toFixed(2)),
    nativeHours: Number(native.toFixed(2)),
    deltaHours,
    deltaPercent,
    criticalWorkers: critical,
    notComparableWorkers: notCmp,
    openEntries: openTotal,
    noShiftEntries: noShiftTotal,
    abnormalEntries: abnormalTotal,
    midnightEntries: midnightTotal,
    overlapEntries: overlapTotal,
    status: classifyPeriodStatus({
      comparablePct,
      deltaPercent,
      overlapEntries: overlapTotal,
      openEntries: openTotal,
    }),
    criticalList,
  };
}

function classifyPeriodStatus(m: {
  comparablePct: number | null;
  deltaPercent: number | null;
  overlapEntries: number;
  openEntries: number;
}): PeriodStatus {
  const cmp = m.comparablePct ?? 0;
  const dp = Math.abs(m.deltaPercent ?? 100);
  // Stable: comparable >= 95%, |delta| <= 2%, no overlaps, few open entries.
  if (cmp >= 95 && dp <= 2 && m.overlapEntries === 0 && m.openEntries <= 2) {
    return "stable";
  }
  // Review band.
  if (cmp >= 85 && dp <= 5) return "review";
  return "high_risk";
}

export interface RepeatOffender {
  employee_id: string;
  periodsCritical: number;
  periodIds: string[];
  totalDelta: number;
  reasonCounts: Record<string, number>;
  lastStatus: PeriodStatus;
}

/**
 * Given per-period metrics (in chronological order), find workers who appear
 * as `delta_critical` in 2+ periods.
 */
export function findRepeatOffenders(
  periods: PeriodMetrics[],
): RepeatOffender[] {
  const map = new Map<string, RepeatOffender>();
  for (const pm of periods) {
    for (const w of pm.criticalList) {
      const existing = map.get(w.employee_id) ?? {
        employee_id: w.employee_id,
        periodsCritical: 0,
        periodIds: [] as string[],
        totalDelta: 0,
        reasonCounts: {} as Record<string, number>,
        lastStatus: pm.status,
      };
      existing.periodsCritical += 1;
      existing.periodIds.push(pm.period.id);
      existing.totalDelta = Number((existing.totalDelta + w.deltaHours).toFixed(2));
      for (const r of w.reasons) {
        existing.reasonCounts[r] = (existing.reasonCounts[r] ?? 0) + 1;
      }
      existing.lastStatus = pm.status;
      map.set(w.employee_id, existing);
    }
  }
  return Array.from(map.values())
    .filter((r) => r.periodsCritical >= 2)
    .sort((a, b) => {
      if (b.periodsCritical !== a.periodsCritical)
        return b.periodsCritical - a.periodsCritical;
      return Math.abs(b.totalDelta) - Math.abs(a.totalDelta);
    });
}

// ------------------------- CSV -------------------------

const CSV_HEADER = [
  "DRY_RUN_READ_ONLY_NOT_PAYROLL",
  "batch_compare",
  "source_reference",
  "native_source",
  "official_payroll_source",
  "generated_at",
  "company_id",
  "company_name",
  "period_id",
  "period_start",
  "period_end",
  "period_status",
  "workers",
  "comparable_workers",
  "comparable_percent",
  "connecteam_hours",
  "native_hours",
  "delta_hours",
  "delta_percent",
  "critical_delta_workers",
  "non_comparable_workers",
  "open_entries",
  "no_shift_entries",
  "abnormal_duration_entries",
  "midnight_cross_entries",
  "overlap_entries",
];

function escape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface BatchCsvMeta {
  company_id: string;
  company_name: string;
  generated_at: string;
}

export function buildBatchTrendCsv(
  meta: BatchCsvMeta,
  periods: PeriodMetrics[],
): string {
  const lines: string[] = [];
  lines.push(CSV_HEADER.join(","));
  for (const pm of periods) {
    lines.push(
      [
        "true",
        "true",
        "period_base_pay.total_work_hours",
        "time_entries_closed_only",
        "Connecteam / reconciliación externa",
        meta.generated_at,
        meta.company_id,
        meta.company_name,
        pm.period.id,
        pm.period.start_date,
        pm.period.end_date,
        pm.status,
        pm.workers,
        pm.comparable,
        pm.comparablePct != null ? pm.comparablePct : "",
        pm.connecteamHours,
        pm.nativeHours,
        pm.deltaHours,
        pm.deltaPercent != null ? pm.deltaPercent : "",
        pm.criticalWorkers,
        pm.notComparableWorkers,
        pm.openEntries,
        pm.noShiftEntries,
        pm.abnormalEntries,
        pm.midnightEntries,
        pm.overlapEntries,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadBatchTrendCsv(
  meta: BatchCsvMeta,
  periods: PeriodMetrics[],
): void {
  const csv = buildBatchTrendCsv(meta, periods);
  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dry-run_BATCH_NOT_PAYROLL_${meta.generated_at.slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
