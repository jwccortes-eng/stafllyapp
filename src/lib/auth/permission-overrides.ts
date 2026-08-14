/**
 * OVERRIDES EXPLÍCITOS DE PERMISOS (estado editable de la consola de accesos).
 *
 * Tres capas distintas, nunca mezcladas:
 *
 *   1. ROLE DEFAULTS   — lo que el rol de compañía concede por sí solo.
 *   2. OVERRIDES       — filas explícitas por (auth_user_id, company_id, permiso).
 *                        Es LO ÚNICO que la consola edita y guarda.
 *   3. EFFECTIVE       — resultado de 1 + 2. Solo lectura (preview).
 *
 * Este módulo modela la capa 2 en el formato que ya existe en la base
 * (`action_permissions` y `module_permissions`, ambos con `company_id`).
 */
import {
  PERMISSION_CATALOG,
  type PermissionSpec,
  type ModuleLevel,
} from "./permission-catalog";
import { PROTECTED_OWNER_PERMISSIONS } from "./permission-resolver";

export type ModuleTriState = { view: boolean; edit: boolean; delete: boolean };
export type ModuleOverrides = Record<string, ModuleTriState>;
export type ActionOverrides = Record<string, boolean>;

export interface OverrideDraft {
  actions: ActionOverrides;
  modules: ModuleOverrides;
}

const EMPTY_MODULE: ModuleTriState = { view: false, edit: false, delete: false };

const pick = (row: ModuleTriState | undefined, level: ModuleLevel): boolean | undefined =>
  row ? (level === "view" ? row.view : level === "edit" ? row.edit : row.delete) : undefined;

/**
 * Valor del override explícito para un permiso.
 * `undefined` = no hay override (hereda del rol).
 */
export function overrideValue(spec: PermissionSpec, draft: OverrideDraft): boolean | undefined {
  // La acción explícita manda sobre el módulo (espejo del resolver y de SQL).
  if (spec.legacyAction && spec.legacyAction in draft.actions) {
    return draft.actions[spec.legacyAction];
  }
  if (spec.legacyModule && spec.legacyLevel) {
    return pick(draft.modules[spec.legacyModule], spec.legacyLevel);
  }
  return undefined;
}

/** Estado que debe mostrar el switch editable (nunca el acceso efectivo). */
export function switchValue(spec: PermissionSpec, draft: OverrideDraft, roleDefault: boolean): boolean {
  const ov = overrideValue(spec, draft);
  return ov === undefined ? roleDefault : ov;
}

/** ¿Este permiso está configurable desde la consola? */
export function isConfigurable(spec: PermissionSpec): boolean {
  return !!spec.legacyAction || !!spec.legacyModule;
}

/**
 * Permisos NO removibles.
 *
 * Un `company_owner` no puede perder la administración de su propia empresa:
 * eso dejaría a la compañía sin dueño operativo y sin forma de recuperarse.
 */
export function isProtected(companyRole: string | null | undefined, spec: PermissionSpec): boolean {
  return companyRole === "company_owner" && PROTECTED_OWNER_PERMISSIONS.has(spec.permission);
}

/** Aplica el cambio de un switch sobre el borrador de overrides (inmutable). */
export function applyToggle(draft: OverrideDraft, spec: PermissionSpec, next: boolean): OverrideDraft {
  const actions: ActionOverrides = { ...draft.actions };
  const modules: ModuleOverrides = { ...draft.modules };

  if (spec.legacyAction) actions[spec.legacyAction] = next;

  if (spec.legacyModule && spec.legacyLevel) {
    const cur = modules[spec.legacyModule] ?? { ...EMPTY_MODULE };
    const updated: ModuleTriState = { ...cur, [spec.legacyLevel]: next };
    // editar / eliminar implican poder ver
    if (next && spec.legacyLevel !== "view") updated.view = true;
    // quitar "ver" retira también editar y eliminar
    if (!next && spec.legacyLevel === "view") {
      updated.edit = false;
      updated.delete = false;
    }
    modules[spec.legacyModule] = updated;
  }

  return { actions, modules };
}

/** Aplica una plantilla de rol como conjunto de overrides explícitos. */
export function applyTemplateToDraft(draft: OverrideDraft, templateActions: string[]): OverrideDraft {
  const granted = new Set(templateActions);
  let next: OverrideDraft = { actions: { ...draft.actions }, modules: { ...draft.modules } };
  for (const spec of PERMISSION_CATALOG) {
    if (!isConfigurable(spec)) continue;
    const on = !!spec.legacyAction && granted.has(spec.legacyAction);
    next = applyToggle(next, spec, on);
  }
  return next;
}

const norm = (draft: OverrideDraft) =>
  JSON.stringify({
    actions: Object.fromEntries(Object.entries(draft.actions).sort(([a], [b]) => a.localeCompare(b))),
    modules: Object.fromEntries(Object.entries(draft.modules).sort(([a], [b]) => a.localeCompare(b))),
  });

/** ¿Hay cambios sin guardar respecto al estado persistido? */
export function isDirty(draft: OverrideDraft, baseline: OverrideDraft): boolean {
  return norm(draft) !== norm(baseline);
}

/** Cuántos permisos del catálogo cambiaron respecto al baseline. */
export function changedPermissions(draft: OverrideDraft, baseline: OverrideDraft): string[] {
  return PERMISSION_CATALOG.filter(
    (spec) => isConfigurable(spec) && overrideValue(spec, draft) !== overrideValue(spec, baseline),
  ).map((spec) => spec.permission);
}

export const EMPTY_DRAFT: OverrideDraft = { actions: {}, modules: {} };
