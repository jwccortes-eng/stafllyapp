import type { ReviewModel } from "./types";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reviewToCsv(model: ReviewModel): string {
  const codes = Object.keys(model.warningCounts).sort();
  const header = [
    "date", "start", "end", "job", "source_title", "source_code",
    "stafly_shift_id", "stafly_shift_code", "diff_status",
    "expected_workers", "stafly_workers",
    ...codes.map(c => `warn_${c}`),
  ];
  const rows = model.shifts.map(s => {
    const counts: Record<string, number> = {};
    for (const w of s.warnings) counts[w.code] = (counts[w.code] ?? 0) + 1;
    return [
      s.date, s.startTime, s.endTime, s.job ?? "", s.sourceShiftTitle ?? "", s.sourceShiftCode ?? "",
      s.staflyShiftId ?? "", s.staflyShiftCode ?? "", s.status,
      s.workers.filter(w => w.status !== "extra_in_stafly").map(w => w.displayName).join("; "),
      s.staflyAssignedWorkers.map(w => w.name).join("; "),
      ...codes.map(c => counts[c] ?? 0),
    ];
  });
  return [header, ...rows].map(r => r.map(esc).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
