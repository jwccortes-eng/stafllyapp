import { describe, expect, it } from "vitest";
import {
  CANONICAL_ROLES,
  getCanonicalRole,
  resolveScope,
  roleFromTemplateName,
  roleGrants,
  rolesForMembership,
  scopeAllows,
  templateActionsFor,
} from "@/lib/auth/role-model";
import { PERMISSION_CATALOG } from "@/lib/auth/permission-catalog";

const role = (k: string) => {
  const r = getCanonicalRole(k);
  if (!r) throw new Error(`missing role ${k}`);
  return r;
};

describe("modelo canónico de roles", () => {
  it("los permisos de cada rol existen en el catálogo (no se inventan permisos)", () => {
    const known = new Set(PERMISSION_CATALOG.map((p) => p.permission));
    for (const r of CANONICAL_ROLES) {
      if (r.permissions === "*") continue;
      for (const p of r.permissions) expect(known.has(p), `${r.key}: ${p}`).toBe(true);
    }
  });

  it("Company Owner tiene acceso total de compañía", () => {
    expect(roleGrants(role("company_owner"), "payroll.approve")).toBe(true);
    expect(resolveScope(role("company_owner"), "attendance.view")).toBe("COMPANY");
  });

  it("Shift Administrator opera servicios pero no payroll ni administración", () => {
    const r = role("shift_admin");
    expect(roleGrants(r, "service.publish")).toBe(true);
    expect(roleGrants(r, "staffing.replace")).toBe(true);
    expect(roleGrants(r, "payroll.manage")).toBe(false);
    expect(roleGrants(r, "roles.manage")).toBe(false);
  });

  it("Time & Closeout Administrator cierra pero no crea servicios ni aprueba payroll", () => {
    const r = role("time_closeout_admin");
    expect(roleGrants(r, "time_entries.approve")).toBe(true);
    expect(roleGrants(r, "closeout.close_day")).toBe(true);
    expect(roleGrants(r, "service.create")).toBe(false);
    expect(roleGrants(r, "payroll.approve")).toBe(false);
  });

  it("Payroll Administrator prepara pero no aprueba; Payroll Approver aprueba pero no ajusta horas", () => {
    expect(roleGrants(role("payroll_admin"), "payroll.manage")).toBe(true);
    expect(roleGrants(role("payroll_admin"), "payroll.approve")).toBe(false);
    expect(roleGrants(role("payroll_approver"), "payroll.approve")).toBe(true);
    expect(roleGrants(role("payroll_approver"), "time_entries.adjust")).toBe(false);
  });

  it("Service Supervisor es un único rol técnico con alias visibles", () => {
    expect(roleFromTemplateName("Captain")?.key).toBe("service_supervisor");
    expect(roleFromTemplateName("Headwaiter")?.key).toBe("service_supervisor");
    expect(roleFromTemplateName("Service Supervisor")?.key).toBe("service_supervisor");
  });

  it("el mismo permiso cambia de alcance según el rol (no se duplican permisos)", () => {
    expect(resolveScope(role("worker"), "attendance.view")).toBe("SELF");
    expect(resolveScope(role("service_supervisor"), "attendance.view")).toBe("ASSIGNED_SERVICE");
    expect(resolveScope(role("time_closeout_admin"), "attendance.view")).toBe("COMPANY");
  });

  it("el alcance es jerárquico", () => {
    expect(scopeAllows("COMPANY", "ASSIGNED_SERVICE")).toBe(true);
    expect(scopeAllows("ASSIGNED_SERVICE", "COMPANY")).toBe(false);
    expect(scopeAllows("SELF", "ASSIGNED_SERVICE")).toBe(false);
  });

  it("el supervisor no ve payroll ni configuración", () => {
    const r = role("service_supervisor");
    for (const p of ["payroll.view", "payroll.manage", "company.settings", "roles.manage"]) {
      expect(roleGrants(r, p), p).toBe(false);
    }
  });

  it("las plantillas derivan del catálogo legacy sin acciones inventadas", () => {
    const legacy = new Set(PERMISSION_CATALOG.map((p) => p.legacyAction).filter(Boolean));
    for (const r of CANONICAL_ROLES) {
      for (const a of templateActionsFor(r)) expect(legacy.has(a), `${r.key}: ${a}`).toBe(true);
    }
    expect(templateActionsFor(role("shift_admin"))).toContain("crear_turno");
    expect(templateActionsFor(role("payroll_approver"))).toContain("aprobar_nomina");
    expect(templateActionsFor(role("payroll_admin"))).not.toContain("aprobar_nomina");
  });

  it("un usuario puede tener roles distintos por empresa (el rol vive en la membresía)", () => {
    expect(rolesForMembership("admin").map((r) => r.key)).toEqual(
      expect.arrayContaining(["shift_admin", "time_closeout_admin", "payroll_admin", "payroll_approver"]),
    );
    expect(rolesForMembership("manager").map((r) => r.key)).toEqual(["service_supervisor"]);
    expect(rolesForMembership("employee").map((r) => r.key)).toEqual(["worker"]);
  });
});
