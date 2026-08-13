import { describe, expect, it } from "vitest";
import {
  evaluatePermission,
  type AuthorizationInput,
} from "@/lib/auth/permission-resolver";
import {
  EMPTY_DRAFT,
  applyToggle,
  isDirty,
  isProtected,
  overrideValue,
  switchValue,
} from "@/lib/auth/permission-overrides";
import { getPermissionSpec } from "@/lib/auth/permission-catalog";

const QUALITY = "11111111-1111-1111-1111-111111111111";
const MYSTAFF = "22222222-2222-2222-2222-222222222222";

const spec = (p: string) => getPermissionSpec(p)!;

function input(
  role: string,
  companyId: string,
  draftActions: Record<string, boolean> = {},
  draftModules: Record<string, { view: boolean; edit: boolean; delete: boolean }> = {},
): AuthorizationInput {
  return {
    globalRoles: new Set<string>(),
    companyRoles: { [companyId]: role },
    actionPermissions: Object.entries(draftActions).map(([action, granted]) => ({
      action,
      company_id: companyId,
      granted,
    })),
    modulePermissions: Object.entries(draftModules).map(([module, v]) => ({
      module,
      company_id: companyId,
      can_view: v.view,
      can_edit: v.edit,
      can_delete: v.delete,
    })),
  };
}

describe("estado editable de overrides", () => {
  it("el switch sigue al borrador, no al acceso efectivo", () => {
    const publish = spec("service.publish");
    let draft = EMPTY_DRAFT;
    expect(switchValue(publish, draft, true)).toBe(true); // hereda del rol
    draft = applyToggle(draft, publish, false);
    expect(switchValue(publish, draft, true)).toBe(false); // no rebota
    expect(overrideValue(publish, draft)).toBe(false);
    expect(isDirty(draft, EMPTY_DRAFT)).toBe(true);
  });

  it("editar implica ver y quitar ver retira editar", () => {
    let draft = applyToggle(EMPTY_DRAFT, spec("service.edit"), true);
    expect(draft.modules.shifts).toEqual({ view: true, edit: true, delete: false });
    draft = applyToggle(draft, spec("service.view"), false);
    expect(draft.modules.shifts).toEqual({ view: false, edit: false, delete: false });
  });
});

describe("QA — casos reales", () => {
  it("Sebastián: sin publish en Quality, con publish en MyStaff", () => {
    const denied = applyToggle(EMPTY_DRAFT, spec("service.publish"), false);
    const quality = input("admin", QUALITY, denied.actions, denied.modules);
    const mystaff = input("admin", MYSTAFF);
    expect(evaluatePermission(quality, "service.publish", QUALITY)).toBe(false);
    expect(evaluatePermission(mystaff, "service.publish", MYSTAFF)).toBe(true);
  });

  it("María: ajusta horas pero no publica", () => {
    let d = applyToggle(EMPTY_DRAFT, spec("time_entries.adjust"), true);
    d = applyToggle(d, spec("service.publish"), false);
    const i = input("manager", QUALITY, d.actions, d.modules);
    expect(evaluatePermission(i, "time_entries.adjust", QUALITY)).toBe(true);
    expect(evaluatePermission(i, "service.publish", QUALITY)).toBe(false);
  });

  it("Duván: cierra día pero no ve payroll", () => {
    let d = applyToggle(EMPTY_DRAFT, spec("closeout.close_day"), true);
    d = applyToggle(d, spec("payroll.view"), false);
    const i = input("manager", QUALITY, d.actions, d.modules);
    expect(evaluatePermission(i, "closeout.close_day", QUALITY)).toBe(true);
    expect(evaluatePermission(i, "payroll.view", QUALITY)).toBe(false);
  });

  it("Admin: el override negativo restringe de verdad", () => {
    const d = applyToggle(EMPTY_DRAFT, spec("payroll.approve"), false);
    const i = input("admin", QUALITY, d.actions, d.modules);
    expect(evaluatePermission(i, "payroll.approve", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "service.create", QUALITY)).toBe(true); // resto intacto
  });

  it("Owner: permisos críticos protegidos", () => {
    const d = applyToggle(EMPTY_DRAFT, spec("company.settings"), false);
    const i = input("company_owner", QUALITY, d.actions, d.modules);
    expect(evaluatePermission(i, "company.settings", QUALITY)).toBe(true);
    expect(evaluatePermission(i, "roles.manage", QUALITY)).toBe(true);
    expect(evaluatePermission(i, "users.manage", QUALITY)).toBe(true);
    expect(isProtected("company_owner", spec("company.settings"))).toBe(true);
    expect(isProtected("admin", spec("company.settings"))).toBe(false);
  });

  it("Owner: sí puede restringirse en permisos no críticos", () => {
    const d = applyToggle(EMPTY_DRAFT, spec("payroll.export"), false);
    const i = input("company_owner", QUALITY, d.actions, d.modules);
    expect(evaluatePermission(i, "payroll.export", QUALITY)).toBe(false);
  });

  it("Staff de plataforma no es restringible por compañía", () => {
    const d = applyToggle(EMPTY_DRAFT, spec("payroll.approve"), false);
    const i: AuthorizationInput = {
      ...input("admin", QUALITY, d.actions, d.modules),
      globalRoles: new Set(["developer"]),
    };
    expect(evaluatePermission(i, "payroll.approve", QUALITY)).toBe(true);
  });
});
