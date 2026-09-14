import { describe, it, expect } from "vitest";
import {
  evaluateEntitlement,
  checkEntitlementShadow,
  resolveCanonicalPlan,
  PLAN_ENTITLEMENTS,
  type CompanyEntitlementInput,
} from "@/lib/commercial/entitlements";
import { getCompanyOverrides, STAFLY_DEMO_COMPANY_ID } from "@/lib/commercial/entitlement-overrides";

const company = (o: Partial<CompanyEntitlementInput>): CompanyEntitlementInput => ({
  id: "c",
  name: "C",
  plan_code: "free",
  plan_status: "active",
  paid_features_enabled: false,
  max_employees: null,
  max_admins: null,
  is_active: true,
  usage: { active_workers: 0, admin_users: 0 },
  ...o,
});

describe("canonical entitlements (shadow mode)", () => {
  it("Starter resuelve 25 trabajadores activos", () => {
    const e = evaluateEntitlement(company({ usage: { active_workers: 5 } }), "active_workers");
    expect(e.plan).toBe("starter");
    expect(e.base_limit).toBe(25);
    expect(e.effective_limit).toBe(25);
    expect(e.status).toBe("WITHIN_LIMIT");
  });

  it("Operations resuelve 75 trabajadores activos", () => {
    expect(PLAN_ENTITLEMENTS.operations.active_workers).toBe(75);
  });

  it("Scale no se capea a 150", () => {
    const e = evaluateEntitlement(
      company({
        plan_code: "enterprise",
        max_employees: 9999,
        max_admins: 99,
        subscription_plan: "scale",
        usage: { active_workers: 218 },
      }),
      "active_workers",
    );
    expect(e.plan).toBe("scale");
    expect(e.effective_limit).toBeNull();
    expect(e.status).toBe("CUSTOM");
    expect(e.remaining_capacity).toBeNull();
  });

  it("JKitchen evalúa 17/75 en Operations", () => {
    const e = evaluateEntitlement(
      company({
        id: "b653f344-b07a-44a2-ae2c-cf06bfb0645a",
        name: "JKitchen Staff",
        plan_code: "paid_manual",
        max_employees: 75,
        max_admins: 10,
        subscription_plan: "operations",
        usage: { active_workers: 17, admin_users: 8 },
      }),
      "active_workers",
    );
    expect(e.plan).toBe("operations");
    expect(e.effective_limit).toBe(75);
    expect(e.current_usage).toBe(17);
    expect(e.remaining_capacity).toBe(58);
    expect(e.status).toBe("WITHIN_LIMIT");
    expect(e.override).toBeNull();
  });

  it("columna legacy por debajo del plan se expone como ajuste explícito", () => {
    const e = evaluateEntitlement(
      company({ plan_code: "enterprise", max_employees: 10, usage: { active_workers: 7 } }),
      "active_workers",
    );
    expect(e.effective_limit).toBe(10);
    expect(e.override?.source).toBe("legacy_column");
    expect(e.status).toBe("WITHIN_LIMIT");
  });

  it("plan desconocido devuelve NEEDS_REVIEW en lugar de adivinar", () => {
    const e = evaluateEntitlement(company({ plan_code: "mystery" }), "active_workers");
    expect(e.status).toBe("NEEDS_REVIEW");
    expect(e.effective_limit).toBeNull();
  });

  it("suscripción discordante se reporta como conflicto sin restringir", () => {
    const r = resolveCanonicalPlan(company({ plan_code: "free", subscription_plan: "pro" }));
    expect(r.plan).toBe("starter");
    expect(r.needs_review).toBe(true);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  it("admin_users es una clave independiente de active_workers", () => {
    const c = company({
      plan_code: "paid_manual",
      usage: { active_workers: 17, admin_users: 10 },
    });
    expect(evaluateEntitlement(c, "admin_users").effective_limit).toBe(10);
    expect(evaluateEntitlement(c, "admin_users").status).toBe("AT_LIMIT");
    expect(evaluateEntitlement(c, "active_workers").status).toBe("WITHIN_LIMIT");
  });

  it("la decisión sombra nunca se marca como aplicada", () => {
    const d = checkEntitlementShadow(
      company({ usage: { active_workers: 25 } }),
      "active_workers",
      1,
    );
    expect(d.enforced).toBe(false);
    expect(d.allowed_under_future_rules).toBe(false);
    expect(d.projected_usage).toBe(26);
    expect(d.status).toBe("WOULD_EXCEED");
  });

  it("una empresa por encima del umbral público no queda bloqueada bajo Scale", () => {
    const d = checkEntitlementShadow(
      company({
        plan_code: "enterprise",
        paid_features_enabled: true,
        max_employees: 9999,
        subscription_plan: "scale",
        usage: { active_workers: 184 },
      }),
      "active_workers",
      1,
    );
    expect(d.allowed_under_future_rules).toBe(true);
  });
});

describe("P1.1 — resolución de conflictos conocidos", () => {
  it("My Staff Solution resuelve a Scale con capacidad contractual pese a la suscripción obsoleta", () => {
    const c = company({
      id: "37f92f75-7af4-4496-aa10-793e14b09ed9",
      name: "My Staff Solution LLC",
      plan_code: "enterprise",
      paid_features_enabled: true,
      max_employees: 9999,
      max_admins: 99,
      subscription_plan: "operations",
      usage: { active_workers: 67, admin_users: 5 },
    });
    const e = evaluateEntitlement(c, "active_workers");
    expect(e.plan).toBe("scale");
    expect(e.effective_limit).toBeNull();
    expect(e.status).toBe("CUSTOM");
    expect(e.conflicts).toHaveLength(0);
    expect(e.informational.join(" ")).toContain("legacy");
  });

  it("un tenant interno no se convierte en cliente comercial por su suscripción", () => {
    const c = company({
      id: "876d404e-535e-4518-9541-80bc02298f90",
      name: "Sandbox",
      plan_code: "free",
      is_sandbox: true,
      is_test: true,
      subscription_plan: "pro",
      usage: { active_workers: 5, admin_users: 2 },
    });
    const e = evaluateEntitlement(c, "active_workers");
    expect(e.context).toBe("internal");
    expect(e.plan).toBe("starter");
    expect(e.conflicts).toHaveLength(0);
    expect(e.status).not.toBe("NEEDS_REVIEW");
  });

  it("el override explícito de Stafly Demo gana a la columna legacy de administradores", () => {
    const c = company({
      id: STAFLY_DEMO_COMPANY_ID,
      name: "Stafly Demo",
      plan_code: "enterprise",
      is_demo: true,
      max_employees: 10,
      max_admins: 2,
      overrides: getCompanyOverrides(STAFLY_DEMO_COMPANY_ID),
      usage: { active_workers: 7, admin_users: 9 },
    });
    const e = evaluateEntitlement(c, "admin_users");
    expect(e.effective_limit).toBe(10);
    expect(e.override?.reason).toBe("internal_demo");
    expect(e.status).toBe("NEAR_LIMIT");
  });

  it("el override solo aplica a la empresa nombrada", () => {
    expect(getCompanyOverrides("b653f344-b07a-44a2-ae2c-cf06bfb0645a")).toHaveLength(0);
  });
});
