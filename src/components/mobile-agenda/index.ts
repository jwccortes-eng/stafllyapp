// Mobile Agenda — premium operational time UI library.
// Presentational only. No Supabase, no payroll, no business logic.
//
// Time standard (project rule):
//   - startTime  → protagonist (large mono).
//   - endTime    → secondary, muted, "Termina aprox.".
//   - meetingTime → secondary protagonist if present.
//   - meetingPoint → highlighted row when present.
//   - duration   → only "≈ Xh estimadas". Never represented as payroll.
//
// Consumers: /portal/shifts, PortalShiftDetailDrawer, MobileShiftOperationsSheet,
// MobileShiftTeamHub, EmployeeDashboard home, future Transportation, Parceros.

export { OperationalAgendaHero } from "./OperationalAgendaHero";
export { OperationalTimeline } from "./OperationalTimeline";
export { OperationalTimelineRow } from "./OperationalTimelineRow";
export { OperationalTimeBlock } from "./OperationalTimeBlock";
export { StatusPulseDot } from "./StatusPulseDot";
export { AgendaSectionHeader } from "./AgendaSectionHeader";
export { AgendaMeetingPointRow } from "./AgendaMeetingPointRow";
export { AgendaEmptyState } from "./AgendaEmptyState";

export {
  AGENDA_STATUS_LABEL_ES,
  AGENDA_STATUS_TO_TONE,
  AGENDA_TONE_CLASSES,
  toneFor,
} from "./types";

export type {
  AgendaStatus,
  AgendaTone,
  AgendaItem,
  AgendaAction,
  AgendaMeetingPoint,
} from "./types";
