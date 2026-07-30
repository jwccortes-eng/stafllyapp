/**
 * Single emission point for F1 observation.
 *
 * Removing the calls to `emitShiftObservation` is rollback level 2.
 * This module has NO transport dependency: it can only write to an
 * observation sink.
 */
import { observe } from "../../engine/observe";
import { ChangeTypeRegistry } from "../../engine/registry";
import { schedulingRegistry } from "../../catalog/scheduling.registry";
import { isObservationModeEnabled } from "../../flags";
import { createMemorySink } from "../../observation/memory-sink";
import { createConsoleSink } from "../../observation/console-sink";
import { createLocalBufferSink } from "../../observation/local-buffer-sink";
import { composeSinks, type ObservationSink } from "../../observation/sink";
import type { DomainChangeEvent, ObservationRecord } from "../../engine/types";

const registry = new ChangeTypeRegistry(schedulingRegistry);

let sink: ObservationSink | null = null;

export function getObservationSink(userId: string | null = null): ObservationSink {
  if (!sink) {
    const buffer =
      typeof window !== "undefined" ? createLocalBufferSink(userId) : createMemorySink();
    sink = composeSinks(buffer, createConsoleSink());
  }
  return sink;
}

export function resetObservationSink(): void {
  sink = null;
}

/**
 * Evaluates an event in observation mode. Never throws into the caller and
 * never performs a delivery or a business mutation.
 */
export function emitShiftObservation(
  event: DomainChangeEvent | null,
  userId: string | null = null,
): ObservationRecord | null {
  if (!event) return null;
  if (!isObservationModeEnabled()) return null;
  try {
    const record = observe(event, { registry });
    getObservationSink(userId).write(record);
    return record;
  } catch (error) {
    // Observation must never break an operational flow.
    // eslint-disable-next-line no-console
    console.warn("[CI:OBS] observation failed", error);
    return null;
  }
}

export { registry as schedulingChangeRegistry };
