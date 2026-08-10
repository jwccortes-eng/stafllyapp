import { describe, it, expect } from "vitest";
import { resolvePersonStatus } from "@/lib/people/person-status";

const base = { id: "w", is_active: true, employee_role: "Mesero_Waiter", added_via: "Manual" };

describe("4 dimensiones canónicas de persona", () => {
  it("worker normal activo con portal y docs al día → ASSIGNABLE", () => {
    const s = resolvePersonStatus({ ...base, user_id: "u1", missingDocuments: 0 });
    expect(s.identity.value).toBe("VERIFIED");
    expect(s.portal.value).toBe("PORTAL_ACTIVE");
    expect(s.compliance.value).toBe("COMPLIANT");
    expect(s.assignability.value).toBe("ASSIGNABLE");
  });

  it("missing docs NO bloquea: solo advierte (caso Mariany)", () => {
    const s = resolvePersonStatus({ ...base, user_id: "u1", missingDocuments: 3 });
    expect(s.portal.value).toBe("PORTAL_ACTIVE");
    expect(s.compliance.value).toBe("MISSING_DOCS");
    expect(s.assignability.value).toBe("ASSIGNABLE_WITH_WARNING");
    expect(s.assignability.canAssign).toBe(true);
  });

  it("posible duplicado sin resolver bloquea y explica (caso Sophia)", () => {
    const s = resolvePersonStatus(
      {
        ...base,
        worker_type: "emergency_worker",
        identity_status: "pending_identity",
        duplicateReason: "mismo teléfono",
        missingDocuments: 2,
      },
      { invitation: { status: "accepted" } },
    );
    expect(s.identity.value).toBe("REVIEW_REQUIRED");
    expect(s.portal.value).toBe("ACCESS_REPAIR_REQUIRED");
    expect(s.compliance.value).toBe("MISSING_DOCS");
    expect(s.assignability.value).toBe("BLOCKED");
    expect(s.assignability.reasons).toContain("posible duplicado pendiente de resolución");
  });

  it("portal activo NO implica asignable si el registro es histórico", () => {
    const s = resolvePersonStatus({ ...base, employee_role: "historical", user_id: "u9" });
    expect(s.portal.value).toBe("PORTAL_ACTIVE");
    expect(s.assignability.value).toBe("BLOCKED");
  });

  it("invited NO significa sin acceso ni bloqueo duro", () => {
    const s = resolvePersonStatus(base, { invitation: { status: "sent" } });
    expect(s.portal.value).toBe("INVITED");
    expect(s.assignability.value).toBe("ASSIGNABLE_WITH_WARNING");
    expect(s.assignability.reasons).toContain("portal pendiente");
  });

  it("sin portal: asignable con advertencia, no bloqueado", () => {
    const s = resolvePersonStatus({ ...base, missingDocuments: 0 });
    expect(s.portal.value).toBe("NO_PORTAL");
    expect(s.assignability.canAssign).toBe(true);
  });

  it("pending identity (placeholder) bloquea", () => {
    const s = resolvePersonStatus({ ...base, worker_type: "legacy_placeholder" });
    expect(s.identity.value).toBe("PENDING_IDENTITY");
    expect(s.assignability.value).toBe("BLOCKED");
  });

  it("cross-tenant bloquea", () => {
    const s = resolvePersonStatus(
      { ...base, user_id: "u1", company_id: "A" },
      { activeCompanyId: "B" },
    );
    expect(s.assignability.value).toBe("BLOCKED");
    expect(s.assignability.reasons[0]).toContain("cross-tenant");
  });

  it("inactivo bloquea y el portal sigue diciendo la verdad", () => {
    const s = resolvePersonStatus({ ...base, is_active: false, user_id: "u1" });
    expect(s.portal.value).toBe("PORTAL_ACTIVE");
    expect(s.assignability.value).toBe("BLOCKED");
  });
});
