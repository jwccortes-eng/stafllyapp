/**
 * F1.2 — durable row privacy, mapping, sampling and volume tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  toDurableRow,
  privacyGate,
  messageQualityGate,
  deadlineCategory,
  deltaSemantics,
  opaqueRef,
} from "../observation/durable-record";
import { isSampled, getDurableSinkStats, resetDurableSinkStats } from "../observation/durable-sink";
import { runAllScenarios } from "../validation/run-scenarios";
import type { ObservationRecord } from "../engine/types";

const scenarios = runAllScenarios();
const records: ObservationRecord[] = scenarios.map((s) => s.record);

const OPTIONS = { environment: "demo" as const, pilotStage: 1 as const };

describe("F1.2 — durable record mapping", () => {
  it("produces a row for every scenario in the A–O matrix", () => {
    expect(records.length).toBeGreaterThan(10);
    for (const record of records) {
      const row = toDurableRow(record, OPTIONS);
      expect(row.observation_only).toBe(true);
      expect(row.simulated_channel).toBe("none");
      expect(row.environment).toBe("demo");
      expect(row.pilot_stage).toBe(1);
    }
  });

  it("never persists rendered message text or individual recipients", () => {
    for (const record of records) {
      const row = toDurableRow(record, OPTIONS) as unknown as Record<string, unknown>;
      expect(Object.keys(row)).not.toContain("simulated_messages");
      expect(Object.keys(row)).not.toContain("recipients");
      expect(Object.keys(row)).not.toContain("audiences");
      const serialized = JSON.stringify(row);
      for (const message of record.simulatedMessages) {
        expect(serialized.includes(message.simulatedMessage)).toBe(false);
        expect(serialized.includes(message.partyId)).toBe(false);
      }
    }
  });

  it("delta semantics carry no values", () => {
    for (const record of records) {
      for (const semantic of deltaSemantics(record)) {
        expect(semantic.split(":")).toHaveLength(3);
        expect(/\d{4}-\d{2}-\d{2}/.test(semantic)).toBe(false);
      }
    }
  });

  it("opaque refs are stable and never the original id", () => {
    const id = "0f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
    expect(opaqueRef(id)).toBe(opaqueRef(id));
    expect(opaqueRef(id)).not.toContain(id);
    expect(opaqueRef(null)).toBeNull();
  });

  it("privacy gate flags emails, phones and tokens", () => {
    const base = toDurableRow(records[0], OPTIONS);
    expect(privacyGate(base).gate).toBe("pass");
    expect(
      privacyGate({ ...base, suppression_reasons: ["contact ana@stafly.com"] }).findings,
    ).toContain("email");
    expect(privacyGate({ ...base, unresolved_causes: ["+57 300 123 4567"] }).findings).toContain(
      "phone",
    );
    expect(
      privacyGate({ ...base, message_quality_issues: ["eyJhbGciOiJIUzI1NiJ9abc"] }).findings,
    ).toContain("token");
  });

  it("every scenario passes the privacy gate", () => {
    for (const record of records) {
      expect(toDurableRow(record, OPTIONS).privacy_gate).toBe("pass");
    }
  });

  it("message quality gate detects unresolved placeholders", () => {
    const record = {
      ...records[0],
      simulatedMessages: [
        {
          ...records[0].simulatedMessages[0],
          simulatedMessage: "Tu turno cambió a {startTime} en {location}",
        },
      ],
    } as ObservationRecord;
    expect(messageQualityGate(record).issues).toContain("unresolved_placeholder");
  });

  it("deadline is stored as a category, never a timestamp", () => {
    const record = {
      ...records[0],
      occurredAt: "2026-07-30T10:00:00.000Z",
      context: { ...records[0].context, ackDeadline: "2026-07-30T11:00:00.000Z" },
    } as ObservationRecord;
    expect(deadlineCategory(record)).toBe("lt_2h");
    const row = toDurableRow(record, OPTIONS);
    expect(JSON.stringify(row)).not.toContain("2026-07-30T11:00:00.000Z");
  });
});

describe("F1.2 — sampling and volume control", () => {
  beforeEach(() => resetDurableSinkStats());

  it("rate 1 keeps every event, rate 0 drops every event", () => {
    for (const record of records) {
      expect(isSampled(record.eventId, 1)).toBe(true);
      expect(isSampled(record.eventId, 0)).toBe(false);
    }
  });

  it("sampling is deterministic per event id", () => {
    const decisions = records.map((r) => isSampled(r.eventId, 0.5));
    expect(records.map((r) => isSampled(r.eventId, 0.5))).toEqual(decisions);
  });

  it("stats start empty and are observable", () => {
    expect(getDurableSinkStats()).toEqual({
      attempted: 0,
      accepted: 0,
      droppedBySampling: 0,
      failed: 0,
      lastError: null,
    });
  });
});
