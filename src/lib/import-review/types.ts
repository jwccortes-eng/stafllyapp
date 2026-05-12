/**
 * Read-only Import Review Center model.
 * Built entirely from existing dry-run audit rows; no DB writes.
 */
import type { ImportWarning } from "@/lib/import/import-warnings";

export type DiffStatus =
  | "matched_exact"
  | "matched_fallback"
  | "would_create"
  | "possible_duplicate"
  | "needs_review";

export interface ReviewWorker {
  rawName: string;
  matchedEmployeeId: string | null;
  matchMethod: string | null;
  matchConfidence: number | null;
  status:
    | "matched"
    | "missing_in_stafly"
    | "extra_in_stafly"
    | "inactive_matched"
    | "placeholder"
    | "imported_accept_only"
    | "unmatched";
  // Display helpers
  displayName: string;
  employerId?: string | null;
  isActive?: boolean;
  warnings: ImportWarning[];
}

export interface ReviewLocationProposal {
  sourceAddress: string | null;
  currentLocationId: string | null;
  currentLocationName: string | null;
  willCreate: boolean;
  preserved: boolean;
}

export interface ReviewNoteProposal {
  sourceNote: string | null;
  parsed: {
    meetingPoint?: string | null;
    meetingTime?: string | null;
    driverHint?: string | null;
    confidence?: string | null;
  } | null;
  needsReview: boolean;
  currentMeetingPoint: string | null;
  currentMeetingTime: string | null;
  preserved: boolean;
}

export interface ReviewShift {
  /** Stable signature used for "Mark reviewed" localStorage key. */
  signature: string;
  // Source side
  sourceShiftTitle: string | null;
  sourceShiftCode: string | null;
  date: string;
  startTime: string;
  endTime: string;
  job: string | null;
  sourceAddress: string | null;
  sourceNote: string | null;
  // Stafly side
  staflyShiftId: string | null;
  staflyShiftCode: string | null;
  staflySlots: number | null;
  staflyClientName: string | null;
  staflyAssignedWorkers: Array<{
    employeeId: string;
    name: string;
    employerId?: string | null;
  }>;
  // Diff
  status: DiffStatus;
  workers: ReviewWorker[];
  location: ReviewLocationProposal;
  note: ReviewNoteProposal;
  warnings: ImportWarning[];
}

export interface ReviewModel {
  batchId: string;
  fileName: string | null;
  status: string;
  dateRangeFrom: string | null;
  dateRangeTo: string | null;
  totalParsedShifts: number;
  totals: {
    matchedExact: number;
    matchedFallback: number;
    wouldCreate: number;
    possibleDuplicate: number;
    needsReview: number;
  };
  warningCounts: Record<string, number>;
  shifts: ReviewShift[];
}
