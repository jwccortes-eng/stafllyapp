/**
 * OX-4.5 — Modelo puro del Context Switcher.
 *
 * Un único modelo compartido por mobile y desktop. No hace fetch, no toca
 * React, no decide permisos por su cuenta: recibe los permisos ya resueltos
 * por `useAuth` y se comporta fail-closed cuando no están confirmados.
 *
 * Nunca autoriza nada: si el backend no dio acceso, aquí no aparece.
 */
import {
  classifyCompany,
  getCompanyBadges,
  isCompanyOperable,
  GROUP_LABELS,
  type CompanyGroup,
} from "@/lib/company-governance";

export type ContextMode = "admin" | "employee";

export interface ContextCompanyInput {
  id: string;
  name: string;
  logo_url?: string | null;
  brand_color?: string | null;
  status?: string | null;
  source?: string | null;
  is_test?: boolean | null;
  is_demo?: boolean | null;
}

export interface ContextCompanyOption {
  id: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  /** Rol real del usuario en ESA compañía. Nunca se hereda de otra. */
  roleLabel: string | null;
  badges: { label: string; tone: string }[];
  /** Falso = el backend no permite operar ese tenant. CTA deshabilitada. */
  operable: boolean;
  isActive: boolean;
  /** Motivo humano cuando no es operable. */
  blockedReason: string | null;
}

export interface ContextCompanyGroup {
  group: CompanyGroup;
  label: string;
  companies: ContextCompanyOption[];
}

export interface ContextModeOption {
  mode: ContextMode;
  label: string;
  description: string;
  /** Sólo true si el backend confirmó el acceso para la compañía activa. */
  available: boolean;
  /** Por qué no está disponible. Se muestra, no se oculta en silencio. */
  unavailableReason: string | null;
  isActive: boolean;
}

export type ContextTransitionKind =
  | "idle"
  | "switching_company"
  | "switching_mode"
  | "success"
  | "error"
  | "no_access"
  | "offline";

export interface ContextTransition {
  kind: ContextTransitionKind;
  /** Frase en curso o resultado. Nunca vacía salvo en idle. */
  message: string | null;
  /** Qué pasó y qué sigue, cuando el cambio terminó o falló. */
  detail: string | null;
  retryable: boolean;
}

export interface ContextSwitcherModel {
  /** Identidad visible del contexto activo. Siempre presente. */
  companyLabel: string;
  companyId: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  isGlobalMode: boolean;
  /** Modo activo ya verificado contra permisos. */
  modeLabel: string;
  activeMode: ContextMode;
  /** Verdadero mientras los permisos no estén confirmados: fail-closed. */
  permissionsPending: boolean;
  groups: ContextCompanyGroup[];
  modes: ContextModeOption[];
  showCompanySearch: boolean;
  canSwitchCompany: boolean;
  canSwitchMode: boolean;
  transition: ContextTransition;
  /** Etiqueta accesible completa del trigger. */
  ariaLabel: string;
}

export interface ContextSwitcherInput {
  companies: ContextCompanyInput[];
  selectedCompanyId: string | null;
  isGlobalMode: boolean;
  canUseGlobalMode: boolean;
  isDeveloper: boolean;
  /** role por compañía, tal como lo devuelve `company_users`. */
  companyRoles: Record<string, string>;
  activeMode: ContextMode;
  /** Permisos ya resueltos para la compañía ACTIVA. */
  canAccessAdmin: boolean;
  canAccessPortal: boolean;
  /** Falso mientras auth aún resuelve: la UI queda fail-closed. */
  permissionsResolved: boolean;
  search?: string;
  switchState?: "idle" | "switching" | "error";
  switchError?: string | null;
  /** Cambio de modo en curso, gestionado por la UI. */
  modeSwitching?: ContextMode | null;
  /** Confirmación terminal del último cambio completado. */
  lastCompleted?: { kind: "company" | "mode"; label: string } | null;
  online?: boolean;
}

export const ROLE_LABELS: Record<string, string> = {
  developer: "Dev",
  owner: "Owner",
  company_owner: "Company Owner",
  admin: "Administrador",
  manager: "Manager",
  supervisor: "Supervisor",
  employee: "Empleado",
};

export const MODE_LABEL: Record<ContextMode, string> = {
  admin: "Administrador",
  employee: "Portal Worker",
};

const MODE_DESCRIPTION: Record<ContextMode, string> = {
  admin: "Operación, equipo, horas y validación.",
  employee: "Tus turnos, tus horas y tus pagos.",
};

const GROUP_ORDER: CompanyGroup[] = [
  "production_pilot",
  "test_demo",
  "needs_review",
  "inactive_suspended",
];

function blockedReasonFor(group: CompanyGroup): string {
  if (group === "inactive_suspended") {
    return "Compañía suspendida o archivada. Solo soporte puede entrar.";
  }
  return "No puedes operar esta compañía.";
}

function buildTransition(input: ContextSwitcherInput): ContextTransition {
  if (input.online === false) {
    return {
      kind: "offline",
      message: "Se perdió la conexión.",
      detail: "Sigues en el contexto actual. Reintenta cuando vuelva la red.",
      retryable: true,
    };
  }
  if (input.switchState === "switching") {
    return {
      kind: "switching_company",
      message: "Cambiando compañía…",
      detail: "Estamos limpiando los datos de la compañía anterior.",
      retryable: false,
    };
  }
  if (input.modeSwitching) {
    return {
      kind: "switching_mode",
      message: `Cambiando a modo ${MODE_LABEL[input.modeSwitching]}…`,
      detail: "Mantenemos tu compañía activa y tu sesión.",
      retryable: false,
    };
  }
  if (input.switchState === "error") {
    const noAccess = (input.switchError ?? "").toLowerCase().includes("acceso");
    return {
      kind: noAccess ? "no_access" : "error",
      message: input.switchError ?? "No pudimos cambiar de compañía.",
      detail: "Sigues en la compañía anterior. No se mezclaron datos.",
      retryable: !noAccess,
    };
  }
  if (input.lastCompleted) {
    return {
      kind: "success",
      message: "Cambio completado.",
      detail:
        input.lastCompleted.kind === "company"
          ? `Ahora operas en ${input.lastCompleted.label}.`
          : `Ahora estás en modo ${input.lastCompleted.label}.`,
      retryable: false,
    };
  }
  return { kind: "idle", message: null, detail: null, retryable: false };
}

export function buildContextSwitcherModel(
  input: ContextSwitcherInput,
): ContextSwitcherModel {
  const permissionsPending = !input.permissionsResolved;
  const active =
    input.companies.find((c) => c.id === input.selectedCompanyId) ?? null;

  const query = (input.search ?? "").trim().toLowerCase();
  const filtered = query
    ? input.companies.filter((c) => c.name.toLowerCase().includes(query))
    : input.companies;

  const grouped = new Map<CompanyGroup, ContextCompanyOption[]>();
  for (const company of filtered) {
    const group = classifyCompany(company as never);
    const operable = isCompanyOperable(company as never, input.isDeveloper);
    const role = input.companyRoles[company.id];
    const option: ContextCompanyOption = {
      id: company.id,
      name: company.name,
      logoUrl: company.logo_url ?? null,
      brandColor: company.brand_color ?? null,
      roleLabel: role ? ROLE_LABELS[role] ?? role : null,
      badges: getCompanyBadges(company as never).map((b) => ({
        label: b.label,
        tone: b.tone,
      })),
      operable,
      isActive: company.id === input.selectedCompanyId,
      blockedReason: operable ? null : blockedReasonFor(group),
    };
    const bucket = grouped.get(group);
    if (bucket) bucket.push(option);
    else grouped.set(group, [option]);
  }

  const groups: ContextCompanyGroup[] = GROUP_ORDER.filter((g) =>
    (grouped.get(g) ?? []).length > 0,
  ).map((g) => ({
    group: g,
    label: GROUP_LABELS[g],
    companies: grouped.get(g) ?? [],
  }));

  // Fail-closed: sin permisos confirmados no se ofrece ningún modo.
  const adminAvailable = input.permissionsResolved && input.canAccessAdmin;
  const portalAvailable = input.permissionsResolved && input.canAccessPortal;

  const pendingReason = "Estamos verificando tus permisos en esta compañía.";
  const modes: ContextModeOption[] = [
    {
      mode: "admin",
      label: MODE_LABEL.admin,
      description: MODE_DESCRIPTION.admin,
      available: adminAvailable,
      unavailableReason: adminAvailable
        ? null
        : permissionsPending
          ? pendingReason
          : "No tienes acceso administrativo en esta compañía.",
      isActive: input.activeMode === "admin",
    },
    {
      mode: "employee",
      label: MODE_LABEL.employee,
      description: MODE_DESCRIPTION.employee,
      available: portalAvailable,
      unavailableReason: portalAvailable
        ? null
        : permissionsPending
          ? pendingReason
          : "No tienes un perfil de worker en esta compañía.",
      isActive: input.activeMode === "employee",
    },
  ];

  const companyLabel = input.isGlobalMode
    ? "Vista Global"
    : active?.name ?? "Sin compañía activa";

  const availableModes = modes.filter((m) => m.available);

  return {
    companyLabel,
    companyId: input.selectedCompanyId,
    logoUrl: active?.logo_url ?? null,
    brandColor: active?.brand_color ?? null,
    isGlobalMode: input.isGlobalMode,
    modeLabel: MODE_LABEL[input.activeMode],
    activeMode: input.activeMode,
    permissionsPending,
    groups,
    modes,
    showCompanySearch: input.companies.length > 4,
    canSwitchCompany: input.companies.length > 1 || input.canUseGlobalMode,
    canSwitchMode: availableModes.length > 1,
    transition: buildTransition(input),
    ariaLabel: `Contexto activo: ${companyLabel}, modo ${MODE_LABEL[input.activeMode]}. Abrir selector de compañía y modo.`,
  };
}
