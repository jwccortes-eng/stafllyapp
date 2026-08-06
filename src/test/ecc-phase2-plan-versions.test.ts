import { describe, it, expect } from "vitest";
import {
  CAPABILITY_CATALOG,
  LEGACY_MODULE_TO_CAPABILITY,
  capabilityDependencyChain,
  validateCatalog,
} from "@/lib/ecc/capability-catalog";
import {
  assertPlanVersionEditable,
  draftNextVersion,
  getPlanVersion,
  latestPublishedVersion,
  planVersionsFor,
  resolvePlanVersionAt,
  verifyPlanVersion,
  PLAN_VERSIONS,
} from "@/lib/ecc/plan-versions";
import { buildOverride, isOverrideActive, revokeOverride, winningOverride } from "@/lib/ecc/overrides";
import {
  canUseCapability,
  explainCapability,
  getEffectiveCommercialAccess,
  resolveLimits,
  type EccResolutionContext,
} from "@/lib/ecc/entitlements";
import { buildShadowReport, mapLegacyCompanyToEcc, summarizePhase2 } from "@/lib/ecc/legacy-mapping";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";

const legacy: EccReadModelInput = {
  company: {
    id: "c1",
    name: "Quality Staff",
    slug: "quality-staff",
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
    version: 3,
  },
  modules: [],
  subscription: null,
  userCount: 1,
  employeeCount: 3,
  generatedAt: "2026-06-01T00:00:00.000Z",
};

const ctxFor = (over: Partial<EccResolutionContext> = {}): EccResolutionContext => ({
  accountId: "acct-1",
  companyId: "c1",
  contract: { planKey: "stafly.pro", product: "stafly" },
  overrides: [],
  usage: { "shared.limit.employees": 20, "shared.limit.admins": 2 },
  at: "2026-06-01T00:00:00.000Z",
  ...over,
});

const ovr = (draft: Parameters<typeof buildOverride>[0]) => {
  const r = buildOverride(draft);
  if (!r.override) throw new Error(r.error ?? "override inválido");
  return r.override;
};

describe("ECC Fase 2 · catálogo canónico", () => {
  it("el catálogo es consistente y namespaced", () => {
    expect(validateCatalog()).toEqual([]);
    expect(CAPABILITY_CATALOG.every(c => c.key.startsWith(`${c.product}.`))).toBe(true);
  });

  it("no duplica capacidades compartidas por producto", () => {
    const shared = CAPABILITY_CATALOG.filter(c => c.product === "shared").map(c => c.key);
    expect(new Set(shared).size).toBe(shared.length);
    expect(LEGACY_MODULE_TO_CAPABILITY["timeclock"]).toBe("stafly.ops.timeclock");
  });

  it("resuelve cadenas de dependencias", () => {
    expect(capabilityDependencyChain("stafly.payroll.summary")).toContain("stafly.ops.timeclock");
  });
});

describe("ECC Fase 2 · plan versions inmutables", () => {
  it("QA1 · un plan tiene dos versiones con checksum verificable", () => {
    const versions = planVersionsFor("stafly.free");
    expect(versions.map(v => v.version)).toEqual([1, 2]);
    expect(PLAN_VERSIONS.every(verifyPlanVersion)).toBe(true);
    expect(versions[0].checksum).not.toBe(versions[1].checksum);
  });

  it("QA2 · una company anclada conserva su versión anterior", () => {
    const pinned = getPlanVersion("stafly.free", 1)!;
    const access = getEffectiveCommercialAccess(
      ctxFor({ contract: { planVersionId: pinned.id, planKey: "stafly.free", product: "stafly" } }),
    );
    expect(access.planVersion?.version).toBe(1);
    expect(access.limits["shared.limit.admins"].overagePolicy).toBe("block");
  });

  it("QA3 · una company nueva recibe la versión vigente", () => {
    const access = getEffectiveCommercialAccess(ctxFor({ contract: { planKey: "stafly.free", product: "stafly" } }));
    expect(access.planVersion?.version).toBe(2);
    expect(latestPublishedVersion("stafly.free")?.version).toBe(2);
    expect(resolvePlanVersionAt("stafly.free", "2025-01-01")?.version).toBe(1);
  });

  it("una versión publicada no se edita: sólo se crea otra", () => {
    const published = latestPublishedVersion("stafly.pro")!;
    expect(assertPlanVersionEditable(published).ok).toBe(false);
    const next = draftNextVersion("stafly.pro", { capabilities: ["shared.data.export"] }, {
      createdBy: "owner",
      effectiveFrom: "2026-07-01",
      note: "prueba",
    });
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.next.version).toBe(published.version + 1);
      expect(next.next.status).toBe("draft");
      expect(latestPublishedVersion("stafly.pro")?.version).toBe(published.version);
    }
  });
});

describe("ECC Fase 2 · resolver explicable", () => {
  it("QA4 · capability heredada del plan explica su origen", () => {
    const d = canUseCapability(ctxFor(), "stafly.ops.timeclock");
    expect(d.result).toBe(true);
    expect(d.source).toBe("plan_version");
    expect(d.planVersion?.planKey).toBe("stafly.pro");
    expect(d.reason).toMatch(/Concedida/);
    expect(typeof d.result).toBe("boolean");
    expect(d.confidence).toBe("alta");
  });

  it("QA5 · capability revocada por override", () => {
    const o = ovr({
      kind: "capability",
      target: { scope: "company", id: "c1" },
      key: "stafly.payroll.run",
      value: false,
      reason: "Suspensión temporal de nómina por auditoría interna.",
      createdBy: "admin",
      approvedBy: "owner",
      effectiveFrom: "2026-01-01",
    });
    const d = explainCapability(ctxFor({ overrides: [o] }), "stafly.payroll.run");
    expect(d.result).toBe(false);
    expect(d.source).toBe("override");
    expect(d.contradiction).toBe(true);
    expect(d.override?.reason).toMatch(/auditoría/);
    // Dependiente cae por dependencia, no por plan.
    const dep = explainCapability(ctxFor({ overrides: [o] }), "stafly.payroll.summary");
    expect(dep.result).toBe(false);
    expect(dep.source).toBe("dependency");
  });

  it("override sensible exige aprobación reforzada", () => {
    const bad = buildOverride({
      kind: "capability",
      target: { scope: "company", id: "c1" },
      key: "stafly.payroll.run",
      value: true,
      reason: "Habilitación comercial acordada con el cliente.",
      createdBy: "admin",
      effectiveFrom: "2026-01-01",
    });
    expect(bad.ok).toBe(false);
    const selfApproved = buildOverride({
      kind: "capability",
      target: { scope: "company", id: "c1" },
      key: "stafly.billing.monetization",
      value: true,
      reason: "Habilitación comercial acordada con el cliente.",
      createdBy: "admin",
      approvedBy: "admin",
      effectiveFrom: "2026-01-01",
    });
    expect(selfApproved.ok).toBe(false);
    const noReason = buildOverride({
      kind: "limit",
      target: { scope: "company", id: "c1" },
      key: "shared.limit.employees",
      value: 50,
      reason: "ok",
      createdBy: "admin",
      effectiveFrom: "2026-01-01",
    });
    expect(noReason.ok).toBe(false);
  });

  it("QA6 · límite aumentado temporalmente", () => {
    const o = ovr({
      kind: "limit",
      target: { scope: "company", id: "c1" },
      key: "shared.limit.employees",
      value: 2000,
      reason: "Pico operativo de temporada acordado comercialmente.",
      createdBy: "admin",
      approvedBy: "owner",
      effectiveFrom: "2026-05-01",
      effectiveUntil: "2026-08-01",
    });
    const limits = resolveLimits(ctxFor({ overrides: [o] }));
    expect(limits["shared.limit.employees"].value).toBe(2000);
    expect(limits["shared.limit.employees"].source).toBe("override");
    expect(limits["shared.limit.employees"].exceeded).toBe(false);
  });

  it("QA7 · override expirado deja de aplicar y la revocación es append-only", () => {
    const o = ovr({
      kind: "limit",
      target: { scope: "company", id: "c1" },
      key: "shared.limit.employees",
      value: 2000,
      reason: "Pico operativo de temporada acordado comercialmente.",
      createdBy: "admin",
      approvedBy: "owner",
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2026-03-01",
    });
    expect(isOverrideActive(o, "2026-06-01")).toBe(false);
    const limits = resolveLimits(ctxFor({ overrides: [o] }));
    expect(limits["shared.limit.employees"].source).toBe("plan_version");

    const rev = revokeOverride(o, "owner", "Se cerró la temporada operativa.");
    expect(rev.ok).toBe(true);
    expect(rev.revoked?.version).toBe(2);
    expect(o.revokedBy).toBeNull(); // original intacto: append-only
    expect(winningOverride([rev.revoked!], "limit", "shared.limit.employees", "2026-02-01")).toBeNull();
  });

  it("gana el override de mayor prioridad", () => {
    const low = ovr({
      kind: "limit", target: { scope: "company", id: "c1" }, key: "shared.limit.admins", value: 20,
      reason: "Ampliación estándar de administradores.", createdBy: "a", approvedBy: "b", effectiveFrom: "2026-01-01", priority: 10,
    });
    const high = ovr({
      kind: "limit", target: { scope: "company", id: "c1" }, key: "shared.limit.admins", value: 5,
      reason: "Restricción por revisión de seguridad.", createdBy: "a", approvedBy: "b", effectiveFrom: "2026-02-01", priority: 90,
    });
    expect(resolveLimits(ctxFor({ overrides: [low, high] }))["shared.limit.admins"].value).toBe(5);
  });
});

describe("ECC Fase 2 · multi-company y multi-product", () => {
  it("QA8 · overrides de otra company no se propagan", () => {
    const foreign = ovr({
      kind: "capability", target: { scope: "company", id: "c2" }, key: "stafly.ops.chat" in {} ? "x" : "shared.comms.chat",
      value: false, reason: "Restricción exclusiva de la otra compañía.", createdBy: "a", effectiveFrom: "2026-01-01",
    });
    const d = canUseCapability(ctxFor({ overrides: [foreign] }), "shared.comms.chat");
    expect(d.result).toBe(true);
    expect(d.override).toBeNull();
  });

  it("override de cuenta aplica a sus companies", () => {
    const accountOverride = ovr({
      kind: "capability", target: { scope: "account", id: "acct-1" }, key: "shared.comms.chat",
      value: false, reason: "Chat deshabilitado para toda la cuenta comercial.", createdBy: "a", effectiveFrom: "2026-01-01",
    });
    expect(canUseCapability(ctxFor({ overrides: [accountOverride] }), "shared.comms.chat").result).toBe(false);
    expect(canUseCapability(ctxFor({ accountId: "acct-9", overrides: [accountOverride] }), "shared.comms.chat").result).toBe(true);
  });

  it("QA9 · Quality Staff no hereda capacidades de Parceros", () => {
    const stafly = getEffectiveCommercialAccess(ctxFor());
    expect(stafly.entitlements["parceros.passport.profile"]).toBeUndefined();
    const d = explainCapability(ctxFor(), "parceros.passport.profile");
    expect(d.result).toBe(false);
    expect(d.reason).toMatch(/no está contratado/);

    const both = getEffectiveCommercialAccess(ctxFor({ products: ["parceros"] }));
    expect(both.entitlements["parceros.passport.profile"]).toBeDefined();
    // Contratar Parceros no concede capacidades de Stafly por sí solo.
    const parcerosOnly = getEffectiveCommercialAccess(
      ctxFor({ contract: { planKey: "parceros.talent_free", product: "parceros" } }),
    );
    expect(parcerosOnly.entitlements["stafly.payroll.run"]).toBeUndefined();
    expect(parcerosOnly.entitlements["parceros.passport.profile"].result).toBe(true);
  });

  it("capability inexistente se explica, no se asume", () => {
    const d = canUseCapability(ctxFor(), "stafly.inventada");
    expect(d.result).toBe(false);
    expect(d.source).toBe("not_in_catalog");
    expect(d.contradiction).toBe(true);
  });
});

describe("ECC Fase 2 · mapeo legacy y shadow mode", () => {
  it("mapea plan_code y es idempotente", () => {
    const a = mapLegacyCompanyToEcc(legacy, "2026-06-01T00:00:00.000Z");
    const b = mapLegacyCompanyToEcc(legacy, "2026-06-01T00:00:00.000Z");
    expect(a.planVersion?.planKey).toBe("stafly.free");
    expect(a.overrides.map(o => o.id)).toEqual(b.overrides.map(o => o.id));
  });

  it("QA10 · contradicción legacy vs ECC queda expuesta sin cambiar acceso", () => {
    const input: EccReadModelInput = {
      ...legacy,
      modules: [{ module: "payroll", is_active: true }],
    };
    const report = buildShadowReport(input, "2026-06-01T00:00:00.000Z");
    const row = report.capabilities.find(c => c.capabilityKey === "stafly.payroll.run")!;
    expect(row.legacy).toBe(true);
    expect(report.access.overridesApplied.some(o => o.key === "stafly.payroll.run")).toBe(true);
    expect(report.planCodeLegacy).toBe("free");
    // El mapeo no modifica la fuente legacy.
    expect(input.modules).toEqual([{ module: "payroll", is_active: true }]);
  });

  it("subscription legacy queda como referencia informativa", () => {
    const report = mapLegacyCompanyToEcc({
      ...legacy,
      subscription: { plan: "pro", status: "active", stripe_customer_id: null, stripe_subscription_id: null },
    });
    expect(report.entries.some(e => e.action === "informational")).toBe(true);
    expect(report.entries.every(e => e.reversible)).toBe(true);
  });

  it("QA14/QA15 · shadow no cambia acceso real y reporta readiness", () => {
    const enterprise: EccReadModelInput = {
      ...legacy,
      company: { ...legacy.company, plan_code: "enterprise", max_employees: null, max_admins: null },
    };
    const reports = [buildShadowReport(legacy), buildShadowReport(enterprise)];
    const metrics = summarizePhase2(reports);
    expect(metrics.companies).toBe(2);
    expect(reports[0].legacyDependencies).toContain("ModuleGate");
    expect(reports.every(r => typeof r.cutoverReady === "boolean")).toBe(true);
    // El objeto de entrada permanece intacto: el modelo es puro.
    expect(legacy.company.plan_code).toBe("free");
  });
});
