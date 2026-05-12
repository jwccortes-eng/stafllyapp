/**
 * Phase 2 — Weekly Stafly Schedule Export (XLSX).
 * Pulls scheduled_shifts + assignments + employees + clients + locations
 * for a date range and writes a flat per-assignment XLSX.
 *
 * Read-only. No writes. Scheduled hours are NOT presented as worked hours.
 */
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

export interface WeeklyExportOpts {
  companyId: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  fileName?: string;
}

export async function downloadWeeklySchedule(opts: WeeklyExportOpts): Promise<void> {
  const { companyId, from, to } = opts;

  const [{ data: shifts }, { data: clients }, { data: locations }] = await Promise.all([
    supabase
      .from("scheduled_shifts")
      .select("id, shift_code, date, start_time, end_time, slots, client_id, location_id, meeting_point, meeting_time, publication_status, notes")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true }),
    supabase.from("clients").select("id, name").eq("company_id", companyId).is("deleted_at", null),
    supabase.from("locations").select("id, name").eq("company_id", companyId).is("deleted_at", null),
  ]);

  const shiftIds = (shifts ?? []).map(s => s.id);
  let assignments: any[] = [];
  if (shiftIds.length) {
    const { data: a } = await supabase
      .from("shift_assignments")
      .select("shift_id, employee_id, status, accepted_at, employee:employees(first_name,last_name,phone_number,employer_identification,is_active)")
      .in("shift_id", shiftIds);
    assignments = a ?? [];
  }
  const clientById = new Map((clients ?? []).map(c => [c.id, c.name]));
  const locById = new Map((locations ?? []).map(l => [l.id, l.name]));
  const byShift = new Map<string, any[]>();
  for (const a of assignments) {
    const arr = byShift.get(a.shift_id) ?? [];
    arr.push(a);
    byShift.set(a.shift_id, arr);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Stafly Weekly Export";
  wb.created = new Date();

  // ---------- Cover ----------
  const cover = wb.addWorksheet("Cover");
  cover.addRow(["Stafly · Weekly Schedule Export"]);
  cover.addRow(["Range", `${from} → ${to}`]);
  cover.addRow(["Total shifts", (shifts ?? []).length]);
  cover.addRow(["Total assignments", assignments.length]);
  cover.addRow([]);
  cover.addRow(["Note: Scheduled hours below are PLAN hours, not worked/payroll hours."]);
  cover.getRow(1).font = { bold: true, size: 14 };
  cover.getColumn(1).width = 28;
  cover.getColumn(2).width = 60;

  // ---------- Shifts ----------
  const sh = wb.addWorksheet("Shifts");
  sh.addRow([
    "Date", "Client", "Shift #", "Start", "End",
    "Required slots", "Assigned count", "Missing count",
    "Job site", "Meeting point", "Meeting time",
    "Publication", "Notes",
  ]);
  for (const s of shifts ?? []) {
    const a = byShift.get(s.id) ?? [];
    const slots = s.slots ?? 0;
    sh.addRow([
      s.date,
      clientById.get(s.client_id ?? "") ?? "",
      s.shift_code ?? "",
      s.start_time?.slice(0, 5) ?? "",
      s.end_time?.slice(0, 5) ?? "",
      slots,
      a.length,
      Math.max(0, slots - a.length),
      locById.get(s.location_id ?? "") ?? "",
      s.meeting_point ?? "",
      s.meeting_time ?? "",
      s.publication_status ?? "",
      s.notes ?? "",
    ]);
  }
  styleHeader(sh);
  autoWidth(sh);

  // ---------- Assignments ----------
  const wk = wb.addWorksheet("Assignments");
  wk.addRow([
    "Date", "Client", "Shift #", "Start", "End",
    "Worker name", "Worker phone", "Employer #",
    "Assignment status", "Accepted at", "Real Stafly response",
    "Active", "Job site", "Meeting point", "Meeting time",
  ]);
  for (const s of shifts ?? []) {
    const a = byShift.get(s.id) ?? [];
    for (const r of a) {
      const e = r.employee ?? {};
      wk.addRow([
        s.date,
        clientById.get(s.client_id ?? "") ?? "",
        s.shift_code ?? "",
        s.start_time?.slice(0, 5) ?? "",
        s.end_time?.slice(0, 5) ?? "",
        `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
        e.phone_number ?? "",
        e.employer_identification ?? "",
        r.status ?? "",
        r.accepted_at ?? "",
        r.accepted_at ? "yes" : "no",
        e.is_active === false ? "no" : "yes",
        locById.get(s.location_id ?? "") ?? "",
        s.meeting_point ?? "",
        s.meeting_time ?? "",
      ]);
    }
  }
  styleHeader(wk);
  autoWidth(wk);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.fileName ?? `stafly-weekly-${from}_${to}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
