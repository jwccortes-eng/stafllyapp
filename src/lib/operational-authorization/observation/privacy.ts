/**
 * OAI F1 — privacy gate.
 *
 * Data minimisation is enforced by REJECTION, not by sanitising. If a record
 * carries anything that looks like PII, the record is dropped and the reason is
 * counted. Nothing is "cleaned up and stored anyway".
 */
import type { ObservationRecordOAI } from "../engine/types";

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/;
const SSN_LIKE = /\b\d{3}-?\d{2}-?\d{4}\b/;
const LONG_FREE_TEXT = /\s\S+\s\S+\s\S+\s\S+\s/; // 5+ whitespace-separated words

const UUID_OR_HASH = /^[0-9a-f-]{8,}$/i;

export class PrivacyViolation extends Error {
  constructor(public readonly field: string, public readonly rule: string) {
    super(`oai_privacy_violation:${field}:${rule}`);
    this.name = "PrivacyViolation";
  }
}

function assertOpaqueRef(field: string, value: string | null): void {
  if (value === null) return;
  if (!UUID_OR_HASH.test(value)) throw new PrivacyViolation(field, "not_opaque_reference");
}

function assertCodeLike(field: string, value: string): void {
  if (EMAIL.test(value)) throw new PrivacyViolation(field, "email");
  if (PHONE_LIKE.test(value)) throw new PrivacyViolation(field, "phone_like");
  if (SSN_LIKE.test(value)) throw new PrivacyViolation(field, "identification_like");
  if (LONG_FREE_TEXT.test(value)) throw new PrivacyViolation(field, "free_text");
  if (value.length > 120) throw new PrivacyViolation(field, "too_long");
}

/**
 * Throws a PrivacyViolation when the record is not storable.
 * Returns the record unchanged when it passes.
 */
export function privacyGate(record: ObservationRecordOAI): ObservationRecordOAI {
  assertOpaqueRef("companyId", record.companyId);
  assertOpaqueRef("workerRef", record.workerRef);
  assertOpaqueRef("shiftRef", record.shiftRef);
  assertOpaqueRef("actorRef", record.actorRef);
  assertOpaqueRef("clientRef", record.clientRef);
  assertOpaqueRef("locationRef", record.locationRef);

  for (const reason of record.systemBlockReasons) assertCodeLike("systemBlockReasons", reason);
  for (const code of record.simulatedReasonCodes) assertCodeLike("simulatedReasonCodes", code);
  for (const code of record.unclassifiedRequirements) {
    assertCodeLike("unclassifiedRequirements", code);
  }
  for (const summary of record.evidenceGradeSummary) {
    assertCodeLike("evidenceGradeSummary", summary.requirementCode);
  }

  if (record.observationOnly !== true) {
    throw new PrivacyViolation("observationOnly", "must_be_true");
  }

  return record;
}

export function isPrivacyViolation(error: unknown): error is PrivacyViolation {
  return error instanceof PrivacyViolation;
}
