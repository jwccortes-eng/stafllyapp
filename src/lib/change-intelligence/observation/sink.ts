import type { ObservationRecord } from "../engine/types";

export interface ObservationSink {
  readonly name: string;
  write(record: ObservationRecord): void;
  read(): ObservationRecord[];
  clear(): void;
}

export function composeSinks(...sinks: ObservationSink[]): ObservationSink {
  return {
    name: `composite(${sinks.map((s) => s.name).join(",")})`,
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
