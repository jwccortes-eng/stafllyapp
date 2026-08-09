import { describe, expect, it } from "vitest";
import {
  buildCompanyPatterns,
  buildPersonPatterns,
  canRead,
  computeConfidence,
  getDecisionContext,
  isValidWorkOutcome,
  MIN_EVIDENCE_FOR_INFERENCE,
  recordAdminFeedback,
  recordOutcome,
  toConfirmedPreference,
  toInference,
  normalizeSignal,
  type EcosystemSignal,
} from "@/lib/eldm";

const NOW = "2026-08-09T00:00:00.000Z";
const COMPANY = "company-a";
const OTHER = "company-b";
const PERSON = "person-1";

function signal(verb: string, daysAgo: number, extra: Partial<EcosystemSignal> = {}): EcosystemSignal {
  const occurredAt = new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString();
  return {
    id: `${verb}-${daysAgo}`,
    domain: "assignment",
    verb,
    subject: { personId: PERSON, companyId: COMPANY, venueId: "venue-1" },
    scope: { level: "tenant", companyId: COMPANY },
    occurredAt,
    attributes: {},
    ...extra,
  };
}

describe("ELDM — confianza", () => {
  it("crece con evidencia y baja con contradicción", () => {
    const strong = computeConfidence({
      supporting: [signal("accepted", 1), signal("accepted", 5), signal("accepted", 9)],
      contradicting: [],
      tenantScope: "tenant",
      now: NOW,
    });
    const weak = computeConfidence({
      supporting: [signal("accepted", 1), signal("accepted", 5), signal("accepted", 9)],
      contradicting: [signal("rejected", 2), signal("no_show", 3)],
      tenantScope: "tenant",
      now: NOW,
    });
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
    expect(weak.contradictingEvidence).toBe(2);
    expect(strong.sourceDomains).toContain("assignment");
  });

  it("la evidencia antigua pesa menos que la reciente", () => {
    const recent = computeConfidence({
      supporting: [signal("accepted", 1), signal("accepted", 2), signal("accepted", 3)],
      contradicting: [signal("rejected", 500)],
      tenantScope: "tenant",
      now: NOW,
    });
    const old = computeConfidence({
      supporting: [signal("accepted", 500), signal("accepted", 501), signal("accepted", 502)],
      contradicting: [signal("rejected", 1)],
      tenantScope: "tenant",
      now: NOW,
    });
    expect(recent.confidence).toBeGreaterThan(old.confidence);
  });
});

describe("ELDM — tipos de conocimiento", () => {
  it("una observación aislada no se convierte en patrón", () => {
    const inference = toInference(
      {
        key: "accepts:service",
        subject: { personId: PERSON, companyId: COMPANY },
        scope: { level: "tenant", companyId: COMPANY },
        supporting: [signal("accepted", 1)],
        contradicting: [],
        now: NOW,
      },
      "Aceptó 1 de 1.",
    );
    expect(inference).toBeNull();
    expect(MIN_EVIDENCE_FOR_INFERENCE).toBeGreaterThan(1);
  });

  it("un patrón no es una preferencia confirmada", () => {
    const items = buildPersonPatterns({
      personId: PERSON,
      companyId: COMPANY,
      now: NOW,
      signals: [signal("accepted", 1), signal("accepted", 3), signal("accepted", 6)],
    });
    expect(items.some((i) => i.kind === "inference")).toBe(true);
    expect(items.some((i) => i.kind === "confirmed_preference")).toBe(false);
  });

  it("descarta atributos sensibles al normalizar señales", () => {
    const clean = normalizeSignal(
      signal("worked", 1, { attributes: { venue_type: "hall", hourly_rate: 25, phone: "555" } }),
    );
    expect(clean.attributes).toEqual({ venue_type: "hall" });
  });
});

describe("ELDM — fronteras de privacidad", () => {
  it("no cruza observaciones entre tenants", () => {
    expect(canRead({ level: "tenant", companyId: OTHER }, { companyId: COMPANY })).toBe(false);
    expect(canRead({ level: "tenant", companyId: COMPANY }, { companyId: COMPANY })).toBe(true);
  });

  it("una preferencia de persona requiere consentimiento en ambos lados", () => {
    const pref = toConfirmedPreference({
      personId: PERSON,
      key: "prefers:borough",
      value: "Brooklyn",
      explanation: "Prefiere trabajar en Brooklyn.",
      declaredAt: NOW,
      consented: true,
    });
    expect(canRead(pref.scope, { companyId: COMPANY })).toBe(false);
    expect(canRead(pref.scope, { companyId: COMPANY, personConsent: true })).toBe(true);
  });
});

describe("ELDM — getDecisionContext", () => {
  const memory = [
    ...buildPersonPatterns({
      personId: PERSON,
      companyId: COMPANY,
      now: NOW,
      signals: [
        signal("worked", 2),
        signal("worked", 12),
        signal("worked", 20),
        signal("accepted", 3),
        signal("accepted", 7),
        signal("accepted", 15),
        signal("rejected", 40),
      ],
    }),
    ...buildCompanyPatterns({
      companyId: OTHER,
      venueId: "venue-1",
      now: NOW,
      signals: [signal("staffed", 1, { scope: { level: "tenant", companyId: OTHER } })],
    }),
    toConfirmedPreference({
      personId: PERSON,
      key: "prefers:borough",
      value: "Brooklyn",
      explanation: "Prefiere trabajar en Brooklyn.",
      declaredAt: NOW,
      consented: true,
    }),
  ];

  it("explica cada razón y nunca devuelve un score suelto", () => {
    const ctx = getDecisionContext(
      {
        companyId: COMPANY,
        personId: PERSON,
        venueId: "venue-1",
        decisionType: "recommend_worker",
        personConsent: true,
        now: NOW,
      },
      { items: memory },
    );
    expect(ctx.reasons.length).toBeGreaterThan(0);
    for (const r of ctx.reasons) expect(r.text.trim().length).toBeGreaterThan(0);
    expect(ctx.explanation).toMatch(/Trabajó|Aceptó|Patrón|Señal/);
    expect(ctx.confirmedPreferences).toHaveLength(1);
  });

  it("no incluye memoria de otra compañía", () => {
    const ctx = getDecisionContext(
      { companyId: COMPANY, venueId: "venue-1", decisionType: "staffing_plan", now: NOW },
      { items: memory },
    );
    const foreign = [
      ...ctx.facts,
      ...ctx.historicalPatterns,
      ...ctx.inferredPatterns,
    ].filter((i) => i.scope.level === "tenant" && i.scope.companyId === OTHER);
    expect(foreign).toHaveLength(0);
  });

  it("sin historial no inventa contexto", () => {
    const ctx = getDecisionContext(
      { companyId: COMPANY, personId: "desconocido", decisionType: "recommend_worker", now: NOW },
      { items: memory },
    );
    expect(ctx.reasons).toHaveLength(0);
    expect(ctx.confidence).toBe(0);
    expect(ctx.explanation).toContain("Sin historial suficiente");
  });
});

describe("ELDM — feedback humano y outcome loop", () => {
  it("registra el rechazo como decisión con contexto, no como error", () => {
    const item = recordAdminFeedback({
      companyId: COMPANY,
      decisionType: "recommend_worker",
      verb: "rejected_recommendation",
      subject: { personId: PERSON, venueId: "venue-1" },
      occurredAt: NOW,
      recommendedRef: "person-1",
      chosenRef: "person-9",
    });
    expect(item.kind).toBe("decision");
    expect(item.explanation).not.toMatch(/error/i);
    expect(item.scope).toEqual({ level: "tenant", companyId: COMPANY });
  });

  it("el outcome real cierra el ciclo y las horas programadas no cuentan", () => {
    const outcome = recordOutcome({
      companyId: COMPANY,
      stage: "payroll_approved",
      verb: "payroll_approved",
      subject: { personId: PERSON },
      occurredAt: NOW,
      evidenceRef: "QK-001578",
    });
    expect(outcome.kind).toBe("outcome");
    expect(outcome.value).toBe("QK-001578");
    expect(isValidWorkOutcome("scheduled_hours")).toBe(false);
    expect(isValidWorkOutcome("time_entry_actual")).toBe(true);
  });
});
