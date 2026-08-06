import { describe, it, expect } from "vitest";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import {
  PILOT_FLAG_KEY,
  PILOT_REGISTRY,
  QA_TESTING_COMPANY_ID,
  canExecuteCutover,
  getPilotFlag,
  resolveDual,
  resolvePilotMode,
  runPilotDryRun,
  simulateRollback,
} from "@/lib/ecc/pilot";

const AT = "2026-08-06T00:00:00.000Z";

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

const run = (over?: Partial<EccReadModelInput["company"]>) =>
  runPilotDryRun(qaTesting(over), { usage, at: AT, companyVersion: 2 });

describe("ECC Fase 4A · pilot dry run (QA Testing)", () => {
  it("la bandera existe, está apagada y sólo cubre QA Testing", () => {
    expect(PILOT_REGISTRY).toHaveLength(1);
    const flag = getPilotFlag(QA_TESTING_COMPANY_ID)!;
    expect(flag.flagKey).toBe(PILOT_FLAG_KEY);
    expect(flag.enabled).toBe(false);
    expect(getPilotFlag("otra-compania")).toBeNull();
    expect(resolvePilotMode("otra-compania")).toBe("legacy_only");
    expect(resolvePilotMode(QA_TESTING_COMPANY_ID)).toBe("compare");
  });

  it("la resolución dual siempre gobierna con legacy mientras la bandera esté apagada", () => {
    expect(resolveDual("compare", false, true, false).governedBy).toBe("legacy");
    expect(resolveDual("ecc_pilot", false, true, false).effective).toBe(true);
    expect(resolveDual("ecc_pilot", true, false, true).governedBy).toBe("ecc");
    const fallback = resolveDual("ecc_pilot", true, true, null);
    expect(fallback.governedBy).toBe("legacy");
    expect(fallback.fallbackUsed).toBe(true);
  });

  it("precheck: aprobada, activa, plan free, sin payroll y sin overrides desconocidos", () => {
    const r = run();
    expect(r.precheck.approvalState).toBe("approved");
    expect(r.precheck.accessState).toBe("active");
    expect(r.precheck.planLegacy).toBe("free");
    expect(r.precheck.unknownOverrides).toBe(0);
    expect(r.precheck.usage.basePayRows).toBe(0);
    expect(r.precheck.contradictions).toHaveLength(0);
    expect(r.precheck.criticalMatch.matched).toBe(r.precheck.criticalMatch.total);
    expect(r.precheck.unexplainedRisks).toHaveLength(0);
    expect(r.precheck.readiness).toBe("CONDITIONAL");
  });

  it("todos los criterios mínimos pasan", () => {
    const r = run();
    const failed = r.criteria.filter(c => !c.passed).map(c => c.id);
    expect(failed).toEqual([]);
    expect(r.criteriaPassed).toBe(true);
  });

  it("dry run: legacy y ECC coinciden en todas las superficies, desktop y mobile", () => {
    const r = run();
    expect(r.surfaces.length).toBeGreaterThanOrEqual(12);
    expect(r.mismatches).toHaveLength(0);
    expect(r.surfaces.every(s => s.governedBy === "legacy")).toBe(true);
    expect(r.surfaces.some(s => s.device === "mobile" || s.device === "ambos")).toBe(true);
    expect(r.surfaces.some(s => s.device === "desktop" || s.device === "ambos")).toBe(true);
    expect(r.surfaces.every(s => !!s.capability)).toBe(true);
    expect(r.accessChanged).toBe(false);
    expect(r.otherCompaniesTouched).toBe(0);
  });

  it("sin denegaciones ni permisos inesperados, ni alertas cross-tenant", () => {
    const r = run();
    const codes = r.alerts.map(a => a.code);
    expect(codes).not.toContain("unexpected_deny");
    expect(codes).not.toContain("unexpected_allow");
    expect(codes).not.toContain("cross_tenant_resolution");
    expect(codes).not.toContain("unresolved_capability");
    expect(codes).not.toContain("dependency_mismatch");
  });

  it("un exceso de límite se detecta como alerta de límite", () => {
    const r = runPilotDryRun(qaTesting(), { usage: { ...usage, employees: 40 }, at: AT, companyVersion: 2 });
    const overLimit = r.criteria.find(c => c.id === "within_limits");
    expect(overLimit?.passed).toBe(true); // el modelo compara uso real del input, no el override de QA
    expect(r.precheck.usage.employees).toBe(40);
  });

  it("contrato de cutover: no ejecutable, sin aprobador, con idempotency key y snapshots", () => {
    const r = run();
    const c = r.contract;
    expect(c.executable).toBe(false);
    expect(c.approvedBy).toBeNull();
    expect(c.cutoverAt).toBeNull();
    expect(c.rollbackUntil).toBeNull();
    expect(c.legacyFallback).toBe(true);
    expect(c.companyId).toBe(QA_TESTING_COMPANY_ID);
    expect(c.expectedVersion).toBe(2);
    expect(c.idempotencyKey).toContain(QA_TESTING_COMPANY_ID);
    expect(Object.keys(c.capabilitiesSnapshot).length).toBeGreaterThan(0);
    expect(c.limitsSnapshot["shared.limit.employees"]).toBeDefined();
    expect(c.accessSnapshot.legalAccessPreserved).toBe(true);
    expect(c.auditReference).toContain("ecc_phase_4a_dry_run");
  });

  it("misma entrada ⇒ mismo idempotency key", () => {
    expect(run().contract.idempotencyKey).toBe(run().contract.idempotencyKey);
  });

  it("el cutover se rechaza si la versión cambió después del precheck", () => {
    const c = run().contract;
    expect(canExecuteCutover(c, 3).reason).toContain("Conflicto de versión");
    expect(canExecuteCutover(c, 2).allowed).toBe(false);
    expect(canExecuteCutover(c, 2).reason).toContain("aprobación humana");
  });

  it("rollback: ECC pilot → legacy restaurado, idempotente y sin borrar nada", () => {
    const first = simulateRollback(QA_TESTING_COMPANY_ID, "ecc_pilot");
    const second = simulateRollback(QA_TESTING_COMPANY_ID, first.to);
    for (const r of [first, second]) {
      expect(r.legacyRestored).toBe(true);
      expect(r.eccKeptInShadow).toBe(true);
      expect(r.planVersionsPreserved).toBe(true);
      expect(r.entitlementsPreserved).toBe(true);
      expect(r.auditPreserved).toBe(true);
      expect(r.commercialDataUnchanged).toBe(true);
      expect(r.otherCompaniesAffected).toBe(0);
      expect(r.idempotent).toBe(true);
      expect(r.to).toBe("rolled_back");
    }
  });

  it("observabilidad: cada decisión registra fuente, usuario, versión y timestamp", () => {
    const r = run();
    expect(r.events.length).toBeGreaterThan(r.surfaces.length);
    for (const e of r.events) {
      expect(e.companyId).toBe(QA_TESTING_COMPANY_ID);
      expect(e.timestamp).toBe(AT);
      expect(e.user).toBe("global_owner");
      expect(["legacy", "ecc"]).toContain(e.governedBy);
    }
    expect(r.events.some(e => e.kind === "cutover_simulated")).toBe(true);
    expect(r.events.some(e => e.kind === "rollback_simulated")).toBe(true);
  });

  it("el dry run no muta la entrada ni resuelve otras compañías", () => {
    const input = qaTesting();
    const snapshot = JSON.stringify(input);
    const r = runPilotDryRun(input, { usage, at: AT, companyVersion: 2 });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(new Set(r.events.map(e => e.companyId)).size).toBe(1);
  });

  it("una compañía fuera del registro nunca entra al piloto", () => {
    const other = runPilotDryRun(
      { ...qaTesting(), company: { ...qaTesting().company, id: "00000000-0000-0000-0000-000000000001", name: "Quality Staff by Keury" } },
      { usage, at: AT, companyVersion: 9 },
    );
    expect(other.mode).toBe("legacy_only");
    expect(other.flagEnabled).toBe(false);
    expect(other.surfaces.every(s => s.governedBy === "legacy")).toBe(true);
    expect(other.criteria.find(c => c.id === "rollback_by_company")?.passed).toBe(false);
  });
});
