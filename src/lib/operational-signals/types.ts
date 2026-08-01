/**
 * F1 — Operational Signal Engine (SHADOW MODE).
 *
 * Pure types. This layer NEVER sends anything: it observes real events,
 * computes what the ideal communication decision would be, and records it.
 */

export type SignalPriority = "critical" | "high" | "medium" | "low" | "silent";

export type NotificationFamily =
  | "assignment"
  | "shift_change"
  | "attendance"
  | "no_show"
  | "clock_in"
  | "meeting_point"
  | "transportation"
  | "replacement"
  | "cancellation"
  | "incident"
  | "payroll_exception"
  | "general_information";

export type SignalChannel = "in_app" | "push" | "chat" | "email" | "sms";

export type AudienceRole =
  | "assigned_worker"
  | "captain"
  | "supervisor"
  | "dispatcher"
  | "operations_manager"
  | "transport_coordinator"
  | "payroll_reviewer"
  | "company_admin";

export interface AudienceMember {
  userId: string | null;
  role: AudienceRole;
  /** Why this person was included / excluded. Always required for traceability. */
  reason: string;
}

/** Input contract of `evaluateOperationalSignal` / notify_operational_event_shadow. */
export interface OperationalSignalEvent {
  eventId: string;
  eventType: string;
  companyId: string;
  shiftId?: string | null;
  actorId?: string | null;
  subjectUserId?: string | null;
  eventPayload?: Record<string, unknown>;
  occurredAt: string;
  sourceSystem: string;
  correlationId?: string | null;
  /** What the CURRENT production system did (observed, never altered). */
  currentSystemAction?: string | null;
  actualRecipientsCount?: number;
}

/** Contextual facts used to resolve audience. Read-only snapshot. */
export interface SignalContext {
  companyId: string;
  /** Active (non-draft, non-removed) assigned workers for the shift. */
  activeAssignedWorkerIds?: string[];
  /** Workers removed/cancelled from the shift — always excluded. */
  removedWorkerIds?: string[];
  captainUserIds?: string[];
  supervisorUserIds?: string[];
  dispatcherUserIds?: string[];
  operationsManagerUserIds?: string[];
  transportCoordinatorUserIds?: string[];
  payrollReviewerUserIds?: string[];
  /** Minutes until shift start. Negative = already started. */
  minutesToShiftStart?: number | null;
  /** Recent events sharing the same dedupe key, within the group window. */
  recentSameKeyEventCount?: number;
}

export interface SignalDecision {
  eventId: string;
  companyId: string;
  eventType: string;
  notificationFamily: NotificationFamily;
  priority: SignalPriority;
  recommendedAudience: AudienceMember[];
  excludedAudience: AudienceMember[];
  recommendedChannel: SignalChannel[];
  dedupeKey: string;
  shouldGroup: boolean;
  groupWindowSeconds: number;
  requiresAcknowledgement: boolean;
  acknowledgementDeadlineSeconds: number | null;
  escalationHint: string | null;
  urgencyReason: string | null;
  suppressReason: string | null;
  recommendedSendTime: string;
  riskDetected: string[];
  decisionVersion: string;
}
