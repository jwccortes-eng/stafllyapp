import type { ObservationRecord } from "../engine/types";
import type { ObservationSink } from "./sink";
import { redactRecord } from "./redact";

/**
 * Console sink — one compact line per correlationId, redacted payload.
 * Detail lives in the buffer sink.
 */
export function createConsoleSink(): ObservationSink {
  const seen = new Set<string>();
  return {
    name: "console",
    write(record) {
      if (seen.has(record.correlationId)) return;
      seen.add(record.correlationId);
      const r = redactRecord(record);
      // eslint-disable-next-line no-console
      console.info(
        `[CI:OBS] ${r.changeType} lvl=${r.impactLevel} recipients=${r.simulatedMessages.length} mgr=${r.managerResolution.status} suppressed=${r.legacyBehaviorComparison.suppressedCount}`,
        { correlationId: r.correlationId, engineVersion: r.engineVersion },
      );
    },
    read() {
      return [];
    },
    clear() {
      seen.clear();
    },
  };
}
