/**
 * ECC — Fase 4D. Graduación del piloto y contrato de adopción.
 * Modelo puro: valida la transición ecc_pilot → ecc_stable, la contención de
 * flota, los incidentes y el contrato de adopción futura. Sin escrituras.
 */
import { describe, it, expect } from "vitest";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import { QA_TESTING_COMPANY_ID, resolvePilotMode } from "@/lib/ecc/pilot";
import { runEccPilot, PILOT_REGISTRY_LIVE, PILOT_REGISTRY_ROLLED_BACK } from "@/lib/ecc/pilot-live";
import { buildObservationReport, type ObservationSession } from "@/lib/ecc/pilot-observation";
import {
  ADOPTION_CONTRACT,
  ECC_GRADUATION_APPROVAL,
  GRADUATION_STATEMENT,
  INCIDENT_POLICY,
  PILOT_REGISTRY_STABLE,
  assertFleetContainment,
  buildLegacyRetirementPlan,
  collectIncidents,
  evaluateAdoptionContract,
  evaluateGraduationChecks,
  graduateEccPilot,
  incidentRequiresRollback,
  resolveModeAfterTenantSwitch,
  rollbackEccStable,
} from "@/lib/ecc/graduation";

const AT = "2026-08-06T14:00:00.000Z";
const OTHER_COMPANIES = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
  "44444444-4444-4444-4444-444444444444",
  "55555555-5555-5555-5555-555555555555",
  "66666666-6666-6666-6666-666666666666",
  "77777777-7777-7777-7777-777777777777",
];

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
    companyVersion: 2,
    currentVersion: 2,
    latencyMs: spec.latencyMs ?? 12,
    runId: spec.id,
    registry: spec.registry ?? PILOT_REGISTRY_LIVE,
  }),
});

const WINDOW: ObservationSession[] = [
  session({ id: "s1", userId: "owner", device: "desktop", durationMinutes: 20, events: ["session_start"], latencyMs: 9 }),
  session({ id: "s2", userId: "owner", device: "desktop", durationMinutes: 55, events: ["session_start", "long_session", "refresh"], latencyMs: 14 }),
  session({ id: "s3", userId: "owner", device: "mobile", durationMinutes: 12, events: ["session_start", "company_switch"], latencyMs: 18 }),
  session({ id: "s4", userId: "qa_admin", device: "mobile", durationMinutes: 30, events: ["session_start", "second_tab"], latencyMs: 22 }),
  session({ id: "s5", userId: "qa_admin", device: "desktop", durationMinutes: 25, events: ["session_start", "refresh", "second_tab"], latencyMs: 11 }),
  session({ id: "s6", userId: "qa_admin", device: "mobile", durationMinutes: 18, events: ["session_start"], latencyMs: 16 }),
];

const observation = buildObservationReport(WINDOW, { generatedAt: AT });
const pilotRun = WINDOW[0].run;
const evidence = { phase4b: pilotRun, phase4c: observation };

const graduate = (over: Partial<{ companyId: string; expected: number | null; current: number | null; by: string; role: string; reason: string; registry: typeof PILOT_REGISTRY_LIVE }> = {}) =>
  graduateEccPilot(
    over.companyId ?? QA_TESTING_COMPANY_ID,
    over.expected === undefined ? 2 : over.expected,
    over.by ?? ECC_GRADUATION_APPROVAL.approvedBy,
    over.reason ?? ECC_GRADUATION_APPROVAL.reason,
    {
      approverRole: over.role ?? "global_owner",
      currentVersion: over.current === undefined ? 2 : over.current,
      registry: over.registry ?? PILOT_REGISTRY_LIVE,
      evidence,
      at: AT,
    },
  );

describe("ECC Fase 4D · graduación", () => {
  it("QA1 · revalida 4B y 4C antes de graduar", () => {
    const checks = evaluateGraduationChecks(evidence);
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.filter(c => !c.passed)).toEqual([]);
  });

  it("QA2 · QA Testing pasa a ecc_stable con auditoría completa", () => {
    const res = graduate();
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("ecc_stable");
    expect(res.registry).toEqual(PILOT_REGISTRY_STABLE);
    expect(res.audit).toMatchObject({
      companyId: QA_TESTING_COMPANY_ID,
      fromMode: "ecc_pilot",
      toMode: "ecc_stable",
      approvedBy: "global_owner",
      otherCompaniesAffected: 0,
    });
    expect(res.legacyRetired).toBe(false);
    expect(res.rollbackAvailable).toBe(true);
  });

  it("QA3 · la graduación es idempotente", () => {
    const first = graduate();
    const second = graduate({ registry: first.registry as typeof PILOT_REGISTRY_LIVE });
    expect(second.ok).toBe(true);
    expect(second.alreadyGraduated).toBe(true);
    expect(second.mode).toBe("ecc_stable");
    expect(second.registry).toEqual(first.registry);
  });

  it("QA4 · version drift bloquea la graduación", () => {
    const res = graduate({ expected: 2, current: 3 });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("Version drift");
    expect(res.mode).toBe("ecc_pilot");
  });

  it("QA5 · usuario sin permiso bloqueado", () => {
    expect(graduate({ role: "manager" }).ok).toBe(false);
    expect(graduate({ by: "", role: "global_owner" }).ok).toBe(false);
    expect(graduate({ reason: "  " }).ok).toBe(false);
  });

  it("QA6 · sin evidencia de observación no hay graduación", () => {
    const res = graduateEccPilot(QA_TESTING_COMPANY_ID, 2, "global_owner", "sin evidencia", {
      approverRole: "global_owner",
      currentVersion: 2,
      registry: PILOT_REGISTRY_LIVE,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("evidencia");
  });

  it("QA7 · observación no estable bloquea la graduación", () => {
    const short = buildObservationReport(WINDOW.slice(0, 2), { generatedAt: AT });
    const res = graduateEccPilot(QA_TESTING_COMPANY_ID, 2, "global_owner", "intento prematuro", {
      approverRole: "global_owner",
      currentVersion: 2,
      registry: PILOT_REGISTRY_LIVE,
      evidence: { phase4b: pilotRun, phase4c: short },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("Criterios de observación");
  });
});

describe("ECC Fase 4D · protección de flota", () => {
  it("QA8 · ninguna otra compañía puede graduar y ninguna cambia de modo", () => {
    for (const id of OTHER_COMPANIES) {
      expect(graduate({ companyId: id }).ok).toBe(false);
      expect(resolvePilotMode(id, PILOT_REGISTRY_STABLE)).toBe("legacy_only");
    }
  });

  it("QA9 · company_id obligatorio y fail-closed ante compañía desconocida", () => {
    expect(graduate({ companyId: "" }).ok).toBe(false);
    expect(resolveModeAfterTenantSwitch(null)).toBe("legacy_only");
    expect(resolveModeAfterTenantSwitch("desconocida")).toBe("legacy_only");
  });

  it("QA10 · sólo QA Testing en ecc_stable, sin bandera global", () => {
    const fleet = assertFleetContainment([QA_TESTING_COMPANY_ID, ...OTHER_COMPANIES]);
    expect(fleet.containment).toBe(true);
    expect(fleet.stableCompanies).toEqual([QA_TESTING_COMPANY_ID]);
    expect(fleet.legacyOnlyCompanies).toHaveLength(7);
    expect(fleet.globalFlagExists).toBe(false);
    expect(fleet.companyIdRequired).toBe(true);
    expect(fleet.failClosedOnUnknownCompany).toBe(true);
    expect(fleet.tenantSwitchInheritsMode).toBe(false);
  });

  it("QA11 · cambio de tenant no hereda el modo anterior", () => {
    expect(resolveModeAfterTenantSwitch(QA_TESTING_COMPANY_ID)).toBe("ecc_stable");
    expect(resolveModeAfterTenantSwitch(OTHER_COMPANIES[0])).toBe("legacy_only");
  });
});

describe("ECC Fase 4D · ECC estable en operación", () => {
  const stableRun = (over: Partial<SessionSpec> = {}) =>
    runEccPilot(over.input ?? qaTesting(), {
      usage,
      at: AT,
      userId: over.userId ?? "owner",
      companyVersion: 2,
      currentVersion: 2,
      latencyMs: over.latencyMs ?? 12,
      runId: over.id ?? "stable",
      registry: PILOT_REGISTRY_STABLE,
    });

  it("QA12 · ECC gobierna y legacy sigue en sombra (mobile y desktop)", () => {
    const run = stableRun();
    expect(run.mode).toBe("ecc_stable");
    expect(run.eccGoverns).toBe(true);
    expect(run.decisions.every(d => d.governedBy === "ecc")).toBe(true);
    expect(run.decisions.every(d => d.legacyDecision !== null)).toBe(true);
    expect(run.decisions.some(d => d.device === "mobile")).toBe(true);
    expect(run.decisions.some(d => d.device === "desktop")).toBe(true);
  });

  it("QA13 · refresh y dos pestañas producen la misma decisión (correlación estable)", () => {
    const a = stableRun({ id: "tab-1" });
    const b = stableRun({ id: "tab-1" });
    expect(b.decisions.map(d => d.correlationId)).toEqual(a.decisions.map(d => d.correlationId));
    expect(b.decisions.map(d => d.effectiveDecision)).toEqual(a.decisions.map(d => d.effectiveDecision));
  });

  it("QA14 · sin incidentes en operación normal", () => {
    const incidents = collectIncidents(stableRun(), AT);
    expect(incidents).toEqual([]);
    expect(incidentRequiresRollback(incidents)).toBe(false);
  });

  it("QA15 · mismatch simulado genera incidente completo, no silencio", () => {
    const drifted = stableRun({ input: qaTesting({ access_state: "suspended", status: "suspended" }) });
    const incidents = collectIncidents(drifted, AT);
    expect(incidents.length).toBeGreaterThan(0);
    for (const i of incidents) {
      expect(i.companyId).toBe(QA_TESTING_COMPANY_ID);
      expect(i.severity).toBeTruthy();
      expect(i.surface).toBeTruthy();
      expect(i.actor).toBeTruthy();
      expect(i.correlationId).toBeTruthy();
      expect(i.owner).toBeTruthy();
      expect(i.automaticAction).toBeTruthy();
    }
    expect(incidentRequiresRollback(incidents)).toBe(true);
  });

  it("QA16 · el catálogo de incidentes cubre los nueve códigos exigidos", () => {
    expect(Object.keys(INCIDENT_POLICY).sort()).toEqual(
      [
        "cross_tenant", "dependency_missing", "legacy_mismatch", "limit_mismatch",
        "low_confidence", "resolver_error", "unexpected_allow", "unexpected_deny", "version_drift",
      ].sort(),
    );
  });

  it("QA17 · rollback desde estable y recuperación posterior", () => {
    const rb = rollbackEccStable(QA_TESTING_COMPANY_ID, "legacy_mismatch" as never);
    expect(rb.from).toBe("ecc_stable");
    expect(rb.to).toBe("rolled_back");
    expect(rb.legacyRestored).toBe(true);
    expect(rb.auditPreserved).toBe(true);
    expect(rb.observabilityPreserved).toBe(true);
    expect(rb.otherCompaniesAffected).toBe(0);
    expect(rollbackEccStable(QA_TESTING_COMPANY_ID).idempotent).toBe(true);

    // Recuperación: desde rolled_back no se gradúa directamente; hay que repetir piloto.
    const retry = graduate({ registry: PILOT_REGISTRY_ROLLED_BACK });
    expect(retry.ok).toBe(false);
    expect(retry.reason).toContain("graduación sólo procede desde un piloto activo");
  });

  it("QA18 · cero impacto en payroll y billing", () => {
    const run = stableRun();
    expect(run.otherCompaniesTouched).toBe(0);
    const serialized = JSON.stringify(run) + JSON.stringify(PILOT_REGISTRY_STABLE);
    for (const forbidden of ["stripe", "subscription_id", "invoice", "pay_period", "time_entries"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("ECC Fase 4D · contrato de adopción y retiro de legacy", () => {
  const fullState = Object.fromEntries(ADOPTION_CONTRACT.map(p => [p.key, true]));

  it("QA19 · contrato completo habilita el ciclo", () => {
    const ev = evaluateAdoptionContract("nueva-compania", fullState);
    expect(ev.eligible).toBe(true);
    expect(ev.blockedAt).toBeNull();
    expect(ev.phases.every(p => p.met)).toBe(true);
  });

  it("QA20 · no se pueden saltar fases", () => {
    const ev = evaluateAdoptionContract("nueva-compania", { ...fullState, rollback_tested: false });
    expect(ev.eligible).toBe(false);
    expect(ev.blockedAt?.key).toBe("rollback_tested");
    expect(ev.phases.filter(p => p.order > 7).every(p => !p.met)).toBe(true);
    expect(ADOPTION_CONTRACT.every(p => p.skippable === false)).toBe(true);
  });

  it("QA21 · el retiro de legacy queda diseñado pero no ejecutado", () => {
    const plan = buildLegacyRetirementPlan();
    expect(plan.executed).toBe(false);
    expect(plan.steps.map(s => s.source)).toEqual(
      expect.arrayContaining(["useSubscription", "ModuleGate", "plan_code", "company_modules", "fallback legacy", "observabilidad dual", "rollback window"]),
    );
    expect(plan.preconditions.length).toBeGreaterThan(0);
    expect(plan.rollbackWindowDays).toBeGreaterThan(0);
  });

  it("QA22 · declaración final de la fase", () => {
    expect(GRADUATION_STATEMENT).toContain("QA Testing opera de forma estable bajo ECC");
  });
});
