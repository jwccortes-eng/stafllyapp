import { describe, it, expect } from "vitest";
import {
  buildEmployeeIdentityIndex,
  resolveIdentityFromIndex,
  type IdentityCandidateRecord,
} from "@/lib/identity/employee-identity-resolver";
import { classifyWorkerAssignability } from "@/lib/shifts/assignable-workers";

const sophia: IdentityCandidateRecord = {
  id: "canonical-sophia",
  first_name: "Sophia",
  last_name: "Contreras",
  employer_identification: "ST-1073",
  phone_number: "(786) 555-1073",
  email: "sophia.contreras@example.com",
  user_id: "auth-sophia",
  is_active: true,
  added_via: "Pending approval",
};

const roster: IdentityCandidateRecord[] = [
  sophia,
  { id: "other-1", first_name: "Carlos", last_name: "Alvarez", employer_identification: "ST-414" },
  { id: "other-2", first_name: "Juan", last_name: "Hernandez" },
  { id: "other-3", first_name: "Juan", last_name: "Hernandez" },
];

const index = buildEmployeeIdentityIndex(roster);

describe("resolver canónico de identidad", () => {
  it("QA1 · reimportar Sophia Contreras no crea otro employee", () => {
    const res = resolveIdentityFromIndex(index, { fullName: "Sophia Contreras" });
    expect(res.canCreate).toBe(false);
    expect(res.outcome).toBe("PROBABLE_MATCH");
    expect(res.candidates[0].id).toBe("canonical-sophia");
  });

  it("QA1b · con señal fuerte reutiliza el canónico ST-1073", () => {
    const res = resolveIdentityFromIndex(index, {
      fullName: "Sophía Contreras",
      employerIdentification: "st-1073",
    });
    expect(res.outcome).toBe("EXACT_MATCH");
    expect(res.employeeId).toBe("canonical-sophia");
  });

  it("prioriza teléfono normalizado sobre nombre", () => {
    const res = resolveIdentityFromIndex(index, { fullName: "S. Contreras", phone: "+1 786-555-1073" });
    expect(res.outcome).toBe("EXACT_MATCH");
    expect(res.signal).toBe("phone");
  });

  it("QA2 · persona nueva real se puede crear una sola vez", () => {
    const res = resolveIdentityFromIndex(index, { firstName: "Nueva", lastName: "Persona", phone: "3055550000" });
    expect(res.outcome).toBe("NOT_FOUND");
    expect(res.canCreate).toBe(true);
  });

  it("QA3 · repetir el import es idempotente", () => {
    const created: IdentityCandidateRecord = {
      id: "new-1",
      first_name: "Nueva",
      last_name: "Persona",
      phone_number: "3055550000",
    };
    const next = buildEmployeeIdentityIndex([...roster, created]);
    const res = resolveIdentityFromIndex(next, { firstName: "Nueva", lastName: "Persona", phone: "3055550000" });
    expect(res.outcome).toBe("EXACT_MATCH");
    expect(res.employeeId).toBe("new-1");
  });

  it("QA6 · nombre repetido sin señal fuerte queda AMBIGUOUS y nunca se fusiona", () => {
    const res = resolveIdentityFromIndex(index, { fullName: "Juan Hernandez" });
    expect(res.outcome).toBe("AMBIGUOUS");
    expect(res.canCreate).toBe(false);
    expect(res.employeeId).toBeNull();
  });

  it("ignora buzones corporativos compartidos como señal de identidad", () => {
    const shared = buildEmployeeIdentityIndex([
      ...roster,
      ...[1, 2, 3, 4].map((n) => ({
        id: `sys-${n}`,
        first_name: "System",
        last_name: `${n}`,
        email: "qualitystaff@gmail.com",
      })),
    ]);
    const res = resolveIdentityFromIndex(shared, {
      firstName: "Persona",
      lastName: "Nueva",
      email: "qualitystaff@gmail.com",
    });
    expect(res.outcome).toBe("NOT_FOUND");
  });

  it("QA7 · el índice se construye por tenant: no mezcla compañías", () => {
    const tenantA = buildEmployeeIdentityIndex(roster.filter((r) => r.id === "canonical-sophia"));
    const res = resolveIdentityFromIndex(tenantA, { fullName: "Carlos Alvarez" });
    expect(res.outcome).toBe("NOT_FOUND");
  });

  it("descarta registros ya fusionados o borrados", () => {
    const merged = buildEmployeeIdentityIndex([
      { id: "dup", first_name: "Sophia", last_name: "Contreras", merged_into_employee_id: "canonical-sophia" },
    ]);
    expect(resolveIdentityFromIndex(merged, { fullName: "Sophia Contreras" }).outcome).toBe("NOT_FOUND");
  });
});

describe("asignabilidad: added_via es historia, no bloqueo", () => {
  it("QA4 · canónico con Pending approval y portal real es asignable", () => {
    const verdict = classifyWorkerAssignability({
      is_active: true,
      added_via: "Pending approval",
      user_id: "auth-sophia",
    });
    expect(verdict.assignable).toBe(true);
    expect(verdict.bucket).toBe("assignable");
  });

  it("sin portal ni evidencia operativa sigue siendo pendiente", () => {
    const verdict = classifyWorkerAssignability({
      is_active: true,
      added_via: "Pending approval",
      user_id: null,
    });
    expect(verdict.assignable).toBe(false);
    expect(verdict.bucket).toBe("pending_approval");
  });

  it("onboarding completado también cuenta como evidencia real", () => {
    const verdict = classifyWorkerAssignability({
      is_active: true,
      added_via: "Pending approval",
      onboarding_status: "completed",
    });
    expect(verdict.assignable).toBe(true);
  });

  it("QA5 · duplicado muerto (inactivo) no compite en staffing", () => {
    const verdict = classifyWorkerAssignability({ is_active: false, added_via: "Pending approval" });
    expect(verdict.assignable).toBe(false);
    expect(verdict.bucket).toBe("inactive");
  });

  it("histórico sigue bloqueado aunque tenga portal", () => {
    const verdict = classifyWorkerAssignability({
      is_active: true,
      employee_role: "historical",
      user_id: "auth-x",
    });
    expect(verdict.assignable).toBe(false);
    expect(verdict.bucket).toBe("historical");
  });
});
