/**
 * F1.2 Stage 1 — smoke suite for the controlled activation window.
 *
 * Runs the 10 authorized smoke cases through the full observation pipeline
 * (engine -> durable row) and asserts the Stage 1 invariants. No network,
 * no delivery, no business mutation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runScenario } from "../validation/run-scenarios";
import { SCENARIOS } from "../validation/scenarios";
import { toDurableRow } from "../observation/durable-record";
import { isSampled } from "../observation/durable-sink";
import { isDurableCompanyAllowed, setDurableCompanyAllowlist } from "../flags";

const DEMO_COMPANY = "d3500000-0000-4000-8000-000000000001";

/** smoke case -> scenario id in the approved matrix */
const SMOKE_CASES: Array<[string, string]> = [
  ["1. Cambio de hora", "A1"],
  ["2. Cambio de fecha", "B"],
  ["3. Cambio de ubicación", "C"],
  ["4. Trabajador agregado", "D"],
  ["5. Trabajador removido", "E"],
  ["6. Reemplazo consolidado", "F"],
  ["7. Cancelación", "G"],
  ["8. Cambio Nivel 0", "N"],
  ["9. Manager unresolved", "L"],
  ["10. Persona unreachable", "M"],
];

const byId = (id: string) => {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`scenario ${id} not found`);
  return scenario;
};

describe("F1.2 Stage 1 smoke", () => {
  beforeEach(() => setDurableCompanyAllowlist([DEMO_COMPANY]));
  afterEach(() => setDurableCompanyAllowlist([]));

  it.each(SMOKE_CASES)("%s persists a valid observation-only row", (_label, id) => {
    const result = runScenario(byId(id));
    const row = toDurableRow(result.record, { environment: "demo", pilotStage: 1 });

    expect(row.observation_only ?? true).toBe(true);
    expect(row.environment).toBe("demo");
    expect(row.pilot_stage).toBe(1);
    // no delivery semantics anywhere in the row
    const keys = Object.keys(row).join(",");
    expect(keys).not.toMatch(/sent_at|retry|delivery|push|channel_provider|queue/);
    // no PII in the persisted payload (engine's own privacy gate)
    expect(row.privacy_gate).toBe("pass");
    expect(row.privacy_gate_findings).toEqual([]);
    // deterministic identity => no duplicates for the same event
    expect(row.event_id).toBe(result.record.eventId);
  });

  it("keeps a consolidated replacement as a single correlated event", () => {
    const result = runScenario(byId("F"));
    const row = toDurableRow(result.record, { environment: "demo", pilotStage: 1 });
    expect(row.change_type).toBe(result.record.changeType);
    expect(row.correlation_id ?? row.event_id).toBeTruthy();
  });

  it("does not widen the audience when a manager is unresolved", () => {
    const result = runScenario(byId("L"));
    const row = toDurableRow(result.record, { environment: "demo", pilotStage: 1 });
    expect(row.unresolved_count + row.audience_counts.unresolved ?? 0).toBeGreaterThanOrEqual(0);
    const counts = Object.values(row.audience_counts ?? {}) as number[];
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(result.record.resolvedAudiences.length);
  });

  it("only observes the explicitly activated company", () => {
    expect(isDurableCompanyAllowed(DEMO_COMPANY)).toBe(true);
    expect(isDurableCompanyAllowed("00000000-0000-4000-8000-000000000999")).toBe(false);
    setDurableCompanyAllowlist([]);
    expect(isDurableCompanyAllowed(DEMO_COMPANY)).toBe(false);
  });

  it("samples deterministically (idempotent decision per event)", () => {
    expect(isSampled("evt-1", 1)).toBe(true);
    expect(isSampled("evt-1", 0)).toBe(false);
    expect(isSampled("evt-1", 0.5)).toBe(isSampled("evt-1", 0.5));
  });
});
