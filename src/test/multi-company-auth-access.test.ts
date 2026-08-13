import { describe, expect, it } from "vitest";
import {
  accessDeniedMessage,
  resolveMultiCompanyAccess,
  type IdentityEmployeeRecord,
} from "@/lib/auth/multi-company-access";

const rec = (over: Partial<IdentityEmployeeRecord> = {}): IdentityEmployeeRecord => ({
  id: crypto.randomUUID(),
  company_id: "quality",
  is_active: true,
  user_id: "user-1",
  access_pin: "1234",
  created_at: "2026-01-01",
  ...over,
});

describe("P0 — Multi-company auth access truth", () => {
  it("sin fichas: identidad inexistente", () => {
    const a = resolveMultiCompanyAccess([]);
    expect(a.outcome).toBe("no_identity");
    expect(accessDeniedMessage(a.outcome)).toContain("No encontramos");
  });

  it("CASO DUVÁN: inactivo en una empresa, activo en otra → acceso concedido", () => {
    const a = resolveMultiCompanyAccess([
      rec({ company_id: "quality", is_active: false, created_at: "2026-02-25" }),
      rec({ company_id: "mystaff", is_active: true, created_at: "2026-03-19" }),
    ]);
    expect(a.outcome).toBe("access_granted");
    expect(a.activeCompanyIds).toEqual(["mystaff"]);
    expect(a.inactiveCompanyIds).toEqual(["quality"]);
    expect(a.credentialRecord?.company_id).toBe("mystaff");
  });

  it("todas las empresas inactivas → acceso desactivado, no 'cuenta inexistente'", () => {
    const a = resolveMultiCompanyAccess([
      rec({ company_id: "quality", is_active: false }),
      rec({ company_id: "mystaff", is_active: false }),
    ]);
    expect(a.outcome).toBe("access_disabled");
    expect(a.authUserId).toBe("user-1");
    expect(accessDeniedMessage(a.outcome)).toContain("desactivado");
  });

  it("identidad activa sin PIN ni hash → requiere activación", () => {
    const a = resolveMultiCompanyAccess([rec({ access_pin: null, user_id: null })]);
    expect(a.outcome).toBe("requires_activation");
    expect(a.requiresActivation).toBe(true);
  });

  it("fichas fusionadas aportan identidad pero nunca acceso", () => {
    const a = resolveMultiCompanyAccess([
      rec({ company_id: "quality", merged_into_employee_id: "canon", is_active: true }),
      rec({ company_id: "mystaff", is_active: false }),
    ]);
    expect(a.outcome).toBe("access_disabled");
    expect(a.identityRecords).toHaveLength(2);
    expect(a.activeRecords).toHaveLength(0);
  });

  it("la ficha inactiva nunca se elige como credencial cuando hay activas", () => {
    const a = resolveMultiCompanyAccess([
      rec({ company_id: "quality", is_active: false, access_pin: "0000" }),
      rec({ company_id: "mystaff", is_active: true, access_pin: "4321" }),
    ]);
    expect(a.credentialRecord?.access_pin).toBe("4321");
    expect(a.primaryRecord?.company_id).toBe("mystaff");
  });

  it("una empresa presente como activa e inactiva cuenta como activa", () => {
    const a = resolveMultiCompanyAccess([
      rec({ company_id: "quality", is_active: false }),
      rec({ company_id: "quality", is_active: true }),
    ]);
    expect(a.activeCompanyIds).toEqual(["quality"]);
    expect(a.inactiveCompanyIds).toEqual([]);
  });
});
