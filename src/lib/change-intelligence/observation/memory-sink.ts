import type { ObservationRecord } from "../engine/types";
import type { ObservationSink } from "./sink";

/** Deterministic in-memory sink used by tests and by the dev inspector. */
export function createMemorySink(limit = 500): ObservationSink {
  let records: ObservationRecord[] = [];
  return {
    name: "memory",
    write(record) {
      records.push(record);
      if (records.length > limit) records = records.slice(-limit);
    },
    read() {
      return [...records];
    },
    clear() {
      records = [];
    },
  };
}
