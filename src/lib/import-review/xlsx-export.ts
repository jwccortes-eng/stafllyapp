/**
 * Phase 3 — Difference Report XLSX (Connecteam dry-run vs Stafly).
 * Pure builder: takes the in-memory ReviewModel and produces an XLSX file.
 * No DB writes. No mutation of the model.
 */
import ExcelJS from "exceljs";
import type { ReviewModel } from "./types";
import { WARNING_HUMAN_LABEL, DIFF_STATUS_HUMAN_LABEL, WORKER_STATUS_HUMAN_LABEL } from "./labels";
import type { ImportWarningCode } from "@/lib/import/import-warnings";

const humanWarn = (code: string) => WARNING_HUMAN_LABEL[code as ImportWarningCode] ?? code;

const STATUS_LABEL: Record<string, string> = DIFF_STATUS_HUMAN_LABEL;

function autoWidth(ws: ExcelJS.Worksheet) {
  ws.columns.forEach(col => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, c => {
      const v = String(c.value ?? "");
      if (v.length > max) max = v.length;
    });
    col.width = Math.min(max + 2, 50);
  });
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.eachCell(c => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });
}

export async function downloadDiffXlsx(model: ReviewModel, fileName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Stafly Import Review";
  wb.created = new Date();

  // ---------- Summary sheet ----------
  const sum = wb.addWorksheet("Summary");
  sum.addRow(["Import Review · Difference Report"]);
  sum.addRow([]);
  sum.addRow(["Batch ID", model.batchId]);
  sum.addRow(["File", model.fileName ?? ""]);
  sum.addRow(["Status", model.status]);
  sum.addRow(["Date range", `${model.dateRangeFrom ?? ""} → ${model.dateRangeTo ?? ""}`]);
  sum.addRow([]);
  sum.addRow(["Totals"]);
  sum.addRow(["Parsed shifts", model.totalParsedShifts]);
  sum.addRow(["Matched exactly", model.totals.matchedExact]);
  sum.addRow(["Matched by fallback", model.totals.matchedFallback]);
  sum.addRow(["Would create new", model.totals.wouldCreate]);
  sum.addRow(["Possible duplicate", model.totals.possibleDuplicate]);
  sum.addRow(["Needs review", model.totals.needsReview]);
  sum.addRow([]);
  sum.addRow(["Warning code", "Count"]);
  Object.entries(model.warningCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, n]) => sum.addRow([code, n]));
  sum.getRow(1).font = { bold: true, size: 14 };
  sum.getRow(8).font = { bold: true };
  sum.getRow(16).font = { bold: true };
  sum.getColumn(1).width = 32;
  sum.getColumn(2).width = 50;

  // ---------- Shifts sheet ----------
  const shifts = wb.addWorksheet("Shifts");
  shifts.addRow([
    "Date", "Start", "End", "Job/Client", "Source title", "Source #",
    "Status", "Stafly shift #", "Stafly shift id", "Stafly slots",
    "Expected workers", "Stafly assigned",
    "Missing in Stafly", "Extra in Stafly",
    "Source address", "Stafly location",
    "Source note", "Stafly meeting point", "Stafly meeting time",
    "Warning codes",
  ]);
  for (const s of model.shifts) {
    const expected = s.workers.filter(w => w.status !== "extra_in_stafly");
    const expectedNames = new Set(expected.map(w => w.matchedEmployeeId).filter(Boolean));
    const staflyNames = new Set(s.staflyAssignedWorkers.map(w => w.employeeId));
    const missing = expected.filter(w => !w.matchedEmployeeId || !staflyNames.has(w.matchedEmployeeId!));
    const extra = s.staflyAssignedWorkers.filter(w => !expectedNames.has(w.employeeId));
    shifts.addRow([
      s.date, s.startTime, s.endTime, s.job ?? "",
      s.sourceShiftTitle ?? "", s.sourceShiftCode ?? "",
      STATUS_LABEL[s.status] ?? s.status,
      s.staflyShiftCode ?? "", s.staflyShiftId ?? "", s.staflySlots ?? "",
      expected.map(w => w.displayName).join("; "),
      s.staflyAssignedWorkers.map(w => w.name).join("; "),
      missing.map(w => w.displayName).join("; "),
      extra.map(w => w.name).join("; "),
      s.sourceAddress ?? "", s.location.currentLocationName ?? "",
      s.sourceNote ?? "", s.note.currentMeetingPoint ?? "", s.note.currentMeetingTime ?? "",
      s.warnings.map(w => w.code).join(", "),
    ]);
  }
  styleHeader(shifts);
  autoWidth(shifts);

  // ---------- Workers sheet ----------
  const workers = wb.addWorksheet("Workers");
  workers.addRow([
    "Date", "Start", "End", "Job/Client", "Stafly shift #",
    "Source worker name", "Matched Stafly employee", "Employer #",
    "Match method", "Match confidence",
    "Status", "Imported accept only", "Warning codes",
  ]);
  for (const s of model.shifts) {
    for (const w of s.workers) {
      workers.addRow([
        s.date, s.startTime, s.endTime, s.job ?? "", s.staflyShiftCode ?? "",
        w.rawName, w.displayName, w.employerId ?? "",
        w.matchMethod ?? "", w.matchConfidence ?? "",
        w.status, w.status === "imported_accept_only" ? "yes" : "",
        w.warnings.map(x => x.code).join(", "),
      ]);
    }
  }
  styleHeader(workers);
  autoWidth(workers);

  // ---------- Warnings sheet ----------
  const warns = wb.addWorksheet("Warnings");
  warns.addRow(["Code", "Severity", "Date", "Start", "End", "Job", "Worker", "Recommended action"]);
  for (const s of model.shifts) {
    for (const w of s.warnings) {
      warns.addRow([
        w.code, w.severity, w.date ?? s.date, w.start_time ?? s.startTime,
        w.end_time ?? s.endTime, w.job ?? s.job ?? "",
        w.raw_employee_name ?? "", w.recommended_action ?? "",
      ]);
    }
  }
  styleHeader(warns);
  autoWidth(warns);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
