import type { ObservationRecord } from "../engine/types";
import type { ObservationSink } from "./sink";
import { redactRecord } from "./redact";

const MAX_RECORDS = 500;

function storageKey(userId: string | null): string {
  return `ci-observation:${userId ?? "anon"}`;
}

/**
 * Ring buffer in sessionStorage. No new tables in F1.
 */
export function createLocalBufferSink(userId: string | null): ObservationSink {
  const key = storageKey(userId);

  const load = (): ObservationRecord[] => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as ObservationRecord[]) : [];
    } catch {
      return [];
    }
  };

  const save = (records: ObservationRecord[]) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(records.slice(-MAX_RECORDS)));
    } catch {
      /* quota or unavailable storage: observation must never break the app */
    }
  };

  return {
    name: "local-buffer",
    write(record) {
      const records = load();
      records.push(redactRecord(record));
      save(records);
    },
    read: load,
    clear() {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* noop */
      }
    },
  };
}
