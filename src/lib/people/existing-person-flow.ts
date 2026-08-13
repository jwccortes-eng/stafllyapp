/**
 * P0 — EMERGENCY WORKER · PERSONA EXISTENTE
 * =========================================
 *
 * Antes de crear un trabajador de emergencia SIEMPRE se busca por teléfono.
 * Este módulo es PURO (sin React, sin red): decide qué se puede hacer con las
 * coincidencias encontradas. Nunca escribe, nunca borra, nunca toca constraints.
 *
 * Reglas:
 *   - Coincidencia en la empresa activa  → NO se inserta. Se reutiliza la ficha.
 *   - Coincidencia en otra empresa       → se ofrece MEMBRESÍA, no duplicado de identidad.
 *   - Sin coincidencias                  → recién ahí se permite crear.
 *
 * `employees_phone_company_unique (phone_number, company_id)` se respeta tal cual:
 * el flujo evita el INSERT que lo violaría, en vez de relajar la restricción.
 */

export interface PhoneMatch {
  employee_id: string;
  company_id: string;
  company_name: string | null;
  same_company: boolean;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  is_active: boolean | null;
  portal_access_enabled: boolean | null;
  has_portal_user: boolean | null;
  worker_type: string | null;
  identity_status: string | null;
  merged_into_employee_id: string | null;
}

export type PersonActionKey =
  | "assign_to_service"
  | "reactivate_access"
  | "update_data"
  | "view_profile"
  | "add_membership"
  | "open_canonical";

export type LookupDecision =
  /** Existe en la empresa activa: prohibido insertar. */
  | "reuse_in_company"
  /** Existe en el ecosistema pero no aquí: crear sólo la membresía. */
  | "add_membership"
  /** Sin coincidencias: se permite crear persona nueva. */
  | "create_new";

export interface LookupOutcome {
  decision: LookupDecision;
  sameCompany: PhoneMatch[];
  otherCompanies: PhoneMatch[];
  /** true sólo cuando la creación de una persona nueva está permitida. */
  canCreateNew: boolean;
  headline: string;
  detail: string;
}

/** Dígitos comparables (mismo criterio que `normalize_auth_phone` en la base). */
export function phoneKey(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  while (d.length > 10 && (d[0] === "0" || d[0] === "1")) d = d.slice(1);
  return d || null;
}

/** ¿El teléfono tiene forma suficiente para buscar? */
export function isSearchablePhone(raw: string | null | undefined): boolean {
  const k = phoneKey(raw);
  return !!k && k.length >= 7;
}

export function personDisplayName(m: PhoneMatch): string {
  const name = [m.first_name ?? "", m.last_name ?? ""].join(" ").trim();
  return name || "Persona sin nombre";
}

/** Acciones disponibles para una coincidencia, sin inventar capacidades. */
export function actionsForMatch(m: PhoneMatch): PersonActionKey[] {
  if (m.merged_into_employee_id) return ["open_canonical"];
  if (!m.same_company) return ["add_membership", "view_profile"];
  const actions: PersonActionKey[] = ["assign_to_service"];
  if (m.is_active === false) actions.push("reactivate_access");
  actions.push("update_data", "view_profile");
  return actions;
}

/** Clasifica el resultado de la búsqueda por teléfono. */
export function classifyPhoneMatches(
  matches: PhoneMatch[] | null | undefined,
  opts: { hasPhone: boolean },
): LookupOutcome {
  const list = (matches ?? []).filter((m) => !m.merged_into_employee_id);
  const sameCompany = list.filter((m) => m.same_company);
  const otherCompanies = list.filter((m) => !m.same_company);

  if (sameCompany.length > 0) {
    return {
      decision: "reuse_in_company",
      sameCompany,
      otherCompanies,
      canCreateNew: false,
      headline: "Persona encontrada",
      detail:
        "Ya existe en esta empresa. No se creará un registro nuevo: usa la ficha existente.",
    };
  }

  if (otherCompanies.length > 0) {
    return {
      decision: "add_membership",
      sameCompany,
      otherCompanies,
      canCreateNew: false,
      headline: "Esta persona ya pertenece al ecosistema",
      detail:
        "Está registrada en otra empresa. Puedes agregar su membresía aquí sin duplicar su identidad.",
    };
  }

  return {
    decision: "create_new",
    sameCompany,
    otherCompanies,
    canCreateNew: true,
    headline: opts.hasPhone ? "Sin coincidencias" : "Sin teléfono para verificar",
    detail: opts.hasPhone
      ? "Ese teléfono no está registrado. Puedes crear la persona."
      : "Se registrará como identidad pendiente; deberá resolverse antes de payroll.",
  };
}

export const ACTION_LABELS: Record<PersonActionKey, string> = {
  assign_to_service: "Asignar al servicio actual",
  reactivate_access: "Reactivar acceso",
  update_data: "Actualizar datos",
  view_profile: "Ver ficha",
  add_membership: "Agregar a esta empresa",
  open_canonical: "Ver registro canónico",
};
