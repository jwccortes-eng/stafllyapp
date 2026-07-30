import type { ObservationRecord, ScalarOrRef } from "../engine/types";

/**
 * F1.1 — redaction contract for anything written to a sink.
 *
 * Stored: ids, change type, deltas of operational fields (times, dates,
 * location label), impact level, relations, reachability, simulated message.
 * NEVER stored: tokens, credentials, emails, phones, documents, payroll data,
 * personal addresses, free-text notes, or full business object payloads.
 */
const SENSITIVE_FIELD =
  /token|secret|password|pin|ssn|email|phone|document|dni|passport|salary|rate|pay|wage|bank|account|note|comment|instruction|address|lat|lng|geo/i;

/** Only these context keys survive; everything else is dropped by default. */
const CONTEXT_ALLOWLIST = new Set([
  "shiftCode",
  "shiftDate",
  "subjectLabel",
  "companyLabel",
  "locationId",
  "locationLabel",
  "clientId",
  "clientLabel",
  "workerInLabel",
  "workerOutLabel",
  "isReplacement",
  "ackDeadline",
]);

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
/** Phone-like runs only. Dates, times and shift codes must survive intact. */
const PHONE_LIKE = /\+?\d[\d\s().-]{6,}\d/g;
const ISO_DATE = /\d{4}-\d{2}-\d{2}/;
const CLOCK_TIME = /\d{1,2}:\d{2}/;

function looksLikePhone(candidate: string): boolean {
  if (ISO_DATE.test(candidate) || CLOCK_TIME.test(candidate)) return false;
  const digits = candidate.replace(/\D/g, "");
  return digits.length >= 9;
}

export function scrubText(value: string): string {
  return value
    .replace(EMAIL, "[email]")
    .replace(PHONE_LIKE, (match) => (looksLikePhone(match) ? "[num]" : match));
}


function scrubValue(value: ScalarOrRef): ScalarOrRef {
  return typeof value === "string" ? scrubText(value) : value;
}

function redactDeltas(deltas: ObservationRecord["deltas"]): ObservationRecord["deltas"] {
  return deltas.map((d) =>
    SENSITIVE_FIELD.test(d.field)
      ? { ...d, before: "[redacted]", after: "[redacted]", beforeLabel: undefined, afterLabel: undefined }
      : {
          ...d,
          before: scrubValue(d.before),
          after: scrubValue(d.after),
          beforeLabel: d.beforeLabel ? scrubText(d.beforeLabel) : undefined,
          afterLabel: d.afterLabel ? scrubText(d.afterLabel) : undefined,
        },
  );
}

export function redactRecord(record: ObservationRecord): ObservationRecord {
  const context: Record<string, ScalarOrRef> = {};
  for (const [key, value] of Object.entries(record.context)) {
    if (!CONTEXT_ALLOWLIST.has(key)) continue;
    if (SENSITIVE_FIELD.test(key)) continue;
    context[key] = scrubValue(value);
  }

  return {
    ...record,
    context,
    deltas: redactDeltas(record.deltas),
    materialDeltas: redactDeltas(record.materialDeltas),
    audienceCandidates: record.audienceCandidates.map((a) => ({
      ...a,
      displayLabel: a.displayLabel ? scrubText(a.displayLabel) : undefined,
    })),
    resolvedAudiences: record.resolvedAudiences.map((a) => ({
      ...a,
      displayLabel: a.displayLabel ? scrubText(a.displayLabel) : undefined,
    })),
    simulatedMessages: record.simulatedMessages.map((m) => ({
      ...m,
      simulatedMessage: scrubText(m.simulatedMessage),
    })),
  };
}
