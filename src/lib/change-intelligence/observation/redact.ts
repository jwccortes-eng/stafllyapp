import type { ObservationRecord } from "../engine/types";

/**
 * Removes anything sensitive or unnecessary before logging/exporting.
 * Never log tokens, secrets, addresses in free text, or contact details.
 */
const SENSITIVE_KEY = /token|secret|password|pin|ssn|email|phone/i;

export function redactRecord(record: ObservationRecord): ObservationRecord {
  return {
    ...record,
    deltas: record.deltas.map((d) =>
      SENSITIVE_KEY.test(d.field)
        ? { ...d, before: "[redacted]", after: "[redacted]", beforeLabel: undefined, afterLabel: undefined }
        : d,
    ),
    materialDeltas: record.materialDeltas.map((d) =>
      SENSITIVE_KEY.test(d.field)
        ? { ...d, before: "[redacted]", after: "[redacted]", beforeLabel: undefined, afterLabel: undefined }
        : d,
    ),
  };
}
