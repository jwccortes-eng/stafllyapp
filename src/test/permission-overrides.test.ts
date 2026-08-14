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
  operatingRole: string | null = null,
): AuthorizationInput {
  return {
    globalRoles: new Set<string>(),
    companyRoles: { [companyId]: role },
    operatingRoles: { [companyId]: operatingRole },
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

describe("allowlist por rol operativo — deny by default", () => {
  it("membresía admin SIN rol operativo no autoriza escrituras", () => {
    const i = input("admin", QUALITY);
    expect(evaluatePermission(i, "service.view", QUALITY)).toBe(true); // lectura operativa
    expect(evaluatePermission(i, "service.create", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "payroll.approve", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "users.manage", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "roles.manage", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "company.settings", QUALITY)).toBe(false);
  });

  it("Sebastián (shift_admin): opera servicios, no toca horas ni payroll ni administración", () => {
    const i = input("admin", MYSTAFF, {}, {}, "shift_admin");
    expect(evaluatePermission(i, "service.create", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "service.publish", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "staffing.replace", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "time_entries.adjust", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "payroll.manage", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "payroll.settings", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "users.manage", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "company.settings", MYSTAFF)).toBe(false);
  });

  it("Duván (time_closeout_admin): horas y cierre, nada más", () => {
    const i = input("admin", MYSTAFF, {}, {}, "time_closeout_admin");
    expect(evaluatePermission(i, "time_entries.review", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "time_entries.approve", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "closeout.close_day", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "service.create", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "clients.edit", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "locations.edit", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "payroll.approve", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "roles.manage", MYSTAFF)).toBe(false);
  });

  it("María (payroll_admin): prepara payroll, no opera servicios ni aprueba", () => {
    const i = input("admin", MYSTAFF, {}, {}, "payroll_admin");
    expect(evaluatePermission(i, "payroll.view", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "payroll.manage", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "payroll.approve", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "service.create", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "staffing.assign", MYSTAFF)).toBe(false);
    expect(evaluatePermission(i, "users.manage", MYSTAFF)).toBe(false);
  });

  it("worker: sin acceso administrativo", () => {
    const i = input("employee", QUALITY, {}, {}, null);
    expect(evaluatePermission(i, "service.view", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "attendance.view", QUALITY)).toBe(false);
  });

  it("un rol operativo no aísla entre compañías", () => {
    const i: AuthorizationInput = {
      globalRoles: new Set<string>(),
      companyRoles: { [MYSTAFF]: "admin" },
      operatingRoles: { [MYSTAFF]: "shift_admin" },
      actionPermissions: [],
      modulePermissions: [],
    };
    expect(evaluatePermission(i, "service.create", MYSTAFF)).toBe(true);
    expect(evaluatePermission(i, "service.create", QUALITY)).toBe(false);
  });

  it("overrides de otra compañía (o placeholder) no autorizan aquí", () => {
    const i: AuthorizationInput = {
      globalRoles: new Set<string>(),
      companyRoles: { [QUALITY]: "admin" },
      operatingRoles: { [QUALITY]: "time_closeout_admin" },
      actionPermissions: [
        { action: "crear_turno", company_id: "00000000-0000-0000-0000-000000000001", granted: true },
        { action: "crear_turno", company_id: null, granted: true },
      ],
      modulePermissions: [
        { module: "shifts", company_id: null, can_view: true, can_edit: true, can_delete: true },
      ],
    };
    expect(evaluatePermission(i, "service.create", QUALITY)).toBe(false);
  });

  it("override positivo de la compañía real sí concede", () => {
    const d = applyToggle(EMPTY_DRAFT, spec("service.create"), true);
    const i = input("admin", QUALITY, d.actions, d.modules, "time_closeout_admin");
    expect(evaluatePermission(i, "service.create", QUALITY)).toBe(true);
  });

  it("override negativo retira un permiso del rol", () => {
    const d = applyToggle(EMPTY_DRAFT, spec("service.publish"), false);
    const i = input("admin", QUALITY, d.actions, d.modules, "shift_admin");
    expect(evaluatePermission(i, "service.publish", QUALITY)).toBe(false);
  });

  it("ningún override puede conceder users/roles/company.settings a un no-dueño", () => {
    let d = applyToggle(EMPTY_DRAFT, spec("company.settings"), true);
    d = applyToggle(d, spec("payroll.settings"), true);
    const i = input("admin", QUALITY, d.actions, d.modules, "shift_admin");
    expect(evaluatePermission(i, "company.settings", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "users.manage", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "roles.manage", QUALITY)).toBe(false);
    // payroll.settings sí es delegable por override
    expect(evaluatePermission(i, "payroll.settings", QUALITY)).toBe(true);
  });
});

describe("dueños y plataforma", () => {
  it("Owner: permisos críticos protegidos", () => {
    const d = applyToggle(EMPTY_DRAFT, spec("company.settings"), false);
    const i = input("company_owner", QUALITY, d.actions, d.modules);
    expect(evaluatePermission(i, "company.settings", QUALITY)).toBe(true);
    expect(evaluatePermission(i, "roles.manage", QUALITY)).toBe(true);
    expect(evaluatePermission(i, "users.manage", QUALITY)).toBe(true);
    expect(isProtected("company_owner", spec("company.settings"))).toBe(true);
    expect(isProtected("admin", spec("company.settings"))).toBe(false);
  });

  it("Owner: acceso total por defecto y restringible en permisos no críticos", () => {
    expect(evaluatePermission(input("company_owner", QUALITY), "payroll.approve", QUALITY)).toBe(true);
    const d = applyToggle(EMPTY_DRAFT, spec("payroll.export"), false);
    const i = input("company_owner", QUALITY, d.actions, d.modules);
    expect(evaluatePermission(i, "payroll.export", QUALITY)).toBe(false);
  });

  it("Owner de una compañía no manda en otra", () => {
    const i = input("company_owner", QUALITY);
    expect(evaluatePermission(i, "company.settings", MYSTAFF)).toBe(false);
  });

  it("Staff de plataforma no es restringible por compañía", () => {
    const d = applyToggle(EMPTY_DRAFT, spec("payroll.approve"), false);
    const i: AuthorizationInput = {
      ...input("admin", QUALITY, d.actions, d.modules),
      globalRoles: new Set(["developer"]),
    };
    expect(evaluatePermission(i, "payroll.approve", QUALITY)).toBe(true);
  });

  it("el rol global 'admin' NO concede acceso a una compañía", () => {
    const i: AuthorizationInput = {
      globalRoles: new Set(["admin"]),
      companyRoles: {},
      operatingRoles: {},
      actionPermissions: [],
      modulePermissions: [],
    };
    expect(evaluatePermission(i, "service.view", QUALITY)).toBe(false);
    expect(evaluatePermission(i, "users.manage", QUALITY)).toBe(false);
  });
});
