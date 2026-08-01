/**
 * Shared pastel pill palette for the scheduling/hours module.
 * Each employee/entity gets a stable color based on index.
 * Uses CSS custom properties defined in index.css.
 */

export const PASTEL_PILL_CLASSES = [
  "pastel-pill-rose",
  "pastel-pill-green",
  "pastel-pill-yellow",
  "pastel-pill-violet",
  "pastel-pill-sky",
  "pastel-pill-pink",
  "pastel-pill-teal",
  "pastel-pill-orange",
  "pastel-pill-indigo",
  "pastel-pill-cyan",
  "pastel-pill-peach",
  "pastel-pill-mint",
] as const;

export type PastelPillClass = (typeof PASTEL_PILL_CLASSES)[number];

/** Get a stable pastel class for an entity by index or ID hash */
export function getPastelClass(index: number): PastelPillClass {
  return PASTEL_PILL_CLASSES[index % PASTEL_PILL_CLASSES.length];
}

/** Build a stable color map from an array of IDs */
export function buildPastelMap(ids: string[]): Map<string, PastelPillClass> {
  const map = new Map<string, PastelPillClass>();
  ids.forEach((id, i) => map.set(id, getPastelClass(i)));
  return map;
}

/** Shift status → badge config (OX-2: familias semánticas, sin paleta propia) */
const familyPill = (family: StatusFamily) => `status-badge border ${FAMILY_CLASSES[family]}`;

export const SHIFT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:       { label: "Draft",       className: familyPill("neutral") },
  open:        { label: "Open",        className: familyPill("progress") },
  published:   { label: "Published",   className: familyPill("positive") },
  assigned:    { label: "Assigned",    className: familyPill("positive") },
  confirmed:   { label: "Confirmed",   className: familyPill("positive") },
  in_progress: { label: "In Progress", className: familyPill("progress") },
  completed:   { label: "Completed",   className: familyPill("positive") },
  issue:       { label: "Issue",       className: familyPill("critical") },
  canceled:    { label: "Cancelled",   className: familyPill("critical") },
  cancelled:   { label: "Cancelled",   className: familyPill("critical") },
  locked:      { label: "Locked",      className: familyPill("neutral") },
};

/** Attendance/clock status → badge config */
export const CLOCK_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  on_time:          { label: "On Time",           className: familyPill("positive") },
  late:             { label: "Late",              className: familyPill("warning") },
  missing_clock_in: { label: "Missing Clock In",  className: familyPill("critical") },
  missing_clock_out:{ label: "Missing Clock Out", className: familyPill("critical") },
  corrected:        { label: "Corrected",         className: familyPill("progress") },
  approved:         { label: "Approved",          className: familyPill("positive") },
  pending:          { label: "Pending",           className: familyPill("warning") },
  flagged:          { label: "Flagged",           className: familyPill("critical") },
  rejected:         { label: "Rejected",          className: familyPill("critical") },
  imported:         { label: "Imported",          className: familyPill("neutral") },
  reviewed:         { label: "Reviewed",          className: familyPill("progress") },
};

/** Assignment status config */
export const ASSIGNMENT_STATUS_CONFIG: Record<string, { label: string; dotClass: string }> = {
  confirmed: { label: "Accepted",  dotClass: FAMILY_DOT_CLASSES.positive },
  pending:   { label: "Pending",   dotClass: FAMILY_DOT_CLASSES.warning },
  rejected:  { label: "Rejected",  dotClass: FAMILY_DOT_CLASSES.critical },
};

