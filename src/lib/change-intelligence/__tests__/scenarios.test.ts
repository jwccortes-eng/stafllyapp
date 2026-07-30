import { describe, it, expect } from "vitest";
import { SCENARIOS } from "../validation/scenarios";
import { runAllScenarios, messageQualityIssues } from "../validation/run-scenarios";
import { aggregateUnresolved } from "../observation/unresolved-aggregate";
import { buildDivergenceReport } from "../observation/report";

const results = runAllScenarios();
const byId = new Map(results.map((r) => [r.scenario.id, r.record]));
const rec = (id: string) => byId.get(id)!;
const msgFor = (id: string, partyId: string) =>
  rec(id).simulatedMessages.find((m) => m.partyId === partyId)?.simulatedMessage ?? "";

describe("F1.1 — scenario matrix coverage", () => {
  it("runs every declared scenario", () => {
    expect(results).toHaveLength(SCENARIOS.length);
    expect(results.every((r) => r.record.observationOnly)).toBe(true);
  });

  it("A1: single worker, level 2, one message", () => {
    const r = rec("A1");
    expect(r.impactLevel).toBe(2);
    expect(r.simulatedMessages.map((m) => m.partyId)).toEqual(["w1"]);
  });

  it("A2: one message per worker, no duplicates", () => {
    const r = rec("A2");
    expect(r.simulatedMessages).toHaveLength(3);
    expect(new Set(r.simulatedMessages.map((m) => m.deduplicationKey)).size).toBe(3);
  });

  it("A3: multiple fields produce ONE consolidated summary", () => {
    const r = rec("A3");
    expect(r.simulatedMessages).toHaveLength(1);
    expect(msgFor("A3", "w1")).toContain("Inicio: 08:00 → 10:00");
    expect(msgFor("A3", "w1")).toContain("Fin: 16:00 → 18:00");
  });

  it("B: date change is level 3 with probatory ack", () => {
    expect(rec("B").impactLevel).toBe(3);
    expect(rec("B").acknowledgementRequired).toBe("probatory");
  });

  it("C: location change tells the worker not to go to the old site", () => {
    expect(msgFor("C", "w1")).toMatch(/no vayas a la anterior/i);
    expect(msgFor("C", "w1")).toContain("Bodega Norte → Planta Sur");
  });

  it("D: only the incoming worker gets the assignment message", () => {
    const ids = rec("D").simulatedMessages.map((m) => m.partyId);
    expect(ids).toContain("w-in");
    expect(ids).not.toContain("w-other");
  });

  it("E: removed worker only learns about their exit", () => {
    const m = msgFor("E", "w-out");
    expect(m).toMatch(/Ya no estás asignado/);
    expect(m).toMatch(/No debes presentarte/);
    expect(m).not.toMatch(/reemplaz/i);
  });

  it("F: replacement is one correlation with differentiated messages", () => {
    const r = rec("F");
    expect(r.correlationId).toBe("F");
    expect(msgFor("F", "w-out")).toMatch(/Ya no estás asignado/);
    expect(msgFor("F", "w-in")).toMatch(/en reemplazo de Ana/);
    expect(msgFor("F", "sup-1")).toMatch(/Ana sale y Luis entra/);
    expect(r.simulatedMessages.map((m) => m.partyId)).not.toContain("w-other");
  });

  it("G: cancellation states not to show up and requires ack", () => {
    expect(msgFor("G", "w1")).toMatch(/fue cancelado/);
    expect(msgFor("G", "w1")).toMatch(/No debes presentarte/);
    expect(rec("G").acknowledgementRequired).toBe("probatory");
  });

  it("H/I: explicit managers resolve with evidence", () => {
    expect(rec("H").managerResolution.status).toBe("resolved");
    expect(rec("I").managerResolution.evidence[0].sourceObjectId).toBe("assign-9");
  });

  it("J: check_in_admin stays supervisor, never manager", () => {
    const r = rec("J");
    expect(r.managerResolution.status).toBe("unresolved");
    const sup = r.simulatedMessages.find((m) => m.partyId === "chk-1")!;
    expect(sup.relation).toBe("supervisor");
  });

  it("K: manager and supervisor collapse into one message", () => {
    expect(rec("K").simulatedMessages.filter((m) => m.partyId === "p1")).toHaveLength(1);
  });

  it("L: unresolved never widens the audience", () => {
    const r = rec("L");
    expect(r.managerResolution.status).toBe("unresolved");
    expect(r.simulatedMessages.map((m) => m.partyId)).toEqual(["w1"]);
    expect(r.legacyBehaviorComparison.suppressedCount).toBe(3);
  });

  it("M: unreachable party is visible with an exact reason and no channel", () => {
    const m = rec("M").simulatedMessages.find((x) => x.partyId === "w-nolink")!;
    expect(m.simulatedChannel).toBe("none");
    expect(m.reachabilityReason).toBe("no_employee_to_user_bridge");
  });

  it("N: level 0 is fully silent", () => {
    expect(rec("N").impactLevel).toBe(0);
    expect(rec("N").simulatedMessages).toHaveLength(0);
    expect(rec("N").suppressionReason).toBeTruthy();
  });

  it("O: ambiguous change type produces no messages", () => {
    expect(rec("O").simulatedMessages).toHaveLength(0);
    expect(rec("O").suppressionReason).toBe("change_type_not_registered");
  });

  it("the author of the change never becomes a recipient", () => {
    for (const { record } of results) {
      expect(record.simulatedMessages.map((m) => m.partyId)).not.toContain("actor-admin");
    }
  });

  it("legacy-only tenant managers are never notified by CI", () => {
    for (const { record } of results) {
      const ids = record.simulatedMessages.map((m) => m.partyId);
      expect(ids.filter((id) => id.startsWith("mgr-global"))).toEqual([]);
    }
  });
});

describe("F1.1 — message quality gate", () => {
  it("no simulated message is generic or has dangling placeholders", () => {
    const failures: string[] = [];
    for (const { scenario, record } of results) {
      for (const m of record.simulatedMessages) {
        const issues = messageQualityIssues(m.simulatedMessage);
        if (issues.length) failures.push(`${scenario.id}/${m.partyId}: ${issues.join(",")} :: ${m.simulatedMessage}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("level 3 messages state a deadline when one is provided", () => {
    const withDeadline = results
      .flatMap((r) => r.record.simulatedMessages)
      .filter((m) => m.level === 3 && m.acknowledgementRequired === "probatory");
    expect(withDeadline.length).toBeGreaterThan(0);
    for (const m of withDeadline) expect(m.simulatedMessage).toMatch(/antes de /);
  });
});

describe("F1.1 — privacy of stored records", () => {
  it("serialized records contain no emails, phones, tokens or payroll fields", () => {
    const blob = JSON.stringify(results.map((r) => r.record));
    expect(blob).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
    expect(blob.toLowerCase()).not.toMatch(/access_token|refresh_token|password|"pin"/);
    expect(blob.toLowerCase()).not.toMatch(/salary|payroll|hourly_rate/);
  });

  it("context is limited to the allowlist", () => {
    const allowed = new Set([
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
    for (const { record } of results) {
      for (const key of Object.keys(record.context)) expect(allowed.has(key)).toBe(true);
    }
  });
});

describe("F1.1 — unresolved aggregation (no per-shift noise)", () => {
  const agg = aggregateUnresolved(results.map((r) => r.record), "2026-07-30T12:00:00.000Z");

  it("reports totals and percentage instead of one entry per shift", () => {
    expect(agg.totalEvaluations).toBe(results.length);
    expect(agg.unresolvedCount).toBeGreaterThan(0);
    expect(agg.unresolvedPct).toBeGreaterThan(0);
  });

  it("groups by company, location and client", () => {
    expect(agg.byCompany[0].key).toBe("company-1");
    expect(agg.byLocation[0].count).toBeGreaterThan(0);
    expect(agg.byClient[0].count).toBeGreaterThan(0);
  });

  it("prioritises future shifts and keeps a bounded sample", () => {
    expect(agg.priorityFutureShifts.length).toBeLessThanOrEqual(20);
    expect(agg.representativeSample.length).toBeLessThanOrEqual(10);
    expect(agg.priorityFutureShifts.every((s) => (s.shiftDate ?? "") >= "2026-07-30")).toBe(true);
  });
});

describe("F1.1 — legacy comparison", () => {
  const report = buildDivergenceReport(results.map((r) => r.record), "2026-07-30T12:00:00.000Z");

  it("CI notifies strictly fewer people than legacy", () => {
    expect(report.ciRecipients).toBeLessThan(report.legacyRecipients);
    expect(report.volumeReductionPct).toBeGreaterThan(0);
  });
});
