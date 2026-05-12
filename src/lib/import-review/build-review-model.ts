/**
 * Build the read-only Import Review model from existing dry-run audit rows.
 *
 * Pure function — no DB, no side effects. The page component fetches the
 * inputs once and feeds them here.
 *
 * Inputs come from:
 *   - import_batches (single row, status='dry_run')
 *   - normalized_schedule_rows (1 row per Excel assignment)
 *   - raw_schedule_import_rows (verbatim Excel rows, used for PAY RIDE detection)
 *   - scheduled_shifts (current Stafly state in date range)
 *   - shift_assignments (joined to employees) for currently-staffed workers
 *   - employees (id → display info)
 *   - locations (id → display info)
 */
import type { ImportWarning } from "@/lib/import/import-warnings";
import type {
  DiffStatus,
  ReviewModel,
  ReviewShift,
  ReviewWorker,
} from "./types";

interface BatchRow {
  id: string;
  schedule_file_name: string | null;
  status: string;
  date_range_from: string | null;
  date_range_to: string | null;
  warnings: ImportWarning[] | null;
}

interface NormalizedRow {
  id: string;
  raw_row_id: string | null;
  matched_employee_id: string | null;
  employee_name_raw: string | null;
  employee_match_method: string | null;
  employee_match_confidence: number | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  client_name: string | null;
  location_name: string | null;
  shift_title: string | null;
  external_shift_id: string | null;
  notes: string | null;
}

interface RawRow {
  id: string;
  raw_data: Record<string, unknown> | null;
}

interface ScheduledShift {
  id: string;
  shift_code: string | null;
  date: string;
  start_time: string;
  end_time: string;
  slots: number | null;
  client_id: string | null;
  location_id: string | null;
  meeting_point: string | null;
  meeting_time: string | null;
}

interface AssignmentRow {
  shift_id: string;
  employee_id: string;
  employee?: {
    first_name: string | null;
    last_name: string | null;
    employer_identification: string | null;
    is_active: boolean | null;
  } | null;
}

interface EmployeeLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  employer_identification: string | null;
  is_active: boolean | null;
  phone_number?: string | null;
  email?: string | null;
  user_id?: string | null;
}

interface ClientLite {
  id: string;
  name: string;
}

interface LocationLite {
  id: string;
  name: string;
}

export interface BuildReviewInput {
  batch: BatchRow;
  normalized: NormalizedRow[];
  raw: RawRow[];
  scheduledShifts: ScheduledShift[];
  assignments: AssignmentRow[];
  employees: EmployeeLite[];
  clients: ClientLite[];
  locations: LocationLite[];
}

const PLACEHOLDER_PATTERNS = [
  /^system\s*\d+/i,
  /^placeholder/i,
  /^staff\s*\d+/i,
  /^empty\s+slot/i,
];

const PAY_RIDE_PATTERN = /pay\s*ride|payride/i;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const slice5 = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

function isPlaceholderName(name: string | null | undefined): boolean {
  const s = (name ?? "").trim();
  if (!s) return true;
  return PLACEHOLDER_PATTERNS.some(p => p.test(s));
}

function shiftSignature(
  date: string,
  start: string,
  end: string,
  job: string | null,
): string {
  return `${date}|${slice5(start)}|${slice5(end)}|${norm(job)}`;
}

function pickWarningsForShift(
  warnings: ImportWarning[],
  date: string,
  start: string,
  end: string,
  job: string | null,
): ImportWarning[] {
  const s5 = slice5(start);
  const e5 = slice5(end);
  const j = norm(job);
  return warnings.filter(w => {
    if (!w) return false;
    if (w.date && w.date !== date) return false;
    if (w.start_time && slice5(w.start_time) !== s5) return false;
    if (w.end_time && slice5(w.end_time) !== e5) return false;
    if (w.job && norm(w.job) !== j) return false;
    return true;
  });
}

export function buildReviewModel(input: BuildReviewInput): ReviewModel {
  const warnings = (input.batch.warnings ?? []).filter(Boolean);

  // Group normalized rows into shifts using (date|start|end|job)
  const groups = new Map<
    string,
    {
      date: string;
      start: string;
      end: string;
      job: string | null;
      title: string | null;
      externalId: string | null;
      address: string | null;
      note: string | null;
      rows: NormalizedRow[];
      raws: RawRow[];
    }
  >();

  // Index raw rows by id for note/address pulls
  const rawById = new Map(input.raw.map(r => [r.id, r]));

  for (const row of input.normalized) {
    if (!row.work_date || !row.start_time || !row.end_time) continue;
    const sig = shiftSignature(row.work_date, row.start_time, row.end_time, row.client_name);
    let g = groups.get(sig);
    if (!g) {
      g = {
        date: row.work_date,
        start: slice5(row.start_time),
        end: slice5(row.end_time),
        job: row.client_name,
        title: row.shift_title,
        externalId: row.external_shift_id,
        address: row.location_name,
        note: row.notes,
        rows: [],
        raws: [],
      };
      groups.set(sig, g);
    }
    g.rows.push(row);
    if (row.raw_row_id) {
      const rr = rawById.get(row.raw_row_id);
      if (rr) g.raws.push(rr);
    }
    // Prefer first non-null
    if (!g.address && row.location_name) g.address = row.location_name;
    if (!g.note && row.notes) g.note = row.notes;
    if (!g.externalId && row.external_shift_id) g.externalId = row.external_shift_id;
  }

  // Index existing scheduled shifts (strict + fallback)
  const strictMap = new Map<string, ScheduledShift>();
  const fallbackMap = new Map<string, ScheduledShift[]>();
  const employeeById = new Map(input.employees.map(e => [e.id, e]));
  const clientById = new Map(input.clients.map(c => [c.id, c]));
  const clientByName = new Map(input.clients.map(c => [norm(c.name), c]));
  const locationById = new Map(input.locations.map(l => [l.id, l]));

  for (const s of input.scheduledShifts) {
    const code = (s.shift_code ?? "").trim();
    const sk = `${code}|${s.date}|${slice5(s.start_time)}|${slice5(s.end_time)}`;
    strictMap.set(sk, s);
    const fk = `${s.date}|${slice5(s.start_time)}|${slice5(s.end_time)}|${s.client_id ?? ""}`;
    const arr = fallbackMap.get(fk) ?? [];
    arr.push(s);
    fallbackMap.set(fk, arr);
  }

  // Index assignments by shift_id
  const assignmentsByShift = new Map<string, AssignmentRow[]>();
  for (const a of input.assignments) {
    const arr = assignmentsByShift.get(a.shift_id) ?? [];
    arr.push(a);
    assignmentsByShift.set(a.shift_id, arr);
  }

  const shifts: ReviewShift[] = [];
  const totals = {
    matchedExact: 0,
    matchedFallback: 0,
    wouldCreate: 0,
    possibleDuplicate: 0,
    needsReview: 0,
  };

  for (const g of groups.values()) {
    const numericCode = (g.title ?? g.externalId ?? "").match(/^(\d+)/)?.[1] ?? "";
    const strictKey = `${numericCode}|${g.date}|${g.start}|${g.end}`;
    const sourceClient = g.job ? clientByName.get(norm(g.job.replace(/^\d+\s*[-–]\s*/, "").trim())) ?? null : null;
    const fallbackKey = `${g.date}|${g.start}|${g.end}|${sourceClient?.id ?? ""}`;

    const shiftWarnings = pickWarningsForShift(warnings, g.date, g.start, g.end, g.job);

    const fallbackWarning = shiftWarnings.find(w => w.code === "SHIFT_RECONCILED_BY_FALLBACK_KEY");
    const multiMatchWarning = shiftWarnings.find(w => w.code === "MULTIPLE_EXISTING_SHIFT_MATCHES_NEED_REVIEW");

    let stafly: ScheduledShift | null = null;
    let status: DiffStatus = "would_create";

    const strictHit = strictMap.get(strictKey);
    if (strictHit) {
      stafly = strictHit;
      status = "matched_exact";
      totals.matchedExact++;
    } else if (fallbackWarning) {
      const matchedId = (fallbackWarning.details as { matched_scheduled_shift_id?: string } | undefined)?.matched_scheduled_shift_id;
      stafly = (matchedId && input.scheduledShifts.find(s => s.id === matchedId)) || null;
      status = "matched_fallback";
      totals.matchedFallback++;
    } else if (multiMatchWarning) {
      status = "possible_duplicate";
      totals.possibleDuplicate++;
    } else {
      // Try fallback as a fresh review even if importer didn't emit (e.g. sourceClient null)
      const fbCandidates = fallbackMap.get(fallbackKey) ?? [];
      if (fbCandidates.length === 1) {
        stafly = fbCandidates[0];
        status = "matched_fallback";
        totals.matchedFallback++;
      } else if (fbCandidates.length > 1) {
        status = "possible_duplicate";
        totals.possibleDuplicate++;
      } else {
        status = "would_create";
        totals.wouldCreate++;
      }
    }

    if (status === "would_create" && shiftWarnings.some(w => w.severity === "warn" || w.severity === "error")) {
      status = "needs_review";
      totals.wouldCreate--;
      totals.needsReview++;
    }

    // Build worker list (Connecteam side)
    const workers: ReviewWorker[] = [];
    const sourceEmpIds = new Set<string>();
    for (const r of g.rows) {
      const rawName = (r.employee_name_raw ?? "").trim();
      if (!rawName && !r.matched_employee_id) continue;
      const emp = r.matched_employee_id ? employeeById.get(r.matched_employee_id) ?? null : null;
      const isPlaceholder = isPlaceholderName(rawName);
      const empWarnings = warnings.filter(w =>
        norm(w.raw_employee_name ?? "") === norm(rawName) &&
        (!w.date || w.date === g.date),
      );
      let workerStatus: ReviewWorker["status"];
      if (isPlaceholder) workerStatus = "placeholder";
      else if (!emp && !r.matched_employee_id) workerStatus = "unmatched";
      else if (emp && emp.is_active === false) workerStatus = "inactive_matched";
      else if (emp) {
        workerStatus = "matched";
        sourceEmpIds.add(emp.id);
      } else workerStatus = "unmatched";

      const hasImportedAccept = empWarnings.some(w => w.code === "IMPORTED_ACCEPT_NOT_STAFLY_RESPONSE");
      if (workerStatus === "matched" && hasImportedAccept) workerStatus = "imported_accept_only";

      workers.push({
        rawName,
        matchedEmployeeId: r.matched_employee_id,
        matchMethod: r.employee_match_method,
        matchConfidence: r.employee_match_confidence,
        status: workerStatus,
        displayName: emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || rawName : rawName,
        employerId: emp?.employer_identification ?? null,
        isActive: emp?.is_active ?? undefined,
        warnings: empWarnings,
      });
    }

    // Currently staffed workers in Stafly
    const staflyAssigned = stafly
      ? (assignmentsByShift.get(stafly.id) ?? []).map(a => ({
        employeeId: a.employee_id,
        name: a.employee
          ? `${a.employee.first_name ?? ""} ${a.employee.last_name ?? ""}`.trim()
          : (employeeById.get(a.employee_id)
              ? `${employeeById.get(a.employee_id)!.first_name ?? ""} ${employeeById.get(a.employee_id)!.last_name ?? ""}`.trim()
              : a.employee_id),
        employerId: a.employee?.employer_identification
          ?? employeeById.get(a.employee_id)?.employer_identification
          ?? null,
      }))
      : [];

    // Mark Stafly-only workers as "extra_in_stafly"
    if (stafly) {
      for (const sa of staflyAssigned) {
        if (!sourceEmpIds.has(sa.employeeId)) {
          workers.push({
            rawName: sa.name,
            matchedEmployeeId: sa.employeeId,
            matchMethod: null,
            matchConfidence: null,
            status: "extra_in_stafly",
            displayName: sa.name,
            employerId: sa.employerId,
            isActive: true,
            warnings: [],
          });
        }
      }
    }

    // PAY RIDE detection from raw rows
    const hasPayRide = g.raws.some(r => {
      const data = r.raw_data ?? {};
      return Object.values(data).some(v => typeof v === "string" && PAY_RIDE_PATTERN.test(v));
    });

    // Location proposal
    const currentLoc = stafly?.location_id ? locationById.get(stafly.location_id) ?? null : null;
    const addressMappedWarning = shiftWarnings.find(w => w.code === "ADDRESS_MAPPED_TO_LOCATION");
    const locationProposal = {
      sourceAddress: g.address,
      currentLocationId: stafly?.location_id ?? null,
      currentLocationName: currentLoc?.name ?? null,
      willCreate: !!addressMappedWarning && !stafly?.location_id,
      preserved: !!stafly?.location_id,
    };

    // Note proposal
    const noteParsed = shiftWarnings.find(w => w.code === "NOTE_MEETING_POINT_PARSED");
    const noteReview = shiftWarnings.find(w => w.code === "NOTE_PARSE_NEEDS_REVIEW");
    const noteDetails = noteParsed?.details as Record<string, unknown> | undefined;
    const noteProposal = {
      sourceNote: g.note,
      parsed: noteParsed
        ? {
          meetingPoint: (noteDetails?.meeting_point_text as string | undefined) ?? null,
          meetingTime: (noteDetails?.meeting_time as string | undefined) ?? null,
          driverHint: (noteDetails?.driver_hint as string | undefined) ?? null,
          confidence: (noteDetails?.confidence as string | undefined) ?? null,
        }
        : null,
      needsReview: !!noteReview,
      currentMeetingPoint: stafly?.meeting_point ?? null,
      currentMeetingTime: stafly?.meeting_time ?? null,
      preserved: !!(stafly?.meeting_point || stafly?.meeting_time),
    };

    // Append derived warnings
    const derived: ImportWarning[] = [];
    if (workers.some(w => w.status === "placeholder")) {
      derived.push({
        code: "PLACEHOLDER_SYSTEM_EXCLUDED" as ImportWarning["code"],
        severity: "info",
        date: g.date,
        start_time: g.start,
        end_time: g.end,
        job: g.job ?? null,
        recommended_action: "Placeholder/System rows are excluded from real workers.",
        details: { count: workers.filter(w => w.status === "placeholder").length },
      });
    }
    if (hasPayRide) {
      derived.push({
        code: "PAY_RIDE_DETECTED" as ImportWarning["code"],
        severity: "info",
        date: g.date,
        start_time: g.start,
        end_time: g.end,
        job: g.job ?? null,
        recommended_action: "PAY RIDE row detected — handle via rides flow, not as a worker assignment.",
      });
    }

    shifts.push({
      signature: shiftSignature(g.date, g.start, g.end, g.job),
      sourceShiftTitle: g.title,
      sourceShiftCode: numericCode || null,
      date: g.date,
      startTime: g.start,
      endTime: g.end,
      job: g.job,
      sourceAddress: g.address,
      sourceNote: g.note,
      staflyShiftId: stafly?.id ?? null,
      staflyShiftCode: stafly?.shift_code ?? null,
      staflySlots: stafly?.slots ?? null,
      staflyClientName: stafly?.client_id ? clientById.get(stafly.client_id)?.name ?? null : null,
      staflyAssignedWorkers: staflyAssigned,
      status,
      workers,
      location: locationProposal,
      note: noteProposal,
      warnings: [...shiftWarnings, ...derived],
    });
  }

  shifts.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  // Warning counts (batch-wide)
  const warningCounts: Record<string, number> = {};
  for (const w of warnings) {
    warningCounts[w.code] = (warningCounts[w.code] ?? 0) + 1;
  }
  for (const s of shifts) {
    for (const w of s.warnings) {
      if (w.code === "PLACEHOLDER_SYSTEM_EXCLUDED" || w.code === "PAY_RIDE_DETECTED") {
        warningCounts[w.code] = (warningCounts[w.code] ?? 0) + 1;
      }
    }
  }

  return {
    batchId: input.batch.id,
    fileName: input.batch.schedule_file_name,
    status: input.batch.status,
    dateRangeFrom: input.batch.date_range_from,
    dateRangeTo: input.batch.date_range_to,
    totalParsedShifts: shifts.length,
    totals,
    warningCounts,
    shifts,
  };
}
