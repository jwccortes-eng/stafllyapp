import type { ObservationRecordOAI } from "../engine/types";

export interface OaiSink {
  readonly name: string;
  write(record: ObservationRecordOAI): void;
  read(): ObservationRecordOAI[];
  clear(): void;
}

/** Deterministic in-memory sink used by tests and by the staff panel. */
export function createMemorySink(limit = 1000): OaiSink {
  let records: ObservationRecordOAI[] = [];
  return {
    name: "oai-memory",
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

export function composeSinks(...sinks: OaiSink[]): OaiSink {
  return {
    name: `oai-composite(${sinks.map((s) => s.name).join(",")})`,
    write(record) {
      for (const sink of sinks) sink.write(record);
    },
    read() {
      return sinks[0]?.read() ?? [];
    },
    clear() {
      for (const sink of sinks) sink.clear();
    },
  };
}
