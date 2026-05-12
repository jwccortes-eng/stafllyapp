/**
 * Phase 2/3 — PDF summary of the Import Review (read-only).
 * Uses jsPDF + autoTable. No DB writes.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReviewModel } from "./types";
import { WARNING_HUMAN_LABEL, DIFF_STATUS_HUMAN_LABEL } from "./labels";
import type { ImportWarningCode } from "@/lib/import/import-warnings";

const STATUS_LABEL: Record<string, string> = DIFF_STATUS_HUMAN_LABEL;
const humanWarn = (code: string) => WARNING_HUMAN_LABEL[code as ImportWarningCode] ?? code;

export function downloadDiffPdf(model: ReviewModel, fileName: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  doc.setFontSize(16);
  doc.text("Stafly · Import Review Summary", 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    [
      `File: ${model.fileName ?? "—"}`,
      `Batch: ${model.batchId}`,
      `Range: ${model.dateRangeFrom ?? "—"} → ${model.dateRangeTo ?? "—"}`,
      `Status: ${model.status}  ·  Audit only — no real changes`,
    ].join("   "),
    40, 58,
  );

  // Totals
  autoTable(doc, {
    startY: 80,
    head: [["Parsed", "Matched exact", "Fallback", "Would create", "Possible duplicate", "Needs review"]],
    body: [[
      model.totalParsedShifts,
      model.totals.matchedExact,
      model.totals.matchedFallback,
      model.totals.wouldCreate,
      model.totals.possibleDuplicate,
      model.totals.needsReview,
    ]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [226, 232, 240], textColor: 20 },
  });

  // Warnings counts
  const warnRows = Object.entries(model.warningCounts).sort((a, b) => b[1] - a[1]);
  if (warnRows.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [["Warning", "Count", "Technical code"]],
      body: warnRows.map(([code, n]) => [humanWarn(code), n, code]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [226, 232, 240], textColor: 20 },
      columnStyles: { 1: { halign: "right", cellWidth: 50 }, 2: { font: "courier", cellWidth: 110 } },
    });
  }

  // Shifts table
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 14,
    head: [["Date", "Time", "Job", "Src #", "Stafly #", "Status", "Workers", "Warns"]],
    body: model.shifts.map(s => {
      const expected = s.workers.filter(w => w.status !== "extra_in_stafly");
      return [
        s.date,
        `${s.startTime}–${s.endTime}`,
        (s.job ?? "—").slice(0, 30),
        s.sourceShiftCode ?? "—",
        s.staflyShiftCode ?? "—",
        STATUS_LABEL[s.status] ?? s.status,
        expected.length,
        s.warnings.length,
      ];
    }),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [226, 232, 240], textColor: 20 },
  });

  doc.save(fileName);
}
