/**
 * F1.2 — PURE mapping ObservationRecord -> CiObservationRow.
 *
 * Strict whitelist. This module is the ONLY place allowed to decide what
 * leaves the browser towards durable storage.
 *
 * FORBIDDEN by construction: person names, emails, phones, tokens, payroll,
 * documents, notes, addresses, rendered message texts, individual recipients,
 * full shift payloads.
 *
 * This is an evidence ledger, NOT a delivery queue: there is no recipient,
 * no send state, no retry counter and no deadline timestamp.
 */
import type { ImpactLevel, ObservationRecord, FieldDelta } from "../engine/types";

export type CiEnvironment = "demo" | "staging" | "production";
export type CiPilotStage = 1 | 2 | 3;
export type CiGate = "pass" | "fail";
export type CiDeadlineCategory = "none" | "lt_2h" | "lt_12h" | "lt_24h" | "gt_24h";

export interface CiObservationRow {
  event_id: string;
  correlation_id: string | null;
  company_id: string;
  environment: CiEnvironment;
  pilot_stage: CiPilotStage;
  domain: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  change_type: string;
  occurred_at: string;
  engine_version: string;
  adapter_version: string;
  impact_level: ImpactLevel;
  delta_semantics: string[];
  audience_counts: Record<string, number>;
  resolved_role_types: string[];
  unresolved_count: number;
  unreachable_count: number;
  deduplication_count: number;
  suppression_reasons: string[];
  simulated_channel: string;
  acknowledgement_required: "none" | "light" | "probatory";
  deadline_category: CiDeadlineCategory;
  message_quality_gate: CiGate;
  message_quality_issues: string[];
  privacy_gate: CiGate;
  privacy_gate_findings: string[];
  legacy_recipient_count: number;
  ci_recipient_count: number;
  unresolved_causes: string[];
  location_ref: string | null;
  client_ref: string | null;
  observation_only: true;
}

/** Keys that may never appear in a durable row, at any depth. */
const FORBIDDEN_VALUE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "email", re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { name: "phone", re: /\+?\d[\d\s().-]{8,}\d/ },
  { name: "token", re: /\b(?:ey[A-Za-z0-9_-]{10,}|sk_[A-Za-z0-9]{10,}|bearer\s+\S+)/i },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Opaque, stable, non-reversible-ish short ref. Never a human name. */
export function opaqueRef(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ref_${(hash >>> 0).toString(36)}`;
}

function direction(delta: FieldDelta): string {
  const { before, after } = delta;
  if (before === null || before === undefined) return "set";
  if (after === null || after === undefined) return "cleared";
  if (typeof before === "string" && typeof after === "string") {
    const a = Date.parse(before);
    const b = Date.parse(after);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return b > a ? "later" : b < a ? "earlier" : "same";
  }
  if (typeof before === "number" && typeof after === "number") {
    return after > before ? "increased" : after < before ? "decreased" : "same";
  }
  return "changed";
}

/** Semantic labels only — never values. e.g. "start_time:later". */
export function deltaSemantics(record: ObservationRecord): string[] {
  return record.materialDeltas.map((d) => `${d.field}:${d.semantic}:${direction(d)}`);
}

export function audienceCounts(record: ObservationRecord): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of record.resolvedAudiences) {
    counts[a.relation] = (counts[a.relation] ?? 0) + 1;
  }
  return counts;
}

export function deadlineCategory(record: ObservationRecord): CiDeadlineCategory {
  const raw = record.context.ackDeadline;
  if (typeof raw !== "string") return "none";
  const deadline = Date.parse(raw);
  const from = Date.parse(record.occurredAt);
  if (Number.isNaN(deadline) || Number.isNaN(from)) return "none";
  const hours = (deadline - from) / 3_600_000;
  if (hours < 2) return "lt_2h";
  if (hours < 12) return "lt_12h";
  if (hours < 24) return "lt_24h";
  return "gt_24h";
}

/**
 * Quality gate over the SIMULATED messages. Only the verdict is persisted,
 * never the text.
 */
export function messageQualityGate(record: ObservationRecord): {
  gate: CiGate;
  issues: string[];
} {
  const issues = new Set<string>();
  for (const message of record.simulatedMessages) {
    const text = message.simulatedMessage ?? "";
    if (!text.trim()) issues.add("empty_message");
    if (/\{[a-zA-Z]+\}/.test(text)) issues.add("unresolved_placeholder");
    if (/undefined|null|NaN/.test(text)) issues.add("broken_token");
    if (text.length > 0 && text.length < 20) issues.add("too_short");
    if (message.acknowledgementRequired === "probatory" && !/\b(antes|before)\b/i.test(text)) {
      issues.add("missing_deadline_sentence");
    }
  }
  return { gate: issues.size === 0 ? "pass" : "fail", issues: [...issues] };
}

/** Scans the produced row for anything that must never be persisted. */
export function privacyGate(row: Omit<CiObservationRow, "privacy_gate" | "privacy_gate_findings">): {
  gate: CiGate;
  findings: string[];
} {
  const findings = new Set<string>();
  const scan = (value: unknown): void => {
    if (typeof value === "string") {
      for (const { name, re } of FORBIDDEN_VALUE_PATTERNS) {
        if (re.test(value)) findings.add(name);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(scan);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(scan);
    }
  };
  const { company_id, aggregate_id, occurred_at, ...rest } = row;
  void company_id;
  void aggregate_id;
  void occurred_at;
  scan(rest);
  return { gate: findings.size === 0 ? "pass" : "fail", findings: [...findings] };
}

export interface DurableRecordOptions {
  environment: CiEnvironment;
  pilotStage: CiPilotStage;
  adapterVersion?: string;
}

export function toDurableRow(
  record: ObservationRecord,
  options: DurableRecordOptions,
): CiObservationRow {
  const quality = messageQualityGate(record);
  const base: Omit<CiObservationRow, "privacy_gate" | "privacy_gate_findings"> = {
    event_id: record.eventId,
    correlation_id: record.correlationId ?? null,
    company_id: record.companyId,
    environment: options.environment,
    pilot_stage: options.pilotStage,
    domain: record.domain,
    aggregate_type: record.aggregateType ?? null,
    aggregate_id: isUuid(record.aggregateId) ? record.aggregateId : null,
    change_type: record.changeType,
    occurred_at: record.occurredAt,
    engine_version: record.engineVersion,
    adapter_version: options.adapterVersion ?? "scheduling@1",
    impact_level: record.impactLevel,
    delta_semantics: deltaSemantics(record),
    audience_counts: audienceCounts(record),
    resolved_role_types: [
      ...new Set(
        record.managerResolution.evidence
          .map((e) => String(e.relationshipType))
          .filter((t) => t.length > 0),
      ),
    ],
    unresolved_count: record.unresolvedAudiences.length,
    unreachable_count: Object.values(record.reachabilityStatus).filter((s) => s === "unreachable")
      .length,
    deduplication_count: record.deduplicatedRecipients,
    suppression_reasons: record.suppressionReason ? [record.suppressionReason] : [],
    simulated_channel: "none",
    acknowledgement_required: record.acknowledgementRequired,
    deadline_category: deadlineCategory(record),
    message_quality_gate: quality.gate,
    message_quality_issues: quality.issues,
    legacy_recipient_count: record.legacyBehaviorComparison.legacyRecipientCount,
    ci_recipient_count: record.legacyBehaviorComparison.ciRecipientCount,
    unresolved_causes: record.managerResolution.unresolvedCause
      ? [record.managerResolution.unresolvedCause]
      : [],
    location_ref: opaqueRef(record.context.locationId ?? null),
    client_ref: opaqueRef(record.context.clientId ?? null),
    observation_only: true,
  };

  const privacy = privacyGate(base);
  return { ...base, privacy_gate: privacy.gate, privacy_gate_findings: privacy.findings };
}
