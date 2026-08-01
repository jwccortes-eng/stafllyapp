import type {
  NotificationFamily,
  SignalChannel,
  SignalPriority,
} from "./types";

export interface FamilyRule {
  family: NotificationFamily;
  basePriority: SignalPriority;
  channels: SignalChannel[];
  requiresAcknowledgement: boolean;
  groupable: boolean;
  groupWindowSeconds: number;
  acknowledgementDeadlineSeconds: number | null;
  escalationHint: string | null;
}

export const FAMILY_RULES: Record<NotificationFamily, FamilyRule> = {
  assignment: {
    family: "assignment",
    basePriority: "medium",
    channels: ["in_app", "push"],
    requiresAcknowledgement: true,
    groupable: true,
    groupWindowSeconds: 300,
    acknowledgementDeadlineSeconds: 7200,
    escalationHint: "notify_dispatcher_if_unconfirmed",
  },
  shift_change: {
    family: "shift_change",
    basePriority: "high",
    channels: ["in_app", "push"],
    requiresAcknowledgement: true,
    groupable: true,
    groupWindowSeconds: 600,
    acknowledgementDeadlineSeconds: 3600,
    escalationHint: "notify_captain_if_unconfirmed",
  },
  attendance: {
    family: "attendance",
    basePriority: "medium",
    channels: ["in_app"],
    requiresAcknowledgement: false,
    groupable: true,
    groupWindowSeconds: 900,
    acknowledgementDeadlineSeconds: null,
    escalationHint: null,
  },
  no_show: {
    family: "no_show",
    basePriority: "critical",
    channels: ["in_app", "push"],
    requiresAcknowledgement: true,
    groupable: false,
    groupWindowSeconds: 0,
    acknowledgementDeadlineSeconds: 900,
    escalationHint: "escalate_to_operations_manager",
  },
  clock_in: {
    family: "clock_in",
    basePriority: "high",
    channels: ["in_app", "push"],
    requiresAcknowledgement: false,
    groupable: true,
    groupWindowSeconds: 600,
    acknowledgementDeadlineSeconds: null,
    escalationHint: null,
  },
  meeting_point: {
    family: "meeting_point",
    basePriority: "high",
    channels: ["in_app", "push", "chat"],
    requiresAcknowledgement: true,
    groupable: false,
    groupWindowSeconds: 0,
    acknowledgementDeadlineSeconds: 1800,
    escalationHint: "call_worker_if_unconfirmed",
  },
  transportation: {
    family: "transportation",
    basePriority: "high",
    channels: ["in_app", "push"],
    requiresAcknowledgement: true,
    groupable: true,
    groupWindowSeconds: 600,
    acknowledgementDeadlineSeconds: 1800,
    escalationHint: "notify_transport_coordinator",
  },
  replacement: {
    family: "replacement",
    basePriority: "high",
    channels: ["in_app", "push"],
    requiresAcknowledgement: true,
    groupable: false,
    groupWindowSeconds: 0,
    acknowledgementDeadlineSeconds: 1800,
    escalationHint: "escalate_to_dispatcher",
  },
  cancellation: {
    family: "cancellation",
    basePriority: "high",
    channels: ["in_app", "push"],
    requiresAcknowledgement: true,
    groupable: false,
    groupWindowSeconds: 0,
    acknowledgementDeadlineSeconds: 3600,
    escalationHint: "notify_captain_if_unconfirmed",
  },
  incident: {
    family: "incident",
    basePriority: "critical",
    channels: ["in_app", "push"],
    requiresAcknowledgement: true,
    groupable: false,
    groupWindowSeconds: 0,
    acknowledgementDeadlineSeconds: 600,
    escalationHint: "escalate_to_operations_manager",
  },
  payroll_exception: {
    family: "payroll_exception",
    basePriority: "medium",
    channels: ["in_app"],
    requiresAcknowledgement: false,
    groupable: true,
    groupWindowSeconds: 3600,
    acknowledgementDeadlineSeconds: null,
    escalationHint: null,
  },
  general_information: {
    family: "general_information",
    basePriority: "low",
    channels: ["in_app"],
    requiresAcknowledgement: false,
    groupable: true,
    groupWindowSeconds: 3600,
    acknowledgementDeadlineSeconds: null,
    escalationHint: null,
  },
};

/** Current production notification `type` → recommended family. */
export const EVENT_TYPE_TO_FAMILY: Record<string, NotificationFamily> = {
  shift_assigned: "assignment",
  shift_assignment: "assignment",
  assignment_confirmed: "assignment",
  shift_claimable: "assignment",
  shift_invitation: "assignment",
  shift_updated: "shift_change",
  shift_updated_reaccept: "shift_change",
  shift_time_changed: "shift_change",
  shift_material_change: "shift_change",
  shift_reminder: "attendance",
  attendance_updated: "attendance",
  no_show_alert: "no_show",
  no_show: "no_show",
  no_clockin_alert: "clock_in",
  no_clock: "clock_in",
  clock_request: "clock_in",
  clock_in_reminder: "clock_in",
  meeting_point_changed: "meeting_point",
  location_changed: "meeting_point",
  transportation_update: "transportation",
  transport_assigned: "transportation",
  replacement_needed: "replacement",
  replacement_assigned: "replacement",
  shift_cancelled: "cancellation",
  shift_canceled: "cancellation",
  assignment_cancelled: "cancellation",
  critical_alert: "incident",
  incident_reported: "incident",
  safety_incident: "incident",
  payroll_exception: "payroll_exception",
  payroll_review_required: "payroll_exception",
  closeout_review: "payroll_exception",
  announcement: "general_information",
  general: "general_information",
  info: "general_information",
};

export function resolveFamily(eventType: string): NotificationFamily {
  return EVENT_TYPE_TO_FAMILY[eventType] ?? "general_information";
}
