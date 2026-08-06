/**
 * ECC — Fase 4C. Observación controlada del piloto (sólo QA Testing).
 * Modelo puro: agrega decisiones ya producidas por la Fase 4B y valida
 * ventana de actividad real, criterios de salida y criterios de rollback.
 */
import { describe, it, expect } from "vitest";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import { QA_TESTING_COMPANY_ID } from "@/lib/ecc/pilot";
import { runEccPilot, LATENCY_THRESHOLD_MS, PILOT_REGISTRY_LIVE } from "@/lib/ecc/pilot-live";
import {
  OBSERVATION_STABLE_STATEMENT,
  WINDOW_MINIMUMS,
  buildObservationReport,
  computeObservationMetrics,
  type ObservationSession,
} from "@/lib/ecc/pilot-observation";

const AT = "2026-08-06T05:00:00.000Z";

const QA_MODULES = [
  "announcements", "chat", "clients", "concepts", "employees", "import", "invite",
  "locations", "movements", "periods", "reports", "shifts", "summary", "timeclock",
].map(module => ({ module, is_active: true }));

const qaTesting = (over: Partial<EccReadModelInput["company"]> = {}): EccReadModelInput => ({
  company: {
    id: QA_TESTING_COMPANY_ID,
    name: "QA Testing",
    slug: "qa-testing",
    is_active: true,
    status: "active",
    approval_state: "approved",
    access_state: "active",
    commercial_state: "manual",
    plan_code: "free",
    plan_status: "active",
    billing_status: "none",
    paid_features_enabled: false,
    max_employees: 10,
    max_admins: 2,
    version: 2,
    ...over,
  },
  modules: QA_MODULES as never,
  subscription: { plan: "free", status: "active", stripe_customer_id: null, stripe_subscription_id: null },
  userCount: 1,
  employeeCount: 5,
  generatedAt: AT,
});

const usage = {
  payPeriods: 0,
  closedOrPaidPeriods: 0,
  basePayRows: 0,
  shifts: 0,
  timeEntries: 0,
  documents: 0,
  users: 1,
  employees: 5,
  activityEvents: 50,
};

interface SessionSpec {
  id: string;
  userId: string;
  device: "mobile" | "desktop";
  durationMinutes: number;
  events: ObservationSession["events"];
  latencyMs?: number;
  input?: EccReadModelInput;
  registry?: typeof PILOT_REGISTRY_LIVE;
  companyVersion?: number;
  currentVersion?: number;
}

const session = (spec: SessionSpec): ObservationSession => ({
  id: spec.id,
  userId: spec.userId,
  device: spec.device,
  startedAt: AT,
  durationMinutes: spec.durationMinutes,
  events: spec.events,
  run: runEccPilot(spec.input ?? qaTesting(), {
    usage,
    at: AT,
    userId: spec.userId,
    companyVersion: spec.companyVersion ?? 2,
    currentVersion: spec.currentVersion ?? 2,
    latencyMs: spec.latencyMs ?? 12,
    runId: spec.id,
    registry: spec.registry,
  }),
});

/** Ventana real: 6 sesiones, 2 usuarios, mobile + desktop, switch, refresh, larga. */
const WINDOW: ObservationSession[] = [
  session({ id: "s1", userId: "owner", device: "desktop", durationMinutes: 20, events: ["session_start"], latencyMs: 9 }),
  session({ id: "s2", userId: "owner", device: "desktop", durationMinutes: 55, events: ["session_start", "long_session", "refresh"], latencyMs: 14 }),
  session({ id: "s3", userId: "owner", device: "mobile", durationMinutes: 12, events: ["session_start", "company_switch"], latencyMs: 18 }),
  session({ id: "s4", userId: "qa_admin", device: "mobile", durationMinutes: 30, events: ["session_start", "second_tab"], latencyMs: 22 }),
  session({ id: "s5", userId: "qa_admin", device: "desktop", durationMinutes: 25, events: ["session_start", "refresh", "second_tab"], latencyMs: 11 }),
  session({ id: "s6", userId: "qa_admin", device: "mobile", durationMinutes: 18, events: ["session_start"], latencyMs: 16 }),
];

const report = buildObservationReport(WINDOW, { generatedAt: AT });

describe("ECC Fase 4C · ventana de observación", () => {
  it("QA1 · sólo observa QA Testing y ninguna otra compañía", () => {
    const companies = new Set(WINDOW.flatMap(s => s.run.decisions.map(d => d.companyId)));
    expect([...companies]).toEqual([QA_TESTING_COMPANY_ID]);
    expect(report.metrics.crossTenantResolutions).toBe(0);
    expect(report.otherCompaniesTouched).toBe(0);
  });

  it("QA2 · la ventana exige actividad real, no tiempo", () => {
    expect(report.metrics.totalDecisions).toBeGreaterThanOrEqual(WINDOW_MINIMUMS.decisions);
    expect(report.window.every(w => w.met)).toBe(true);
    expect(report.windowComplete).toBe(true);
  });

  it("QA3 · una ventana corta no se cierra aunque el reporte se genere más tarde", () => {
    const short = buildObservationReport(WINDOW.slice(0, 2), { generatedAt: AT });
    expect(short.windowComplete).toBe(false);
    expect(short.verdict).toBe("window_open");
    expect(short.statement).toContain("No se cierra por tiempo transcurrido");
  });

  it("QA4 · métricas completas y coherentes", () => {
    const m = report.metrics;
    expect(m.legacyMatches).toBe(m.totalDecisions);
    expect(m.mismatches).toBe(0);
    expect(m.unexpectedAllow + m.unexpectedDeny).toBe(0);
    expect(m.unresolvedCapability).toBe(0);
    expect(m.dependencyMismatch).toBe(0);
    expect(m.versionDrift).toBe(0);
    expect(m.lowConfidence).toBe(0);
    expect(m.resolverErrors).toBe(0);
    expect(m.fallbacks).toBe(0);
    expect(m.rollbacks).toBe(0);
    expect(m.usersAffected).toEqual(["owner", "qa_admin"]);
    expect(m.surfacesCovered.length).toBeGreaterThan(0);
  });

  it("QA5 · latencia p50/p95 dentro del umbral", () => {
    expect(report.metrics.latencyP50).toBeLessThanOrEqual(LATENCY_THRESHOLD_MS);
    expect(report.metrics.latencyP95).toBeLessThanOrEqual(LATENCY_THRESHOLD_MS);
  });

  it("QA6 · confidence HIGH en todas las decisiones críticas", () => {
    expect(report.metrics.criticalDecisions).toBeGreaterThan(0);
    expect(report.metrics.criticalHighConfidence).toBe(report.metrics.criticalDecisions);
  });

  it("QA7 · criterios de salida en verde y veredicto estable", () => {
    expect(report.exitCriteria.filter(c => !c.passed)).toEqual([]);
    expect(report.rollbackSignals.filter(s => s.fired)).toEqual([]);
    expect(report.rollbackRequired).toBe(false);
    expect(report.rollback).toBeNull();
    expect(report.verdict).toBe("stable");
    expect(report.statement).toBe(OBSERVATION_STABLE_STATEMENT);
  });
});

describe("ECC Fase 4C · criterios de rollback", () => {
  it("QA8 · latencia degradada exige rollback", () => {
    const slow = buildObservationReport(
      WINDOW.map((s, i) => (i === 0 ? session({ id: "slow", userId: "owner", device: "desktop", durationMinutes: 20, events: ["session_start"], latencyMs: 900 }) : s)),
      { generatedAt: AT },
    );
    expect(slow.rollbackRequired).toBe(true);
    expect(slow.verdict).toBe("rollback");
    expect(slow.rollback?.trigger).toBe("latency_threshold");
  });

  it("QA9 · deriva de versión exige rollback y preserva observabilidad", () => {
    const drift = buildObservationReport(
      [
        session({ id: "drift", userId: "owner", device: "desktop", durationMinutes: 20, events: ["session_start"], companyVersion: 2, currentVersion: 3 }),
        ...WINDOW.slice(1),
      ],
      { generatedAt: AT },
    );
    expect(drift.metrics.versionDrift).toBeGreaterThan(0);
    expect(drift.verdict).toBe("rollback");
    expect(drift.rollback?.observabilityPreserved).toBe(true);
  });

  it("QA10 · errores del resolver disparan rollback", () => {
    const erroring = [...WINDOW];
    erroring[3] = { ...erroring[3], events: [...erroring[3].events, "resolver_error"] };
    const r = buildObservationReport(erroring, { generatedAt: AT });
    expect(r.metrics.resolverErrors).toBe(1);
    expect(r.verdict).toBe("rollback");
  });

  it("QA11 · una compañía distinta nunca entra a la ventana", () => {
    const foreign = qaTesting();
    const other: EccReadModelInput = { ...foreign, company: { ...foreign.company, id: "00000000-0000-0000-0000-000000000001", name: "Otra" } };
    const m = computeObservationMetrics([
      session({ id: "x", userId: "owner", device: "desktop", durationMinutes: 10, events: ["session_start"], input: other }),
    ]);
    expect(m.crossTenantResolutions).toBeGreaterThan(0);
  });
});
