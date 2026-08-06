import { describe, it, expect } from "vitest";
import {
  compareWithLegacy,
  getCommercialContractReadModel,
  summarizeEcc,
  type EccReadModelInput,
} from "@/lib/ecc/commercial-read-model";

const base: EccReadModelInput = {
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
  generatedAt: "2026-01-01T00:00:00.000Z",
};

const codes = (m: ReturnType<typeof getCommercialContractReadModel>) => m.contradictions.map(c => c.code);

describe("ECC · canonical commercial read model", () => {
  it("QA1 · enterprise sin subscription", () => {
    const m = getCommercialContractReadModel({ ...base, company: { ...base.company, plan_code: "enterprise" } });
    expect(m.effectivePlan).toBe("enterprise");
    expect(m.planSource).toBe("plan_code");
    expect(codes(m)).toContain("enterprise_without_subscription");
    expect(m.subscriptions).toHaveLength(0);
  });

  it("QA2 · free con subscription pro", () => {
    const m = getCommercialContractReadModel({
      ...base,
      subscription: { plan: "pro", status: "active", stripe_customer_id: null, stripe_subscription_id: null },
    });
    expect(codes(m)).toContain("free_with_paid_subscription");
    expect(codes(m)).toContain("active_subscription_without_customer");
    expect(m.billingReadiness.state).toBe("inconsistent");
  });

  it("QA3 · override de company_modules explica su fuente", () => {
    const m = getCommercialContractReadModel({ ...base, modules: [{ module: "payroll", is_active: true }] });
    const cap = m.effectiveEntitlements.payroll;
    expect(cap.enabled).toBe(true);
    expect(cap.source).toBe("company_modules");
    expect(cap.contradiction).toBe(true);
    expect(m.overrides.some(o => o.kind === "module_added")).toBe(true);
  });

  it("QA4 · empresa activa sin aprobación es contradicción alta", () => {
    const m = getCommercialContractReadModel({
      ...base,
      company: { ...base.company, approval_state: "needs_review" },
    });
    expect(codes(m)).toContain("active_without_approval");
    expect(m.billingReadiness.missing).toContain("approval");
  });

  it("QA5 · access restricted conserva acceso legal", () => {
    const m = getCommercialContractReadModel({
      ...base,
      company: { ...base.company, access_state: "restricted" },
    });
    expect(m.lifecycleCapabilities.create_shift.enabled).toBe(false);
    expect(m.lifecycleCapabilities.read_payroll_history.enabled).toBe(true);
    expect(m.legalAccessPreserved).toBe(true);
  });

  it("QA6 · subscription legacy sin customer marca legacy_partial", () => {
    const m = getCommercialContractReadModel({
      ...base,
      subscription: { plan: "free", status: "canceled", stripe_customer_id: null, stripe_subscription_id: null },
    });
    expect(m.billingReadiness.state).toBe("legacy_partial");
    expect(m.legacySources).toContain("subscriptions");
  });

  it("QA7 · dos compañías en un mismo account no propagan capacidades", () => {
    const account = { id: "acc1", name: "Grupo", companyIds: ["c1", "c2"], derived: true };
    const a = getCommercialContractReadModel({ ...base, commercialAccount: account, modules: [{ module: "payroll", is_active: true }] });
    const b = getCommercialContractReadModel({
      ...base,
      commercialAccount: account,
      company: { ...base.company, id: "c2", name: "My Staff" },
    });
    expect(a.commercialAccount.scope).toBe("account");
    expect(a.effectiveEntitlements.payroll.enabled).toBe(true);
    expect(b.effectiveEntitlements.payroll.enabled).toBe(false);
    expect(b.company.id).toBe("c2");
  });

  it("shadow comparison no reporta diferencias con el gate legacy", () => {
    const input = { ...base, modules: [{ module: "payroll", is_active: true }] };
    const m = getCommercialContractReadModel(input);
    expect(compareWithLegacy(m, input)).toHaveLength(0);
  });

  it("límite excedido y elevación manual quedan registrados", () => {
    const input: EccReadModelInput = {
      ...base,
      company: { ...base.company, paid_features_enabled: true, max_employees: 2 },
      employeeCount: 5,
    };
    const m = getCommercialContractReadModel(input);
    expect(m.effectivePlan).toBe("enterprise");
    expect(m.planSource).toBe("manual_override");
    expect(codes(m)).toContain("limit_exceeded_max_employees");
    expect(m.overrides.some(o => o.kind === "plan_elevation")).toBe(true);
  });

  it("métricas de adopción agregan contradicciones y readiness", () => {
    const m1 = getCommercialContractReadModel(base);
    const m2 = getCommercialContractReadModel({ ...base, company: { ...base.company, id: "c2", approval_state: "needs_review" } });
    const metrics = summarizeEcc([
      { model: m1, diffs: compareWithLegacy(m1, base) },
      { model: m2, diffs: [] },
    ]);
    expect(metrics.companiesAnalyzed).toBe(2);
    expect(metrics.contradictionsHigh).toBe(1);
    expect(metrics.billingReadiness.not_configured).toBeGreaterThan(0);
    expect(metrics.legalAccessBreaches).toBe(0);
  });
});
