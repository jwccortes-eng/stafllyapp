/**
 * OAI F1 — staff panel access control (PURE, testable).
 *
 * Four independent conditions must all hold. Being a generic company admin is
 * NOT sufficient.
 */
export type OaiAccessReason =
  | "anonymous"
  | "not_platform_staff"
  | "not_in_allowlist"
  | "panel_flag_off"
  | "observation_off"
  | "company_not_observed"
  | "production_without_override";

export type OaiAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: OaiAccessReason };

export interface OaiAccessInput {
  isAuthenticated: boolean;
  roles: Iterable<string>;
  /** Explicit staff allowlist of user ids. Empty list denies everyone. */
  staffAllowlist: readonly string[];
  userId: string | null;
  panelEnabled: boolean;
  observationEnabled: boolean;
  companyObserved: boolean;
  isProduction: boolean;
  productionOverride?: boolean;
}

const PLATFORM_ROLES = new Set(["developer", "owner", "founder"]);

export function evaluateOaiPanelAccess(input: OaiAccessInput): OaiAccessDecision {
  if (!input.isAuthenticated || !input.userId) {
    return { allowed: false, reason: "anonymous" };
  }

  let isStaff = false;
  for (const role of input.roles) {
    if (PLATFORM_ROLES.has(role)) {
      isStaff = true;
      break;
    }
  }
  if (!isStaff) return { allowed: false, reason: "not_platform_staff" };

  if (!input.staffAllowlist.includes(input.userId)) {
    return { allowed: false, reason: "not_in_allowlist" };
  }

  if (input.isProduction && !input.productionOverride) {
    return { allowed: false, reason: "production_without_override" };
  }
  if (!input.panelEnabled) return { allowed: false, reason: "panel_flag_off" };
  if (!input.observationEnabled) return { allowed: false, reason: "observation_off" };
  if (!input.companyObserved) return { allowed: false, reason: "company_not_observed" };

  return { allowed: true };
}

export const OAI_ACCESS_DENIED_COPY: Record<OaiAccessReason, string> = {
  anonymous: "Necesitas iniciar sesión para acceder a esta herramienta interna.",
  not_platform_staff: "Restringido a personal de plataforma autorizado.",
  not_in_allowlist: "Tu usuario no está en la allowlist explícita de OAI.",
  panel_flag_off: "El panel de observación OAI está deshabilitado.",
  observation_off: "El modo observación OAI está apagado.",
  company_not_observed: "Esta compañía no está habilitada para observación OAI.",
  production_without_override:
    "El panel OAI está deshabilitado en producción. Requiere un override explícito.",
};
