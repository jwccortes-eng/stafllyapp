import { describe, it, expect } from "vitest";
import {
  actionsForMatch,
  classifyPhoneMatches,
  isSearchablePhone,
  phoneKey,
  type PhoneMatch,
} from "@/lib/people/existing-person-flow";

const base: PhoneMatch = {
  employee_id: "e1",
  company_id: "c1",
  company_name: "Quality Staff",
  same_company: true,
  first_name: "Sofía",
  last_name: "Contreras",
  phone_number: "(305) 555-0100",
  is_active: true,
  portal_access_enabled: false,
  has_portal_user: false,
  worker_type: "real_employee",
  identity_status: "verified",
  merged_into_employee_id: null,
};

describe("P0 · Emergency Worker — persona existente", () => {
  it("normaliza el teléfono igual que la base de datos", () => {
    expect(phoneKey("+1 (305) 555-0100")).toBe("3055550100");
    expect(phoneKey("305.555.0100")).toBe("3055550100");
    expect(phoneKey("")).toBeNull();
    expect(isSearchablePhone("305")).toBe(false);
    expect(isSearchablePhone("3055550100")).toBe(true);
  });

  it("QA1 · misma empresa → nunca se inserta, se reutiliza", () => {
    const r = classifyPhoneMatches([base], { hasPhone: true });
    expect(r.decision).toBe("reuse_in_company");
    expect(r.canCreateNew).toBe(false);
    expect(r.headline).toBe("Persona encontrada");
    expect(actionsForMatch(base)).toEqual(["assign_to_service", "update_data", "view_profile"]);
  });

  it("QA2 · inactivo en la empresa ofrece reactivar acceso", () => {
    expect(actionsForMatch({ ...base, is_active: false })).toContain("reactivate_access");
  });

  it("QA3 · otra empresa → membresía, sin duplicar identidad", () => {
    const other = { ...base, employee_id: "e2", company_id: "c2", company_name: "My Staff Solution", same_company: false };
    const r = classifyPhoneMatches([other], { hasPhone: true });
    expect(r.decision).toBe("add_membership");
    expect(r.canCreateNew).toBe(false);
    expect(r.headline).toBe("Esta persona ya pertenece al ecosistema");
    expect(actionsForMatch(other)).toEqual(["add_membership", "view_profile"]);
  });

  it("QA4 · la empresa activa manda sobre las demás", () => {
    const other = { ...base, employee_id: "e2", company_id: "c2", same_company: false };
    const r = classifyPhoneMatches([other, base], { hasPhone: true });
    expect(r.decision).toBe("reuse_in_company");
    expect(r.sameCompany).toHaveLength(1);
    expect(r.otherCompanies).toHaveLength(1);
  });

  it("QA5 · sin coincidencias sí se puede crear", () => {
    const r = classifyPhoneMatches([], { hasPhone: true });
    expect(r.decision).toBe("create_new");
    expect(r.canCreateNew).toBe(true);
  });

  it("QA6 · registros fusionados no bloquean ni se ofrecen como destino", () => {
    const merged = { ...base, merged_into_employee_id: "canon-1" };
    expect(actionsForMatch(merged)).toEqual(["open_canonical"]);
    expect(classifyPhoneMatches([merged], { hasPhone: true }).decision).toBe("create_new");
  });

  it("sin teléfono se permite crear con identidad pendiente", () => {
    const r = classifyPhoneMatches([], { hasPhone: false });
    expect(r.canCreateNew).toBe(true);
    expect(r.detail).toContain("identidad pendiente");
  });
});
