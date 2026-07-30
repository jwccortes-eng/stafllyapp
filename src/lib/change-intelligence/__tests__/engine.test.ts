import { describe, it, expect } from "vitest";
import { observe } from "../engine/observe";
import { ChangeTypeRegistry } from "../engine/registry";
import { schedulingRegistry } from "../catalog/scheduling.registry";
import type { AudienceRef, DomainChangeEvent, FieldDelta } from "../engine/types";

const registry = new ChangeTypeRegistry(schedulingRegistry);
const AT = "2026-07-30T12:00:00.000Z";

const reachable = (channels: AudienceRef["reachableChannels"] = ["inbox"]) => ({
  reachableChannels: channels,
  reachability: "reachable" as const,
});

export const manager = (id: string, extra: Partial<AudienceRef> = {}): AudienceRef => ({
  partyId: id,
  partyType: "manager",
  relation: "responsible",
  relationshipType: "shift_explicit",
  resolutionPriority: 1,
  sourceObjectId: "shift-1",
  deduplicationKey: `person:${id}`,
  ...reachable(),
  ...extra,
});

export const worker = (id: string, extra: Partial<AudienceRef> = {}): AudienceRef => ({
  partyId: id,
  partyType: "worker",
  relation: "assigned",
  sourceObjectId: "shift-1",
  deduplicationKey: `person:${id}`,
  ...reachable(),
  ...extra,
});

const timeDelta: FieldDelta = {
  field: "start_time",
  semantic: "time",
  materiality: "operational",
  label: "Inicio",
  before: "08:00",
  after: "10:00",
};

export function makeEvent(overrides: Partial<DomainChangeEvent> = {}): DomainChangeEvent {
  return {
    eventId: "evt-1",
    correlationId: "corr-1",
    occurredAt: AT,
    schemaVersion: 1,
    domain: "scheduling",
    changeType: "shift.time_changed",
    aggregateType: "shift",
    subject: { type: "shift", id: "shift-1", label: "SH-001" },
    actor: { id: "admin-1", type: "user", label: "Admin" },
    tenantId: "company-1",
    fields: [timeDelta],
    audienceHints: [],
    context: {},
    ...overrides,
  };
}

const run = (event: DomainChangeEvent) => observe(event, { registry, evaluatedAt: AT });

describe("D3 — manager_directo resolution", () => {
  it("CA-D3-01: shift with explicit manager resolves only that manager", () => {
    const r = run(makeEvent({ audienceHints: [manager("m1")] }));
    expect(r.managerResolution.status).toBe("resolved");
    expect(r.managerResolution.evidence.map((e) => e.managerId)).toEqual(["m1"]);
  });

  it("CA-D3-02: falls back to location manager when no shift manager exists", () => {
    const r = run(
      makeEvent({
        audienceHints: [
          manager("m2", {
            relationshipType: "location_responsibility",
            resolutionPriority: 2,
            sourceObjectId: "loc-1",
          }),
        ],
      }),
    );
    expect(r.managerResolution.evidence[0].relationshipType).toBe("location_responsibility");
  });

  it("CA-D3-03: shift manager wins over location manager, no mixing", () => {
    const r = run(
      makeEvent({
        audienceHints: [
          manager("m1"),
          manager("m2", {
            relationshipType: "location_responsibility",
            resolutionPriority: 2,
            sourceObjectId: "loc-1",
          }),
        ],
      }),
    );
    expect(r.managerResolution.evidence.map((e) => e.managerId)).toEqual(["m1"]);
    expect(r.resolvedAudiences.map((a) => a.partyId)).not.toContain("m2");
  });

  it("CA-D3-04: two explicit shift managers both resolve", () => {
    const r = run(makeEvent({ audienceHints: [manager("m1"), manager("m2")] }));
    expect(r.managerResolution.evidence.map((e) => e.managerId).sort()).toEqual(["m1", "m2"]);
  });

  it("CA-D3-05: five company managers with no explicit relation notify nobody", () => {
    const hints = ["a", "b", "c", "d", "e"].map((id) =>
      manager(id, { relationshipType: undefined, resolutionPriority: undefined, sourceObjectId: undefined }),
    );
    const r = run(makeEvent({ audienceHints: hints }));
    expect(r.managerResolution.status).toBe("unresolved");
    expect(r.simulatedMessages).toHaveLength(0);
  });

  it("CA-D3-06: global admin author without relation is not a direct manager", () => {
    const r = run(
      makeEvent({
        actor: { id: "admin-9", type: "user", label: "Global admin" },
        audienceHints: [worker("w1")],
      }),
    );
    expect(r.resolvedAudiences.map((a) => a.partyId)).not.toContain("admin-9");
    expect(r.managerResolution.status).toBe("unresolved");
  });

  it("CA-D3-07: supervisor + manager same person = one consolidated message", () => {
    const r = run(
      makeEvent({
        audienceHints: [
          manager("p1"),
          worker("p1", { relation: "supervisor" }),
        ],
      }),
    );
    const messagesForP1 = r.simulatedMessages.filter((m) => m.partyId === "p1");
    expect(messagesForP1).toHaveLength(1);
    expect(r.deduplicatedRecipients).toBe(1);
  });

  it("CA-D3-09: internal note only produces no worker communication", () => {
    const r = run(
      makeEvent({
        fields: [
          {
            field: "notes",
            semantic: "text",
            materiality: "internal",
            before: "a",
            after: "b",
          },
        ],
        audienceHints: [worker("w1"), manager("m1")],
      }),
    );
    expect(r.impactLevel).toBe(0);
    expect(r.simulatedMessages).toHaveLength(0);
    expect(r.suppressionReason).toBe("no_material_delta");
  });

  it("CA-D3-10: unresolved manager does not block worker communication", () => {
    const r = run(
      makeEvent({
        changeType: "shift.location_changed",
        fields: [
          {
            field: "job_site_address",
            semantic: "location",
            materiality: "operational",
            before: "A st",
            after: "B st",
          },
        ],
        audienceHints: [worker("w1")],
      }),
    );
    expect(r.managerResolution.status).toBe("unresolved");
    expect(r.simulatedMessages.map((m) => m.partyId)).toEqual(["w1"]);
  });
});

describe("Engine invariants", () => {
  it("CA-F1-03/05: never falls back to all managers; unresolved stays empty", () => {
    const r = run(makeEvent({ audienceHints: [worker("w1")] }));
    expect(r.managerResolution.evidence).toHaveLength(0);
    expect(r.resolvedAudiences.filter((a) => a.partyType === "manager")).toHaveLength(0);
  });

  it("CA-F1-04: responsible without evidence is excluded", () => {
    const r = run(
      makeEvent({
        audienceHints: [manager("m1", { relationshipType: undefined, sourceObjectId: undefined })],
      }),
    );
    expect(r.unresolvedAudiences.some((e) => e.reason === "responsible_without_verifiable_evidence")).toBe(true);
  });

  it("net-null change is silenced", () => {
    const r = run(
      makeEvent({
        fields: [{ ...timeDelta, before: "08:00", after: "08:00" }],
        audienceHints: [worker("w1")],
      }),
    );
    expect(r.impactLevel).toBe(0);
    expect(r.simulatedMessages).toHaveLength(0);
  });

  it("is deterministic for the same input", () => {
    const event = makeEvent({ audienceHints: [worker("w1"), manager("m1")] });
    expect(JSON.stringify(run(event))).toBe(JSON.stringify(run(event)));
  });

  it("CA-F1-10: engine never mutates the input event", () => {
    const event = makeEvent({ audienceHints: [worker("w1")] });
    const snapshot = JSON.stringify(event);
    run(event);
    expect(JSON.stringify(event)).toBe(snapshot);
  });

  it("every record is observation only", () => {
    expect(run(makeEvent({ audienceHints: [worker("w1")] })).observationOnly).toBe(true);
  });
});

describe("Worker replacement (single ChangeSet)", () => {
  const replacement = makeEvent({
    changeType: "shift.worker_removed",
    fields: [
      {
        field: "assigned_worker",
        semantic: "person",
        materiality: "operational",
        before: "w-out",
        after: "w-in",
        beforeLabel: "Ana",
        afterLabel: "Luis",
      },
    ],
    context: { workerOutLabel: "Ana", workerInLabel: "Luis", isReplacement: true },
    audienceHints: [
      worker("w-out", { relation: "removed" }),
      worker("w-in", { relation: "assigned" }),
      worker("sup-1", { relation: "supervisor" }),
      worker("w-other", { relation: "assigned" }),
    ],
  });

  it("CA-F1-06: outgoing and incoming workers get different messages", () => {
    const r = run(replacement);
    const out = r.simulatedMessages.find((m) => m.partyId === "w-out")!;
    const inc = r.simulatedMessages.find((m) => m.partyId === "w-in")!;
    expect(out.simulatedMessage).toContain("Ya no estás asignado");
    expect(inc.simulatedMessage).toContain("Fuiste asignado");
    expect(out.simulatedMessage).not.toBe(inc.simulatedMessage);
  });

  it("CA-F1-07: one correlationId, supervisor gets the replacement wording", () => {
    const r = run(replacement);
    const sup = r.simulatedMessages.find((m) => m.partyId === "sup-1")!;
    expect(sup.simulatedMessage).toContain("Ana sale y Luis entra en SH-001");
    expect(r.correlationId).toBe("corr-1");
  });

  it("only affected parties receive a simulated message", () => {
    const r = run(replacement);
    expect(r.simulatedMessages.map((m) => m.partyId).sort()).toEqual(
      ["sup-1", "w-in", "w-other", "w-out"].sort(),
    );
  });
});

describe("Reachability", () => {
  it("CA-F1-09: affected but unreachable person is reported, not dropped", () => {
    const r = run(
      makeEvent({
        audienceHints: [
          worker("w1", {
            reachability: "unreachable",
            reachableChannels: [],
            reachabilityReason: "no_employee_to_user_bridge",
          }),
        ],
      }),
    );
    expect(r.reachabilityStatus["w1"]).toBe("unreachable");
    const msg = r.simulatedMessages.find((m) => m.partyId === "w1")!;
    expect(msg.simulatedChannel).toBe("none");
    expect(msg.reachabilityReason).toBe("no_employee_to_user_bridge");
  });
});
