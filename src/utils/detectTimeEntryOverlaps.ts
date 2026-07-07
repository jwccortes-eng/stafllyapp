/**
 * detectTimeEntryOverlaps — READ-ONLY diagnostic helper.
 *
 * Given closed native `time_entries` grouped by employee, returns per-employee
 * overlap counts (entries whose [clock_in, clock_out) intersects the previous
 * entry when sorted by `clock_in`). Also returns per-day overlap counts and
 * the earliest date where any overlap is found.
 *
 * HARD RULES:
 *  - No writes. No corrections. Diagnostic only.
 *  - Open entries (no clock_out) are IGNORED — they are already surfaced
 *    separately as "open_entries".
 *  - Entries with clock_out <= clock_in are IGNORED here — surfaced
 *    separately as "abnormal_duration".
 */

export interface TimeEntryLike {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
}

export interface OverlapStats {
  total: number;
  days: Map<string, number>;
  firstIssueDate: string | null;
}

function localDay(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function detectTimeEntryOverlaps(
  entries: TimeEntryLike[],
): Map<string, OverlapStats> {
  const byEmp = new Map<string, TimeEntryLike[]>();
  for (const e of entries) {
    if (!e.clock_out) continue;
    const start = new Date(e.clock_in).getTime();
    const end = new Date(e.clock_out).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const arr = byEmp.get(e.employee_id) ?? [];
    arr.push(e);
    byEmp.set(e.employee_id, arr);
  }

  const out = new Map<string, OverlapStats>();
  byEmp.forEach((arr, empId) => {
    arr.sort(
      (a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime(),
    );
    const stats: OverlapStats = {
      total: 0,
      days: new Map<string, number>(),
      firstIssueDate: null,
    };
    let lastEnd = -Infinity;
    let lastDate: string | null = null;
    for (const e of arr) {
      const start = new Date(e.clock_in).getTime();
      const end = new Date(e.clock_out as string).getTime();
      if (start < lastEnd) {
        stats.total += 1;
        const day = localDay(e.clock_in);
        stats.days.set(day, (stats.days.get(day) ?? 0) + 1);
        if (
          stats.firstIssueDate === null ||
          day < stats.firstIssueDate
        ) {
          stats.firstIssueDate = day;
        }
      }
      if (end > lastEnd) lastEnd = end;
      lastDate = localDay(e.clock_in);
    }
    void lastDate;
    if (stats.total > 0) out.set(empId, stats);
  });
  return out;
}
