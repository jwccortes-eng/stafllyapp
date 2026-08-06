import { describe, it, expect } from "vitest";
import { buildCompanyTruth, summarizeTruth, type CompanyTruthInput } from "@/lib/billing/company-truth";

const base: CompanyTruthInput = {
  id: "c1",
  name: "Test",
  is_active: true,
  status: "active",
  plan_code: "free",
  plan_status: "active",
  billing_status: "none",
  paid_features_enabled: false,
  max_employees: 10,
  max_admins: 2,
  modules: [],
  subscription: null,
  user_count: 1,
  employee_count: 3,
};

const codes = (t: ReturnType<typeof buildCompanyTruth>) => t.contradictions.map(c => c.code);

describe("company billing truth layer", () => {
  it("QA1 · enterprise sin subscription usa plan_code como fuente", () => {
    const t = buildCompanyTruth({ ...base, plan_code: "enterprise" });
    expect(t.effectivePlan).toBe("enterprise");
    expect(t.planSource).toBe("companies.plan_code");
    expect(t.commercial.state).toBe("not_configured");
    expect(codes(t)).toContain("plan_without_subscription");
  });

  it("QA2 · free con subscription pro activa marca contradicción alta", () => {
    const t = buildCompanyTruth({
      ...base,
      subscription: { plan: "pro", status: "active", stripe_customer_id: null, stripe_subscription_id: null },
    });
    expect(t.effectivePlan).toBe("free");
    expect(codes(t)).toContain("free_with_paid_subscription");
    expect(t.commercial.state).toBe("inconsistent");
  });

  it("QA3 · status inactive con is_active true", () => {
    const t = buildCompanyTruth({ ...base, status: "inactive" });
    expect(codes(t)).toContain("active_flag_vs_status");
    expect(t.access.state).toBe("active");
  });

  it("QA4 · override de company_modules se reporta como módulo añadido", () => {
    const t = buildCompanyTruth({ ...base, modules: [{ module: "payroll", is_active: true }] });
    expect(t.entitlements.added).toContain("payroll");
    expect(codes(t)).toContain("modules_beyond_plan");
  });

  it("QA4b · desactivar un módulo concedido por el plan no retira acceso", () => {
    const t = buildCompanyTruth({
      ...base,
      plan_code: "enterprise",
      modules: [{ module: "payroll", is_active: false }],
    });
    expect(t.entitlements.removedAttempted).toContain("payroll");
    expect(codes(t)).toContain("module_removal_ineffective");
  });

  it("QA5 · empresa sin billing se reconoce como no configurada", () => {
    const t = buildCompanyTruth(base);
    expect(t.commercial.label).toBe("Billing no configurado");
  });

  it("paid_features_enabled se reporta como fuente de elevación", () => {
    const t = buildCompanyTruth({ ...base, paid_features_enabled: true });
    expect(t.effectivePlan).toBe("enterprise");
    expect(t.planSource).toBe("companies.paid_features_enabled");
    expect(codes(t)).toContain("paid_features_override");
  });

  it("acceso restringido cuando is_active es false", () => {
    const t = buildCompanyTruth({ ...base, is_active: false, status: "suspended" });
    expect(t.access.state).toBe("restricted");
    expect(t.access.label).toBe("Acceso restringido");
  });

  it("aprobación siempre reportada como no implementada", () => {
    const t = buildCompanyTruth(base);
    expect(t.approval.implemented).toBe(false);
    expect(summarizeTruth([t]).approvalImplemented).toBe(false);
  });

  it("resumen agrega revisiones y billing no configurado", () => {
    const s = summarizeTruth([
      buildCompanyTruth(base),
      buildCompanyTruth({ ...base, id: "c2", status: "inactive" }),
    ]);
    expect(s.total).toBe(2);
    expect(s.needsReview).toBe(1);
    expect(s.billingNotConfigured).toBe(1);
  });
});
