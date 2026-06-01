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

/** Shift status → pastel badge config */
export const SHIFT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:       { label: "Draft",         className: "status-badge bg-[hsl(var(--pastel-yellow))] text-[hsl(var(--pastel-yellow-text))]" },
  open:        { label: "Open",          className: "status-badge bg-[hsl(var(--pastel-sky))] text-[hsl(var(--pastel-sky-text))]" },
  published:   { label: "Published",     className: "status-badge bg-[hsl(var(--pastel-green))] text-[hsl(var(--pastel-green-text))]" },
  assigned:    { label: "Assigned",      className: "status-badge bg-[hsl(var(--pastel-teal))] text-[hsl(var(--pastel-teal-text))]" },
  confirmed:   { label: "Confirmed",     className: "status-badge bg-[hsl(var(--pastel-green))] text-[hsl(var(--pastel-green-text))]" },
  in_progress: { label: "In Progress",   className: "status-badge bg-[hsl(var(--pastel-sky))] text-[hsl(var(--pastel-sky-text))]" },
  completed:   { label: "Completed",     className: "status-badge bg-[hsl(var(--pastel-indigo))] text-[hsl(var(--pastel-indigo-text))]" },
  issue:       { label: "Issue",         className: "status-badge bg-[hsl(var(--pastel-rose))] text-[hsl(var(--pastel-rose-text))]" },
  canceled:    { label: "Cancelled",     className: "status-badge bg-[hsl(var(--pastel-orange))] text-[hsl(var(--pastel-orange-text))]" },
  cancelled:   { label: "Cancelled",     className: "status-badge bg-[hsl(var(--pastel-orange))] text-[hsl(var(--pastel-orange-text))]" },
  locked:      { label: "Locked",        className: "status-badge bg-[hsl(var(--pastel-violet))] text-[hsl(var(--pastel-violet-text))]" },
};

/** Attendance/clock status → pastel badge config */
export const CLOCK_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  on_time:          { label: "On Time",            className: "status-badge bg-[hsl(var(--pastel-green))] text-[hsl(var(--pastel-green-text))]" },
  late:             { label: "Late",               className: "status-badge bg-[hsl(var(--pastel-yellow))] text-[hsl(var(--pastel-yellow-text))]" },
  missing_clock_in: { label: "Missing Clock In",   className: "status-badge bg-[hsl(var(--pastel-rose))] text-[hsl(var(--pastel-rose-text))]" },
  missing_clock_out:{ label: "Missing Clock Out",  className: "status-badge bg-[hsl(var(--pastel-orange))] text-[hsl(var(--pastel-orange-text))]" },
  corrected:        { label: "Corrected",          className: "status-badge bg-[hsl(var(--pastel-violet))] text-[hsl(var(--pastel-violet-text))]" },
  approved:         { label: "Approved",           className: "status-badge bg-[hsl(var(--pastel-green))] text-[hsl(var(--pastel-green-text))]" },
  pending:          { label: "Pending",            className: "status-badge bg-[hsl(var(--pastel-yellow))] text-[hsl(var(--pastel-yellow-text))]" },
  flagged:          { label: "Flagged",            className: "status-badge bg-[hsl(var(--pastel-rose))] text-[hsl(var(--pastel-rose-text))]" },
  rejected:         { label: "Rejected",           className: "status-badge bg-[hsl(var(--pastel-rose))] text-[hsl(var(--pastel-rose-text))]" },
  imported:         { label: "Imported",           className: "status-badge bg-[hsl(var(--pastel-sky))] text-[hsl(var(--pastel-sky-text))]" },
  reviewed:         { label: "Reviewed",           className: "status-badge bg-[hsl(var(--pastel-teal))] text-[hsl(var(--pastel-teal-text))]" },
};

/** Assignment status config */
export const ASSIGNMENT_STATUS_CONFIG: Record<string, { label: string; dotClass: string }> = {
  confirmed: { label: "Accepted",  dotClass: "bg-emerald-500" },
  pending:   { label: "Pending",   dotClass: "bg-amber-400" },
  rejected:  { label: "Rejected",  dotClass: "bg-rose-500" },
};
