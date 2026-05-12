/**
 * Daily Operations — pure derivation helpers.
 *
 * Read-only. No fetching, no side effects. Given a shift and the slices of
 * its assignments + time_entries, derive the operational view used by
 * OpsShiftCard.
 *
 * Hard rule: NEVER convert scheduled hours into worked hours. Worked time
 * comes only from `time_entries.clock_in/clock_out`.
 */

export type ShiftBucket =
  | "needs_staff"
  | "staffed_not_started"
  | "in_progress"
  | "needs_closeout"
  | "closed";

export type ClockState =
  | "none"           // assigned worker, no time_entry today
  | "open"           // clock_in set, clock_out null, within window
  | "closed"         // clock_in + clock_out
  | "missing_out"   // clock_in set, no clock_out, shift end passed grace
  | "unlinked";      // entry exists but not tied to this shift_id

export type AlertLevel = "info" | "warn" | "urgent";

export interface ShiftLite {
  id: string;
  date: string;            // yyyy-MM-dd
  start_time: string;      // HH:mm[:ss]
  end_time: string;        // HH:mm[:ss]
  slots: number | null;
  publication_status?: string | null;
  status?: string | null;
}

export interface AssignmentLite {
  id: string;
  shift_id: string;
  employee_id: string;
  status: string;          // pending | accepted | confirmed | rejected | removed
}

export interface EntryLite {
  id: string;
  shift_id: string | null;
  employee_id: string;
  clock_in: string | null;
  clock_out: string | null;
}

export interface WorkerOpsRow {
  employee_id: string;
  assignment_status: string;
  clock_state: ClockState;
  clock_in: string | null;
  clock_out: string | null;
}

export interface ShiftOpsState {
  shift_id: string;
  bucket: ShiftBucket;
  alert_level: AlertLevel;
  required: number;
  assigned_active: number;     // accepted + confirmed + pending (not rejected/removed)
  confirmed: number;           // accepted + confirmed
  clocked_in: number;          // open OR closed entries linked to shift
  open_clocks: number;
  missing_clock_outs: number;
  not_started: number;         // active assignments with no entry past start+grace
  workers: WorkerOpsRow[];
  /** human helper for debugging / chips */
  reason: string;
}

const LATE_GRACE_MIN = 15;
const CLOSEOUT_GRACE_MIN = 30;

function shiftStartDate(s: ShiftLite): Date {
  return new Date(`${s.date}T${s.start_time}`);
}
function shiftEndDate(s: ShiftLite): Date {
  // end_time may be < start_time (overnight). For Phase A, treat as same-day; if
  // inverted, shift end is next day.
  const start = shiftStartDate(s);
  const end = new Date(`${s.date}T${s.end_time}`);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

export function deriveShiftOpsState(
  shift: ShiftLite,
  assignments: AssignmentLite[],
  entries: EntryLite[],
  now: Date = new Date(),
): ShiftOpsState {
  const required = shift.slots ?? 1;
  const start = shiftStartDate(shift);
  const end = shiftEndDate(shift);

  const active = assignments.filter(
    (a) => a.shift_id === shift.id && !["rejected", "removed"].includes(a.status),
  );
  const confirmedAssignments = active.filter((a) =>
    ["confirmed", "accepted"].includes(a.status),
  );

  const linked = entries.filter((e) => e.shift_id === shift.id);

  const workers: WorkerOpsRow[] = active.map((a) => {
    const entry = linked.find((e) => e.employee_id === a.employee_id);
    let clock_state: ClockState = "none";
    if (entry) {
      if (entry.clock_in && !entry.clock_out) {
        clock_state = now > new Date(end.getTime() + CLOSEOUT_GRACE_MIN * 60_000)
          ? "missing_out"
          : "open";
      } else if (entry.clock_in && entry.clock_out) {
        clock_state = "closed";
      }
    }
    return {
      employee_id: a.employee_id,
      assignment_status: a.status,
      clock_state,
      clock_in: entry?.clock_in ?? null,
      clock_out: entry?.clock_out ?? null,
    };
  });

  const open_clocks = workers.filter((w) => w.clock_state === "open").length;
  const missing_clock_outs = workers.filter((w) => w.clock_state === "missing_out").length;
  const clocked_in = workers.filter((w) =>
    ["open", "closed", "missing_out"].includes(w.clock_state),
  ).length;
  const not_started = workers.filter((w) => w.clock_state === "none").length;

  const minutesPastStart = (now.getTime() - start.getTime()) / 60_000;
  const minutesPastEnd = (now.getTime() - end.getTime()) / 60_000;

  // Bucket
  let bucket: ShiftBucket = "staffed_not_started";
  if (active.length < required) bucket = "needs_staff";
  if (now >= start && now <= end) bucket = "in_progress";
  if (minutesPastEnd > 0 && (open_clocks > 0 || missing_clock_outs > 0)) {
    bucket = "needs_closeout";
  }
  if (
    minutesPastEnd > CLOSEOUT_GRACE_MIN &&
    open_clocks === 0 &&
    missing_clock_outs === 0
  ) {
    bucket = "closed";
  }

  // Alert level
  let alert_level: AlertLevel = "info";
  let reason = "Tracked";
  if (active.length === 0 && (shift.publication_status === "published")) {
    alert_level = "urgent";
    reason = "Published with no workers assigned";
  } else if (active.length < required) {
    alert_level = "warn";
    reason = `Coverage ${active.length}/${required}`;
  }
  if (minutesPastStart > LATE_GRACE_MIN && clocked_in === 0 && active.length > 0) {
    alert_level = "urgent";
    reason = "No worker clocked in past start";
  } else if (minutesPastStart > LATE_GRACE_MIN && not_started > 0 && now <= end) {
    alert_level = alert_level === "urgent" ? "urgent" : "warn";
    reason = `${not_started} not clocked in`;
  }
  if (missing_clock_outs > 0) {
    alert_level = "urgent";
    reason = `${missing_clock_outs} missing clock-out`;
  }

  return {
    shift_id: shift.id,
    bucket,
    alert_level,
    required,
    assigned_active: active.length,
    confirmed: confirmedAssignments.length,
    clocked_in,
    open_clocks,
    missing_clock_outs,
    not_started,
    workers,
    reason,
  };
}

export const BUCKET_LABEL: Record<ShiftBucket, string> = {
  needs_staff: "Needs staff",
  staffed_not_started: "Not started",
  in_progress: "In progress",
  needs_closeout: "Needs closeout",
  closed: "Closed",
};

export const BUCKET_TONE: Record<
  ShiftBucket,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  needs_staff: "warning",
  staffed_not_started: "neutral",
  in_progress: "info",
  needs_closeout: "warning",
  closed: "success",
};
