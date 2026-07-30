/**
 * F1.1 — Observation panel access control (PURE, testable).
 *
 * The panel exposes engine internals and must never be reachable by workers,
 * ordinary supervisors, unauthorised tenant managers or anonymous users.
 */
export type AccessDecision =
  | { allowed: true; reason: "platform_developer" | "platform_owner" | "platform_founder" }
  | { allowed: false; reason: "anonymous" | "not_platform_staff" | "production_without_override" };

export interface AccessInput {
  isAuthenticated: boolean;
  roles: Iterable<string>;
  /** True when running against the production build/host. */
  isProduction: boolean;
  /** Explicit, deliberate override for production inspection. */
  productionOverride?: boolean;
}

const PLATFORM_ROLES: Record<string, "platform_developer" | "platform_owner" | "platform_founder"> = {
  developer: "platform_developer",
  owner: "platform_owner",
  founder: "platform_founder",
};

export function evaluatePanelAccess(input: AccessInput): AccessDecision {
  if (!input.isAuthenticated) return { allowed: false, reason: "anonymous" };

  let granted: AccessDecision["reason"] | null = null;
  for (const role of input.roles) {
    const match = PLATFORM_ROLES[role];
    if (match) {
      granted = match;
      break;
    }
  }
  if (!granted) return { allowed: false, reason: "not_platform_staff" };

  if (input.isProduction && !input.productionOverride) {
    return { allowed: false, reason: "production_without_override" };
  }

  return { allowed: true, reason: granted as "platform_developer" | "platform_owner" | "platform_founder" };
}

export const ACCESS_DENIED_COPY: Record<
  Extract<AccessDecision, { allowed: false }>["reason"],
  string
> = {
  anonymous: "Necesitas iniciar sesión para acceder a esta herramienta interna.",
  not_platform_staff:
    "Esta herramienta de diagnóstico está restringida a personal de plataforma autorizado.",
  production_without_override:
    "El panel de observación está deshabilitado en producción. Requiere un override explícito de plataforma.",
};
