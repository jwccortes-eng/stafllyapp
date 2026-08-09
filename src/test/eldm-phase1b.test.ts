/**
 * ELDM Fase 1B — circuito real de señal.
 * Adapters puros + proyección persistente + explicabilidad + idempotencia.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  fromAssignmentEvent,
  fromAttendanceOutcome,
  fromEntityResolutionEvent,
  fromWorkerResponse,
  explainRecommendation,
  confidenceLabel,
  InvalidWorkOutcomeError,
} from "@/lib/eldm-adapters";
import { buildSnapshot, fromRow, toRow, type StoredSignalRow } from "@/lib/eldm-store";
import { getDecisionContext } from "@/lib/eldm";

const COMPANY_A = "11111111-1111-1111-1111-111111111111";
const COMPANY_B = "22222222-2222-2222-2222-222222222222";
const WORKER = "33333333-3333-3333-3333-333333333333";
const VENUE = "44444444-4444-4444-4444-444444444444";
const NOW = "2026-08-09T00:00:00.000Z";

function row(overrides: Partial<StoredSignalRow>): StoredSignalRow {
  return {
    id: crypto.randomUUID(),
    company_id: COMPANY_A,
    knowledge_kind: "outcome",
    domain: "attendance",
    verb: "worked",
    scope_level: "tenant",
    person_id: WORKER,
    venue_id: VENUE,
    client_id: null,
    service_type: "security",
    subject_role: null,
    occurred_at: "2026-07-20T00:00:00.000Z",
    source_reference: "outcome:worked:shift:worker",
    evidence_ref: "shift",
    attributes: {},
    superseded_by: null,
    ...overrides,
  };
}

function historySignals(count: number, verb: string, domain: StoredSignalRow["domain"]) {
  return Array.from({ length: count }, (_, i) =>
    fromRow(
      row({
        verb,
        domain,
        occurred_at: `2026-07-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`,
        source_reference: `${verb}:${i}`,
      }),
    ),
  );
}

describe("ELDM 1B — adapters", () => {
  it("A. el alias confirmado se convierte en hecho persistible e idempotente", () => {
    const signal = fromEntityResolutionEvent({
      companyId: COMPANY_A,
      verb: "alias_confirmed",
      entityType: "venue",
      entityId: VENUE,
      aliasNormalized: "millenium",
      occurredAt: NOW,
      eventId: "intake-item-1",
    });
    expect(signal.knowledgeKind).toBe("fact");
    expect(signal.sourceReference).toBe("intake:alias_confirmed:intake-item-1");
    expect(signal.scope).toEqual({ level: "tenant", companyId: COMPANY_A });

    const again = fromEntityResolutionEvent({
      companyId: COMPANY_A,
      verb: "alias_confirmed",
      entityType: "venue",
      entityId: VENUE,
      aliasNormalized: "millenium",
      occurredAt: "2026-08-09T10:00:00.000Z",
      eventId: "intake-item-1",
    });
    expect(again.sourceReference).toBe(signal.sourceReference);
  });

  it("B. la decisión de asignación guarda si se siguió la recomendación", () => {
    const signal = fromAssignmentEvent({
      companyId: COMPANY_A,
      verb: "selected",
      personId: WORKER,
      shiftId: "shift-1",
      venueId: VENUE,
      occurredAt: NOW,
      recommendedPersonId: WORKER,
    });
    expect(signal.knowledgeKind).toBe("decision");
    expect(signal.attributes.followed_recommendation).toBe(true);
  });

  it("E. el mismo evento reprocesado produce la misma identidad de origen", () => {
    const a = fromWorkerResponse({
      companyId: COMPANY_A,
      personId: WORKER,
      shiftId: "shift-1",
      verb: "accepted",
      occurredAt: NOW,
    });
    const b = fromWorkerResponse({
      companyId: COMPANY_A,
      personId: WORKER,
      shiftId: "shift-1",
      verb: "accepted",
      occurredAt: "2026-08-09T09:00:00.000Z",
    });
    expect(a.sourceReference).toBe(b.sourceReference);
  });

  it("las horas programadas no pueden ser outcome de trabajo realizado", () => {
    expect(() =>
      fromAttendanceOutcome({
        companyId: COMPANY_A,
        personId: WORKER,
        shiftId: "shift-1",
        verb: "worked",
        occurredAt: NOW,
        evidenceSource: "scheduled_hours",
      }),
    ).toThrow(InvalidWorkOutcomeError);

    expect(
      fromAttendanceOutcome({
        companyId: COMPANY_A,
        personId: WORKER,
        shiftId: "shift-1",
        verb: "worked",
        occurredAt: NOW,
        evidenceSource: "time_entry",
      }).knowledgeKind,
    ).toBe("outcome");
  });

  it("H. los datos sensibles no llegan a la fila persistida", () => {
    const signal = fromEntityResolutionEvent({
      companyId: COMPANY_A,
      verb: "entity_created",
      entityType: "client",
      entityId: "client-1",
      occurredAt: NOW,
      eventId: "intake-2",
    });
    const persisted = toRow({
      ...signal,
      attributes: {
        ...signal.attributes,
        contact_phone: "+1 555 000",
        billing_rate: 32,
        address: "123 Main St",
        venue_capacity: 300,
      },
    });
    expect(persisted.attributes).not.toHaveProperty("contact_phone");
    expect(persisted.attributes).not.toHaveProperty("billing_rate");
    expect(persisted.attributes).not.toHaveProperty("address");
    expect(persisted.attributes).toHaveProperty("venue_capacity", 300);
  });
});

describe("ELDM 1B — continuidad entre sesiones", () => {
  it("C. una sesión nueva recupera el historial persistido y lo explica", () => {
    const signals = [
      ...historySignals(4, "worked", "attendance"),
      ...historySignals(3, "accepted", "response"),
    ];
    const snapshot = buildSnapshot({
      companyId: COMPANY_A,
      signals,
      personId: WORKER,
      venueId: VENUE,
      serviceType: "security",
      now: NOW,
    });
    const context = getDecisionContext(
      {
        companyId: COMPANY_A,
        personId: WORKER,
        venueId: VENUE,
        serviceType: "security",
        decisionType: "recommend_worker",
        now: NOW,
      },
      snapshot,
    );
    const explained = explainRecommendation(context);
    expect(explained.headline).toContain("Recomendado porque");
    expect(explained.reasons.length).toBeGreaterThan(0);
    expect(explained.evidenceCount).toBeGreaterThan(0);
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(explained.label);
    expect(explained.lastObservedAt).not.toBeNull();
  });

  it("D. la evidencia contradictoria baja la confianza", () => {
    const positive = historySignals(5, "worked", "attendance");
    const negative = [
      fromRow(row({ verb: "no_show", source_reference: "no_show:1" })),
      fromRow(row({ verb: "no_show", source_reference: "no_show:2" })),
      fromRow(row({ verb: "no_show", source_reference: "no_show:3" })),
    ];

    const clean = getDecisionContext(
      { companyId: COMPANY_A, personId: WORKER, decisionType: "recommend_worker", now: NOW },
      buildSnapshot({ companyId: COMPANY_A, signals: positive, personId: WORKER, now: NOW }),
    );
    const contested = getDecisionContext(
      { companyId: COMPANY_A, personId: WORKER, decisionType: "recommend_worker", now: NOW },
      buildSnapshot({
        companyId: COMPANY_A,
        signals: [...positive, ...negative],
        personId: WORKER,
        now: NOW,
      }),
    );
    expect(contested.confidence).toBeLessThan(clean.confidence);
    expect(contested.contradictingEvidence.length).toBeGreaterThan(0);
  });

  it("F. una corrección deja fuera la evidencia invalidada", () => {
    const vigentes = [
      ...historySignals(4, "worked", "attendance"),
      // el no_show corregido ya no se carga: `loadSignals` filtra superseded
    ];
    const snapshot = buildSnapshot({
      companyId: COMPANY_A,
      signals: vigentes,
      personId: WORKER,
      now: NOW,
    });
    const context = getDecisionContext(
      { companyId: COMPANY_A, personId: WORKER, decisionType: "recommend_worker", now: NOW },
      snapshot,
    );
    expect(context.relevantOutcomes.every((o) => o.value !== "no_show")).toBe(true);
    expect(context.contradictingEvidence).toHaveLength(0);
  });

  it("G. el tenant B no ve señales del tenant A", () => {
    const snapshot = buildSnapshot({
      companyId: COMPANY_A,
      signals: historySignals(4, "worked", "attendance"),
      personId: WORKER,
      now: NOW,
    });
    const contextB = getDecisionContext(
      { companyId: COMPANY_B, personId: WORKER, decisionType: "recommend_worker", now: NOW },
      snapshot,
    );
    expect(contextB.reasons).toHaveLength(0);
    expect(contextB.explanation).toContain("Sin historial suficiente");
  });

  it("I. mobile y desktop producen exactamente el mismo contexto", () => {
    const signals = historySignals(4, "worked", "attendance");
    const build = () =>
      getDecisionContext(
        { companyId: COMPANY_A, personId: WORKER, decisionType: "recommend_worker", now: NOW },
        buildSnapshot({ companyId: COMPANY_A, signals, personId: WORKER, now: NOW }),
      );
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("sin historial no inventa: LOW y sin recomendación", () => {
    const context = getDecisionContext(
      { companyId: COMPANY_A, personId: WORKER, decisionType: "recommend_worker", now: NOW },
      buildSnapshot({ companyId: COMPANY_A, signals: [], personId: WORKER, now: NOW }),
    );
    const explained = explainRecommendation(context);
    expect(explained.label).toBe("LOW");
    expect(confidenceLabel(0.9)).toBe("HIGH");
    expect(explained.headline).toContain("Sin historial suficiente");
  });
});
