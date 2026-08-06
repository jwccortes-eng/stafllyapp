import { describe, it, expect } from "vitest";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import {
  ROLLBACK_PLAN,
  SHADOW_PERIOD_POLICY,
  buildCutoverContractDraft,
  evaluateShadowPeriod,
  readinessVisibility,
  reconcileAccounts,
  reconcileCompany,
  summarizeFleetReadiness,
} from "@/lib/ecc/reconciliation";

const AT = "2026-08-01T00:00:00.000Z";

const base = (over: Partial<EccReadModelInput["company"]> = {}, rest: Partial<EccReadModelInput> = {}): EccReadModelInput => ({
  company: {
    id: "c1",
    name: "Quality Staff",
    slug: "quality-staff",
    is_active: true,
    status: "active",
    approval_state: "approved",
    access_state: "active",
    commercial_state: "manual",
    plan_code: "paid_manual",
    plan_status: "active",
    billing_status: "manual",
    paid_features_enabled: false,
    max_employees: 999,
    max_admins: 10,
    version: 4,
    ...over,
  },
  modules: [],
  subscription: null,
  userCount: 3,
  employeeCount: 20,
  generatedAt: AT,
  ...rest,
});

describe("ECC Fase 3 — reconciliación y readiness", () => {
  it("QA1 · company con match total no tiene mismatch crítico de capacidad mapeada", () => {
    const rec = reconcileCompany(base(), AT);
    const mismatched = rec.criticalMatrix.filter(m => m.canonical && m.status !== "match");
    expect(mismatched).toHaveLength(0);
    expect(rec.readiness).toBe("NOT_READY"); // por capacidades críticas aún sin catálogo
    expect(rec.blockers.join(" ")).toContain("sin mapeo canónico");
  });

  it("QA2 · company con override legacy queda inventariada y clasificada", () => {
    const rec = reconcileCompany(
      base({ plan_code: "free", max_employees: 10, max_admins: 2 }, ), AT,
    );
    const withModule = reconcileCompany(
      base({ plan_code: "free", max_employees: 10, max_admins: 2 }, { modules: [{ module: "payroll", is_active: true } as never] }),
      AT,
    );
    expect(withModule.overrides.length).toBeGreaterThanOrEqual(rec.overrides.length);
    for (const o of withModule.overrides) {
      expect(["permanente", "temporal", "comercial", "soporte", "migracion", "desconocido"]).toContain(o.classification);
    }
  });

  it("QA3 · limit mismatch con uso por encima del tope se marca como riesgo crítico", () => {
    const rec = reconcileCompany(base({ plan_code: "free", max_employees: 10, max_admins: 2 }, ), AT);
    const employees = rec.limits.find(l => l.limitKey.includes("employees"));
    expect(employees?.usage).toBe(20);
    expect(employees?.overLimitRisk).toBe(true);
    expect(rec.readiness === "NOT_READY" || rec.readiness === "BLOCKED").toBe(true);
    expect(rec.findings.some(f => f.scope === "limit" && f.risk === "alto")).toBe(true);
  });

  it("QA4 · unknown mapping se clasifica como A y propone crear mapping", () => {
    const rec = reconcileCompany(base(), AT);
    const missing = rec.findings.filter(f => f.classification === "A");
    expect(missing.length).toBeGreaterThan(0);
    for (const f of missing) expect(f.proposal).toBe("create_mapping");
    expect(missing.every(f => !!f.owner)).toBe(true);
  });

  it("QA5 · plan contradictorio (paid_features sin plan_code) genera hallazgo de dato ambiguo", () => {
    const rec = reconcileCompany(base({ plan_code: null, paid_features_enabled: true }), AT);
    expect(rec.contradictions.join(" ")).toContain("plan ambiguo");
    expect(rec.findings.some(f => f.scope === "plan" && f.classification === "E")).toBe(true);
    expect(rec.readiness).not.toBe("READY");
  });

  it("QA6 · access state inconsistente bloquea readiness con explicación", () => {
    const rec = reconcileCompany(base({ approval_state: "needs_review", access_state: "active" }), AT);
    expect(rec.blockers.join(" ")).toContain("aprobación");
    expect(rec.findings.some(f => f.scope === "access_state" && f.proposal === "block_cutover")).toBe(true);
  });

  it("QA7 · cuenta multi-company mantiene resolución independiente y sin propagación", () => {
    const a = reconcileCompany(
      base({ id: "c1", name: "Quality Staff" }, ),
      AT,
    );
    const b = reconcileCompany(
      base({ id: "c2", name: "My Staff", plan_code: "free", max_employees: 10, max_admins: 2 }, { employeeCount: 4, userCount: 1 }),
      AT,
    );
    const withAccount = [a, b].map(r => ({ ...r, accountId: "acct-1" }));
    const [account] = reconcileAccounts(withAccount);
    expect(account.companyIds).toEqual(["c1", "c2"]);
    expect(account.crossTenantLeak).toBe(false);
    expect(account.distinctPlanVersions.length).toBeGreaterThanOrEqual(1);
    for (const o of b.overrides) expect(o.key).toBeDefined();
    // Ningún override de c2 aparece en c1.
    const aIds = new Set(a.overrides.map(o => o.id));
    expect(b.overrides.every(o => !aIds.has(o.id) || a.companyId === b.companyId)).toBe(true);
  });

  it("QA8 · global owner ve la flota; QA9 tenant admin sólo la suya; QA10 sin permisos no ve nada", () => {
    expect(readinessVisibility("global_owner", [], "c1").canSeeFleet).toBe(true);
    expect(readinessVisibility("global_owner", [], "c1").canApproveCutover).toBe(false);

    const admin = readinessVisibility("tenant_admin", ["c1"], "c1");
    expect(admin.canSeeCompany).toBe(true);
    expect(admin.canSeeFleet).toBe(false);
    expect(admin.canApproveCutover).toBe(false);
    expect(readinessVisibility("tenant_admin", ["c1"], "c2").canSeeCompany).toBe(false);

    const other = readinessVisibility("other", ["c1"], "c1");
    expect(other.canSeeCompany).toBe(false);
    expect(other.canSeeFleet).toBe(false);
  });

  it("QA11/QA12 · cero writes y cero cambios de acceso real: el input no se muta", () => {
    const input = base({ plan_code: "free" }, { modules: [{ module: "payroll", is_active: true } as never] });
    const snapshot = JSON.stringify(input);
    reconcileCompany(input, AT);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("readiness siempre trae explicación y cada hallazgo tiene owner", () => {
    const recs = [
      reconcileCompany(base(), AT),
      reconcileCompany(base({ id: "c2", plan_code: "free", max_employees: 10, max_admins: 2 }), AT),
      reconcileCompany(base({ id: "c3", approval_state: "needs_review" }), AT),
    ];
    for (const r of recs) {
      expect(r.readinessReasons.length + r.blockers.length).toBeGreaterThan(0);
      for (const f of r.findings) {
        expect(f.owner).toBeTruthy();
        expect(f.rollback).toBeTruthy();
        expect(f.evidence).toBeTruthy();
      }
    }
    const fleet = summarizeFleetReadiness(recs, AT);
    expect(fleet.total).toBe(3);
    expect(fleet.unresolvedWithoutOwner).toBe(0);
  });

  it("candidatos de cutover: sólo demo y nunca productivas", () => {
    const prod = reconcileCompany(base(), AT);
    expect(prod.cutoverCandidate).toBe(false);
    expect(prod.candidateReason).toContain("productiva");

    const demo = reconcileCompany(base({ id: "demo-1", name: "Demo Tenant", slug: "demo-tenant" }), AT);
    expect(demo.isDemo).toBe(true);
    // Aunque sea demo, sólo se propone si el readiness lo permite.
    if (demo.readiness === "BLOCKED" || demo.readiness === "NOT_READY") {
      expect(demo.cutoverCandidate).toBe(false);
    }
  });

  it("shadow period nunca habilita cutover automático", () => {
    expect(SHADOW_PERIOD_POLICY.minimumDays).toBeGreaterThanOrEqual(30);
    expect(SHADOW_PERIOD_POLICY.autoCutover).toBe(false);
    const complete = evaluateShadowPeriod("2026-01-01T00:00:00.000Z", AT);
    expect(complete.windowComplete).toBe(true);
    expect(complete.cutoverAllowed).toBe(false);
    expect(complete.approvalGranted).toBe(false);
    const pending = evaluateShadowPeriod(AT, AT);
    expect(pending.windowComplete).toBe(false);
  });

  it("cutover contract es un borrador no ejecutable con snapshots", () => {
    const rec = reconcileCompany(base(), AT);
    const draft = buildCutoverContractDraft(rec);
    expect(draft.executable).toBe(false);
    expect(draft.approvedBy).toBeNull();
    expect(draft.cutoverAt).toBeNull();
    expect(draft.legacyFallback).toBe(true);
    expect(draft.rollbackWindowHours).toBeGreaterThan(0);
    expect(Object.keys(draft.capabilitiesSnapshot).length).toBeGreaterThan(0);
    expect(draft.limitsSnapshot["shared.limit.employees"]).toBeDefined();
  });

  it("rollback conserva ECC, audit y overrides, y no toca billing", () => {
    const text = ROLLBACK_PLAN.map(s => `${s.action} ${s.guarantee}`).join(" ").toLowerCase();
    expect(ROLLBACK_PLAN.length).toBeGreaterThanOrEqual(7);
    expect(text).toContain("legacy");
    expect(text).toContain("audit");
    expect(text).toContain("billing");
    expect(text).toContain("por compañía");
  });
});
