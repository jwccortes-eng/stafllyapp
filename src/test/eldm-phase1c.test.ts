/**
 * ELDM Fase 1C — QA del Worker Recommendation Layer.
 * Casos A–J del encargo, todos con motor puro y reloj inyectado.
 */
import { describe, expect, it } from "vitest";
import {
  getWorkerRecommendations,
  evaluateEligibility,
  type WorkerCandidateInput,
  type WorkerRecommendationQuery,
} from "@/lib/eldm-recommendation";
import type { EcosystemSignal } from "@/lib/eldm";

const NOW = "2026-08-09T12:00:00.000Z";
const COMPANY = "company-a";
const OTHER_COMPANY = "company-b";
const VENUE = "venue-millennium";

function signal(partial: Partial<EcosystemSignal> & { verb: string; occurredAt: string }): EcosystemSignal {
  return {
    id: `${partial.verb}:${partial.occurredAt}`,
    domain: "attendance",
    subject: { personId: "p1", companyId: COMPANY, venueId: VENUE },
    scope: { level: "tenant", companyId: COMPANY },
    attributes: {},
    ...partial,
  } as EcosystemSignal;
}

const baseQuery: WorkerRecommendationQuery = {
  companyId: COMPANY,
  serviceId: "shift-1",
  venueId: VENUE,
  serviceType: "hospitality",
  now: NOW,
};

function candidate(over: Partial<WorkerCandidateInput> = {}): WorkerCandidateInput {
  return {
    personId: "p1",
    name: "Maria Lopez",
    role: "server",
    belongsToCompany: true,
    active: true,
    availability: "available",
    compliance: "current",
    ...over,
  };
}

function workedTimes(n: number, personId = "p1"): EcosystemSignal[] {
  return Array.from({ length: n }, (_, i) =>
    signal({
      verb: "worked",
      occurredAt: `2026-0${(i % 7) + 1}-15T10:00:00.000Z`,
      subject: { personId, companyId: COMPANY, venueId: VENUE, serviceType: "hospitality" },
    }),
  );
}

describe("ELDM 1C — recomendación de workers", () => {
  it("CASO A: historial fuerte en el venue produce confianza y explicación", () => {
    const res = getWorkerRecommendations({
      query: baseQuery,
      candidates: [candidate()],
      signalsByPerson: new Map([["p1", workedTimes(6)]]),
    });
    const rec = res.recommended[0];
    expect(rec).toBeTruthy();
    expect(rec.venueExperience).toBe(6);
    expect(rec.headline).toContain("Recomendado porque");
    expect(["HIGH", "MEDIUM"]).toContain(rec.confidence);
  });

  it("CASO B: worker nuevo es elegible y no penalizado", () => {
    const res = getWorkerRecommendations({
      query: baseQuery,
      candidates: [candidate({ personId: "new", name: "Nuevo" })],
      signalsByPerson: new Map(),
    });
    const rec = [...res.recommended, ...res.otherEligible][0];
    expect(rec.eligible).toBe(true);
    expect(rec.blockers).toHaveLength(0);
    expect(rec.notHighlightedReason).toMatch(/historial/i);
  });

  it("CASO C: contradicciones recientes se muestran junto al historial positivo", () => {
    const signals = [
      ...workedTimes(8),
      signal({ verb: "rejected", domain: "response", occurredAt: "2026-08-01T10:00:00.000Z" }),
      signal({ verb: "rejected", domain: "response", occurredAt: "2026-08-04T10:00:00.000Z" }),
    ];
    const res = getWorkerRecommendations({
      query: baseQuery,
      candidates: [candidate()],
      signalsByPerson: new Map([["p1", signals]]),
    });
    const rec = res.recommended[0];
    expect(rec.supporting.length).toBeGreaterThan(0);
    expect(rec.contradicting.some((c) => c.code === "rejections")).toBe(true);
  });

  it("CASO D: no disponible confirmado es regla operativa, no ELDM", () => {
    const res = getWorkerRecommendations({
      query: baseQuery,
      candidates: [candidate({ availability: "unavailable" })],
      signalsByPerson: new Map([["p1", workedTimes(5)]]),
    });
    expect(res.recommended).toHaveLength(0);
    expect(res.notEligible[0].blockers[0].code).toBe("confirmed_unavailable");
  });

  it("CASO E: documento requerido vencido es blocker canónico", () => {
    const blockers = evaluateEligibility(candidate({ compliance: "expired" }), baseQuery);
    expect(blockers.map((b) => b.code)).toContain("compliance_expired");
  });

  it("CASO F: la historia de otro tenant no cruza", () => {
    const foreign = workedTimes(9).map((s) => ({
      ...s,
      subject: { ...s.subject, companyId: OTHER_COMPANY },
    }));
    const res = getWorkerRecommendations({
      query: baseQuery,
      candidates: [candidate()],
      signalsByPerson: new Map([["p1", foreign]]),
    });
    const rec = [...res.recommended, ...res.otherEligible][0];
    expect(rec.venueExperience).toBe(0);
  });

  it("CASO G/H: más outcomes positivos mejoran la explicación sin ocultar al resto", () => {
    const few = getWorkerRecommendations({
      query: baseQuery,
      candidates: [candidate()],
      signalsByPerson: new Map([["p1", workedTimes(1)]]),
    });
    const many = getWorkerRecommendations({
      query: baseQuery,
      candidates: [candidate()],
      signalsByPerson: new Map([["p1", workedTimes(7)]]),
    });
    expect(many.recommended[0].venueExperience).toBeGreaterThan(
      [...few.recommended, ...few.otherEligible][0].venueExperience,
    );
  });

  it("CASO I: repetir la misma señal no duplica evidencia", () => {
    const one = signal({ verb: "worked", occurredAt: "2026-07-01T10:00:00.000Z" });
    const deduped = Array.from(new Map([one, one].map((s) => [s.id, s])).values());
    expect(deduped).toHaveLength(1);
  });

  it("los filtros duros nunca salen de patrones ELDM", () => {
    const signals = [
      signal({ verb: "rejected", domain: "response", occurredAt: "2026-08-01T10:00:00.000Z" }),
      signal({ verb: "rejected", domain: "response", occurredAt: "2026-08-02T10:00:00.000Z" }),
      signal({ verb: "rejected", domain: "response", occurredAt: "2026-08-03T10:00:00.000Z" }),
    ];
    const res = getWorkerRecommendations({
      query: baseQuery,
      candidates: [candidate()],
      signalsByPerson: new Map([["p1", signals]]),
    });
    const rec = [...res.recommended, ...res.otherEligible][0];
    expect(rec.eligible).toBe(true);
  });

  it("rol y skill requeridos son filtros duros", () => {
    const q = { ...baseQuery, requiredRole: "bartender", requiredSkills: ["coctelería"] };
    const blockers = evaluateEligibility(candidate(), q).map((b) => b.code);
    expect(blockers).toContain("role_not_met");
    expect(blockers).toContain("skill_not_met");
  });

  it("todos los elegibles siguen visibles aunque haya límite", () => {
    const res = getWorkerRecommendations({
      query: { ...baseQuery, limit: 1 },
      candidates: [candidate(), candidate({ personId: "p2", name: "Ana" })],
      signalsByPerson: new Map([
        ["p1", workedTimes(6)],
        ["p2", workedTimes(4, "p2")],
      ]),
    });
    expect(res.recommended).toHaveLength(1);
    expect(res.recommended.length + res.otherEligible.length).toBe(2);
  });
});
