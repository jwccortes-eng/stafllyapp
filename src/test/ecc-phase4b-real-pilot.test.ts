import { describe, it, expect } from "vitest";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import { CAPABILITY_CATALOG, CRITICAL_CAPABILITY_KEYS, LEGACY_MODULE_TO_CAPABILITY, validateCatalog } from "@/lib/ecc/capability-catalog";
import { QA_TESTING_COMPANY_ID, resolvePilotMode } from "@/lib/ecc/pilot";
import { reconcileCompany } from "@/lib/ecc/reconciliation";
import {
  ECC_PILOT_APPROVAL,
  LATENCY_THRESHOLD_MS,
  LIVE_PILOT_SURFACES,
  PILOT_REGISTRY_LIVE,
  PILOT_REGISTRY_ROLLED_BACK,
  activateEccPilot,
  rollbackEccPilot,
  runEccPilot,
  scoreConfidence,
} from "@/lib/ecc/pilot-live";

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

const run = (opts = {}) => runEccPilot(qaTesting(), { usage, at: AT, companyVersion: 2, currentVersion: 2, ...opts });

const other = (): EccReadModelInput => ({
  ...qaTesting(),
  company: { ...qaTesting().company, id: "00000000-0000-0000-0000-000000000001", name: "Quality Staff by Keury" },
});

describe("ECC Fase 4A.1 · capability completion (shared.invitations)", () => {
  it("QA1 · existe una sola vez en shared.* y mapea company_modules.invite", () => {
    const rows = CAPABILITY_CATALOG.filter(c => c.key.includes("invitation"));
    expect(rows).toHaveLength(1);
    const cap = rows[0];
    expect(cap.key).toBe("shared.invitations");
    expect(cap.product).toBe("shared");
    expect(cap.legacyModuleKey).toBe("invite");
    expect(LEGACY_MODULE_TO_CAPABILITY.invite).toBe("shared.invitations");
    expect(validateCatalog()).toEqual([]);
  });

  it("declara dependencias, permisos, límites, fuentes y versión", () => {
    const cap = CAPABILITY_CATALOG.find(c => c.key === "shared.invitations")!;
    expect(cap.dependencies).toEqual(["shared.identity.directory", "shared.comms.notifications", "shared.audit.trail"]);
    expect(cap.requiredPermission).toContain("has_company_role");
    expect(cap.limitKeys.length).toBeGreaterThan(0);
    expect(cap.legacySources.some(s => s.includes("employee_invitations"))).toBe(true);
    expect(cap.version).toBe("ecc.phase-4a.1");
    expect(cap.tier).toBe("core");
    // ECC declara disponibilidad comercial, no autorización.
    expect(cap.explanation).toContain("no concede permisos administrativos");
    expect(CRITICAL_CAPABILITY_KEYS).toContain("shared.invitations");
  });

  it("QA2 · readiness recalculada: sin gaps de capability y sin dependencias faltantes", () => {
    const rec = reconcileCompany(qaTesting(), AT);
    const inv = rec.criticalMatrix.find(m => m.alias === "shared.invitations")!;
    expect(inv.canonical).toBe("shared.invitations");
    expect(inv.status).toBe("match");
    expect(inv.missingDependencies).toEqual([]);
    expect(rec.criticalMatrix.every(m => !!m.canonical)).toBe(true);
    expect(rec.criticalMatrix.filter(m => m.status !== "match")).toHaveLength(0);
    expect(rec.contradictions).toEqual([]);
    expect(["READY", "CONDITIONAL"]).toContain(rec.readiness);
  });

  it("el mapping no modifica company_modules ni el input", () => {
    const input = qaTesting();
    const snapshot = JSON.stringify(input);
    reconcileCompany(input, AT);
    runEccPilot(input, { usage, at: AT, companyVersion: 2, currentVersion: 2 });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("ECC Fase 4B · piloto real controlado (QA Testing)", () => {
  it("QA3 · la activación exige aprobación humana y company_id exacto", () => {
    expect(activateEccPilot(ECC_PILOT_APPROVAL, 2, 2).ok).toBe(true);
    expect(activateEccPilot({ ...ECC_PILOT_APPROVAL, companyId: "otra" }, 2, 2).ok).toBe(false);
    expect(activateEccPilot({ ...ECC_PILOT_APPROVAL, approvedBy: "" }, 2, 2).ok).toBe(false);
    expect(PILOT_REGISTRY_LIVE).toHaveLength(1);
    expect(PILOT_REGISTRY_LIVE[0].companyId).toBe(QA_TESTING_COMPANY_ID);
  });

  it("QA4/QA5 · ECC gobierna sólo QA Testing; el resto sigue legacy_only", () => {
    const r = run();
    expect(r.flagEnabled).toBe(true);
    expect(r.mode).toBe("ecc_pilot");
    expect(r.eccGoverns).toBe(true);
    expect(r.decisions.every(d => d.governedBy === "ecc")).toBe(true);
    expect(r.autoRollback).toBeNull();

    const o = runEccPilot(other(), { usage, at: AT, companyVersion: 9, currentVersion: 9 });
    expect(o.mode).toBe("legacy_only");
    expect(o.flagEnabled).toBe(false);
    expect(o.decisions.every(d => d.governedBy === "legacy")).toBe(true);
    expect(resolvePilotMode("00000000-0000-0000-0000-000000000001", PILOT_REGISTRY_LIVE)).toBe("legacy_only");
  });

  it("QA6/QA7 · capability permitida y denegada quedan explicadas", () => {
    const r = run();
    const allowed = r.decisions.filter(d => d.effectiveDecision === true);
    expect(allowed.length).toBeGreaterThan(0);
    const denied = runEccPilot(
      { ...qaTesting(), modules: [] as never },
      { usage, at: AT, companyVersion: 2, currentVersion: 2 },
    );
    expect(denied.decisions.every(d => !!d.confidenceReason)).toBe(true);
    expect(denied.decisions.every(d => d.legacyDecision === d.eccDecision || d.fallback)).toBe(true);
  });

  it("QA8/QA9 · límite dentro y límite excedido", () => {
    expect(run().decisions.every(d => d.limitResult === "dentro")).toBe(true);
    const over = runEccPilot(qaTesting({ max_employees: 3 }), {
      usage: { ...usage, employees: 40 },
      at: AT,
      companyVersion: 2,
      currentVersion: 2,
    });
    expect(over.alerts.some(a => a.code === "limit_mismatch")).toBe(true);
  });

  it("QA10/QA11 · dependencia satisfecha y dependencia faltante", () => {
    const r = run();
    expect(r.decisions.every(d => d.dependencyResult === "satisfecha")).toBe(true);
    const low = scoreConfidence({
      mappingComplete: true,
      planVersionKnown: true,
      dependenciesResolved: false,
      noContradictions: true,
      legacyMatch: true,
      overrideKnown: true,
      sourceTrusted: true,
    });
    expect(low.level).toBe("LOW");
  });

  it("confidence explicable: HIGH, MEDIUM y LOW derivan de señales", () => {
    const base = {
      mappingComplete: true,
      planVersionKnown: true,
      dependenciesResolved: true,
      noContradictions: true,
      legacyMatch: true,
      overrideKnown: true,
      sourceTrusted: true,
    };
    expect(scoreConfidence(base).level).toBe("HIGH");
    expect(scoreConfidence({ ...base, legacyMatch: false }).level).toBe("MEDIUM");
    expect(scoreConfidence({ ...base, legacyMatch: false, overrideKnown: false }).level).toBe("LOW");
    expect(scoreConfidence({ ...base, mappingComplete: false }).failed.length).toBeGreaterThan(0);
    expect(run().confidenceCounts.LOW).toBe(0);
  });

  it("QA12/QA13 · el ECC no concede permisos: la autorización sigue en auth/RLS", () => {
    const cap = CAPABILITY_CATALOG.find(c => c.key === "shared.invitations")!;
    expect(cap.requiredPermission).toContain("admin");
    const r = run();
    expect(r.decisions.every(d => d.userId === "global_owner")).toBe(true);
    const asWorker = run({ userId: "worker-sin-permisos" });
    expect(asWorker.decisions.every(d => d.userId === "worker-sin-permisos")).toBe(true);
    // La disponibilidad comercial no cambia por usuario: el permiso lo decide RLS.
    expect(asWorker.decisions.map(d => d.eccDecision)).toEqual(r.decisions.map(d => d.eccDecision));
  });

  it("QA14 · cambio de compañía no arrastra la resolución del piloto", () => {
    const qa = run();
    const o = runEccPilot(other(), { usage, at: AT, companyVersion: 9, currentVersion: 9 });
    expect(new Set([...qa.decisions, ...o.decisions].map(d => d.companyId)).size).toBe(2);
    expect(o.eccGoverns).toBe(false);
    expect(qa.otherCompaniesTouched).toBe(0);
  });

  it("QA15/QA16 · superficies mobile y desktop cubiertas, sin flujos de pago", () => {
    const r = run();
    expect(r.decisions.length).toBe(LIVE_PILOT_SURFACES.length);
    for (const id of ["home", "services", "workers", "documents", "compliance", "portal", "timeclock", "payroll_review", "settings", "invitations", "command_center", "nav_mobile", "nav_desktop"]) {
      expect(r.decisions.some(d => d.surface === id)).toBe(true);
    }
    expect(r.decisions.some(d => d.device === "mobile" || d.device === "ambos")).toBe(true);
    expect(r.decisions.some(d => d.device === "desktop" || d.device === "ambos")).toBe(true);
    expect(r.decisions.some(d => /checkout|payment|billing/.test(d.route))).toBe(false);
  });

  it("QA17/QA18/QA22 · refresh, dos pestañas y reintento son idempotentes", () => {
    const a = run();
    const b = run();
    expect(a.decisions.map(d => d.correlationId)).toEqual(b.decisions.map(d => d.correlationId));
    expect(a.decisions.map(d => d.effectiveDecision)).toEqual(b.decisions.map(d => d.effectiveDecision));
    const tab2 = run({ runId: "run-2" });
    expect(tab2.decisions.map(d => d.effectiveDecision)).toEqual(a.decisions.map(d => d.effectiveDecision));
    expect(tab2.decisions[0].correlationId).not.toBe(a.decisions[0].correlationId);
  });

  it("QA19 · version drift fuerza legacy y dispara alerta", () => {
    const r = run({ currentVersion: 3 });
    expect(r.alerts.some(a => a.code === "version_drift")).toBe(true);
    expect(r.decisions.every(d => d.governedBy === "legacy" && d.fallback)).toBe(true);
    expect(r.autoRollback?.trigger).toBe("version_drift");
    expect(activateEccPilot(ECC_PILOT_APPROVAL, 2, 3).ok).toBe(false);
  });

  it("latencia fuera de umbral obliga fallback registrado, nunca silencioso", () => {
    const r = run({ latencyMs: LATENCY_THRESHOLD_MS + 1 });
    expect(r.decisions.every(d => d.fallback && d.governedBy === "legacy")).toBe(true);
    expect(r.decisions.every(d => !!d.fallbackReason)).toBe(true);
    expect(r.autoRollback?.trigger).toBe("latency_threshold");
  });

  it("QA20/QA21 · rollback manual y automático restauran legacy sin borrar nada", () => {
    const manual = rollbackEccPilot(QA_TESTING_COMPANY_ID, "manual");
    const again = rollbackEccPilot(QA_TESTING_COMPANY_ID, "manual", manual.to);
    for (const r of [manual, again]) {
      expect(r.to).toBe("rolled_back");
      expect(r.legacyRestored).toBe(true);
      expect(r.eccKeptInShadow).toBe(true);
      expect(r.auditPreserved).toBe(true);
      expect(r.observabilityPreserved).toBe(true);
      expect(r.planVersionsPreserved).toBe(true);
      expect(r.entitlementsPreserved).toBe(true);
      expect(r.otherCompaniesAffected).toBe(0);
      expect(r.idempotent).toBe(true);
      expect(r.registry[0].enabled).toBe(false);
    }
    const afterRollback = run({ registry: PILOT_REGISTRY_ROLLED_BACK });
    expect(afterRollback.mode).toBe("rolled_back");
    expect(afterRollback.decisions.every(d => d.governedBy === "legacy")).toBe(true);
    expect(rollbackEccPilot("00000000-0000-0000-0000-000000000001").detail).toContain("No-op");
  });

  it("QA23/QA24/QA25 · cero cross-tenant, cero payroll, cero billing", () => {
    const r = run();
    const codes = r.alerts.map(a => a.code);
    expect(codes).not.toContain("cross_tenant_resolution");
    expect(codes).not.toContain("unexpected_deny");
    expect(codes).not.toContain("unexpected_allow");
    expect(codes).not.toContain("unresolved_capability");
    expect(codes).not.toContain("dependency_mismatch");
    expect(r.precheck.usage.basePayRows).toBe(0);
    expect(r.precheck.usage.timeEntries).toBe(0);
    expect(r.precheck.usage.closedOrPaidPeriods).toBe(0);
    expect(r.criteria.filter(c => !c.passed)).toEqual([]);
  });

  it("cada decisión registra la observabilidad obligatoria completa", () => {
    for (const d of run().decisions) {
      expect(d.companyId).toBe(QA_TESTING_COMPANY_ID);
      expect(d.userId).toBeTruthy();
      expect(d.surface).toBeTruthy();
      expect(d.capability).toBeTruthy();
      expect(d.source).toBeTruthy();
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(d.confidence);
      expect(d.planVersion).toBeTruthy();
      expect(["satisfecha", "faltante"]).toContain(d.dependencyResult);
      expect(["dentro", "excedido", "n/d"]).toContain(d.limitResult);
      expect(typeof d.latencyMs).toBe("number");
      expect(d.timestamp).toBe(AT);
      expect(d.correlationId.startsWith("ecc4b:")).toBe(true);
    }
  });
});
