/**
 * Change Intelligence — Engine types (L0 contract).
 *
 * PURE. This module MUST NOT import anything from a business domain
 * (shifts, payroll, recruiting, documents, timeclock) nor any delivery
 * transport (push, email, sms, whatsapp, supabase).
 *
 * See docs/architecture/CHANGE_INTELLIGENCE_DOMAIN_EVENT_CONTRACT.md
 */

export type ScalarOrRef = string | number | boolean | null;

export type FieldSemantic =
  | "datetime"
  | "date"
  | "time"
  | "location"
  | "money"
  | "text"
  | "status"
  | "person"
  | "quantity";

export type Materiality = "operational" | "cosmetic" | "internal";

export type ImpactLevel = 0 | 1 | 2 | 3;

export type Channel = "inbox" | "push" | "email" | "sms" | "whatsapp";

export type PartyType = "worker" | "manager" | "client" | "admin";

export type AudienceRelation =
  | "assigned"
  | "removed"
  | "candidate"
  | "owner"
  | "supervisor"
  | "observer"
  | "responsible";

/** D3 evidence — only valid with relation = 'responsible'. */
export type RelationshipType =
  | "shift_explicit"
  | "location_responsibility"
  | "client_responsibility"
  | "operational_unit_responsibility"
  | "duty_manager";

export const RELATIONSHIP_PRIORITY: Record<RelationshipType, 1 | 2 | 3 | 4 | 5> = {
  shift_explicit: 1,
  location_responsibility: 2,
  client_responsibility: 3,
  operational_unit_responsibility: 4,
  duty_manager: 5,
};

export type Reachability = "reachable" | "unreachable";

export interface EntityRef {
  type: string;
  id: string;
  label: string;
}

export interface ActorRef {
  id: string | null;
  type: "user" | "system" | "import";
  label: string;
}

export interface FieldDelta {
  field: string;
  semantic: FieldSemantic;
  before: ScalarOrRef;
  after: ScalarOrRef;
  materiality: Materiality;
  /** Optional human label used by composition templates. */
  label?: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export interface AudienceRef {
  partyId: string;
  partyType: PartyType;
  relation: AudienceRelation;
  /** Required when relation === 'responsible' (D3 evidence). */
  relationshipType?: RelationshipType;
  resolutionPriority?: 1 | 2 | 3 | 4 | 5;
  sourceObjectId?: string;
  deduplicationKey: string;
  reachableChannels: Channel[];
  reachability: Reachability;
  /** Exact reason when unreachable. Never guessed. */
  reachabilityReason?: string;
  displayLabel?: string;
}

export interface DomainChangeEvent {
  eventId: string;
  correlationId: string;
  occurredAt: string;
  schemaVersion: 1;
  domain: string;
  changeType: string;
  aggregateType: string;
  subject: EntityRef;
  actor: ActorRef;
  tenantId: string;
  fields: FieldDelta[];
  audienceHints: AudienceRef[];
  context: Record<string, ScalarOrRef>;
  /** Audience the legacy behaviour would have notified (party ids). */
  legacyAudience?: string[];
}

export interface ChangeTypeRegistration {
  changeType: string;
  defaultLevel: ImpactLevel;
  /** Per relation impact level. Absent relation = not an audience. */
  audienceMatrix: Partial<Record<AudienceRelation, ImpactLevel>>;
  requiresAck: "none" | "light" | "probatory";
  /** Templates keyed by relation, with {placeholders}. */
  templates: Partial<Record<AudienceRelation, string>>;
  /** Consolidation window in seconds, by level. */
  coalescingWindowSeconds?: Partial<Record<ImpactLevel, number>>;
}

export type ManagerResolutionStatus = "resolved" | "unresolved";

export interface ManagerResolutionEvidence {
  managerId: string;
  relationshipType: RelationshipType | "unresolved";
  sourceObjectId: string | null;
  resolutionPriority: 1 | 2 | 3 | 4 | 5 | null;
  resolvedAt: string;
  reason: string;
  whetherNotificationWasRequired: boolean;
  deduplicationKey: string;
}

export interface ManagerResolution {
  status: ManagerResolutionStatus;
  evidence: ManagerResolutionEvidence[];
  /** Config cause when unresolved, for aggregated simulated alerting. */
  unresolvedCause?: string;
}

export interface ExcludedParty {
  partyId: string;
  relation: AudienceRelation;
  reason: string;
}

export interface SimulatedMessage {
  partyId: string;
  relation: AudienceRelation;
  deduplicationKey: string;
  level: ImpactLevel;
  simulatedChannel: Channel | "none";
  simulatedMessage: string;
  acknowledgementRequired: "none" | "light" | "probatory";
  reachability: Reachability;
  reachabilityReason?: string;
  coalescingWindowSeconds: number;
}

export interface LegacyComparison {
  legacyRecipientCount: number;
  ciRecipientCount: number;
  suppressedCount: number;
  legacyManagersWithoutExplicitRelation: number;
}

export interface ObservationRecord {
  engineVersion: string;
  eventId: string;
  correlationId: string;
  companyId: string;
  domain: string;
  changeType: string;
  aggregateType: string;
  aggregateId: string;
  actorId: string | null;
  occurredAt: string;
  evaluatedAt: string;
  deltas: FieldDelta[];
  materialDeltas: FieldDelta[];
  materiality: Materiality[];
  impactLevel: ImpactLevel;
  audienceCandidates: AudienceRef[];
  resolvedAudiences: AudienceRef[];
  unresolvedAudiences: ExcludedParty[];
  deduplicatedRecipients: number;
  reachabilityStatus: Record<string, Reachability>;
  managerResolution: ManagerResolution;
  simulatedMessages: SimulatedMessage[];
  acknowledgementRequired: "none" | "light" | "probatory";
  suppressionReason: string | null;
  legacyBehaviorComparison: LegacyComparison;
  /** Always true in F1. Guarantees no real delivery happened. */
  /** Non-sensitive grouping context copied from the event (ids/labels only). */
  context: Record<string, ScalarOrRef>;
  observationOnly: true;
}
