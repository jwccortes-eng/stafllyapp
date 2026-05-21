/**
 * Worker Update Center — static requirement catalog (Phase 1).
 *
 * No DB, no enforcement. Pure data describing WHAT the system asks workers
 * to complete. Future phases will move this into `worker_profile_requirements`
 * and add per-tenant overrides.
 *
 * Categories and levels mirror `.lovable/plan.md` § 1.
 */

export type RequirementCategory =
  | "identity"
  | "contact"
  | "address"
  | "emergency_contact"
  | "work_profile"
  | "availability"
  | "documents_core"
  | "documents_role"
  | "driver_vehicle"
  | "captain_readiness"
  | "portal_access"
  | "compliance_ack"
  | "payroll_readiness";

export type RequirementLevel =
  | "required_immediately"
  | "before_accepting_shifts"
  | "before_assignment"
  | "before_payroll"
  | "drivers_only"
  | "captains_only"
  | "recommended"
  | "optional"
  | "admin_only_legacy";

export type RestrictableScope =
  | "accept_new_shifts"
  | "claim_open_shifts"
  | "be_auto_assigned"
  | "clock_in_doc_sensitive"
  | "take_captain_role"
  | "take_driver_role";

export interface RequirementDef {
  /** Stable machine key, used in URLs, audit events, and future DB rows. */
  key: string;
  category: RequirementCategory;
  level: RequirementLevel;
  /** Short Spanish label shown to workers. */
  label: string;
  /** One-line Spanish explanation. */
  description: string;
  /** Icon hint — caller maps to a lucide-react icon. */
  icon:
    | "user"
    | "phone"
    | "mail"
    | "map-pin"
    | "heart-pulse"
    | "briefcase"
    | "calendar"
    | "file-text"
    | "car"
    | "shield-check"
    | "key"
    | "scale";
  /** Scopes restricted when overdue (Phase 4+; UI-hint only in Phase 1). */
  blocksScope: RestrictableScope[];
  /** Deep-link the worker uses to resolve this requirement. */
  resolveHref: string;
  /** Action label shown on the checklist row CTA. */
  ctaLabel: string;
}

/**
 * Phase 1 catalog. Conservative subset — only requirements that can be
 * resolved with existing portal flows. Driver/captain/comp-ack expand later.
 */
export const REQUIREMENT_CATALOG: RequirementDef[] = [
  // ── Identity ────────────────────────────────────────────────
  {
    key: "identity.legal_name",
    category: "identity",
    level: "before_assignment",
    label: "Nombre legal completo",
    description: "Como aparece en tu ID de gobierno.",
    icon: "user",
    blocksScope: ["be_auto_assigned"],
    resolveHref: "/portal/profile",
    ctaLabel: "Actualizar",
  },
  {
    key: "identity.date_of_birth",
    category: "identity",
    level: "before_assignment",
    label: "Fecha de nacimiento",
    description: "Necesaria para cumplir con regulaciones laborales.",
    icon: "user",
    blocksScope: ["be_auto_assigned"],
    resolveHref: "/portal/profile",
    ctaLabel: "Actualizar",
  },
  {
    key: "identity.ssn_last4",
    category: "identity",
    level: "before_payroll",
    label: "Últimos 4 del Social Security",
    description: "Solo los últimos 4 dígitos. Nunca pedimos el SSN completo.",
    icon: "shield-check",
    blocksScope: [],
    resolveHref: "/portal/profile",
    ctaLabel: "Actualizar",
  },

  // ── Contact ─────────────────────────────────────────────────
  {
    key: "contact.phone",
    category: "contact",
    level: "required_immediately",
    label: "Teléfono",
    description: "Usamos tu teléfono para avisos urgentes de turnos.",
    icon: "phone",
    blocksScope: ["claim_open_shifts", "accept_new_shifts"],
    resolveHref: "/portal/profile",
    ctaLabel: "Actualizar",
  },
  {
    key: "contact.email",
    category: "contact",
    level: "required_immediately",
    label: "Correo electrónico",
    description: "Para confirmaciones de pago y documentos.",
    icon: "mail",
    blocksScope: [],
    resolveHref: "/portal/profile",
    ctaLabel: "Actualizar",
  },

  // ── Address ─────────────────────────────────────────────────
  {
    key: "address.full",
    category: "address",
    level: "before_payroll",
    label: "Dirección completa",
    description: "Calle, ciudad, estado y código postal.",
    icon: "map-pin",
    blocksScope: [],
    resolveHref: "/portal/profile",
    ctaLabel: "Actualizar",
  },

  // ── Emergency contact ───────────────────────────────────────
  {
    key: "emergency.contact",
    category: "emergency_contact",
    level: "before_assignment",
    label: "Contacto de emergencia",
    description: "Nombre y teléfono de una persona a quien podamos llamar.",
    icon: "heart-pulse",
    blocksScope: ["be_auto_assigned"],
    resolveHref: "/portal/profile",
    ctaLabel: "Agregar",
  },

  // ── Portal access ───────────────────────────────────────────
  {
    key: "portal.photo",
    category: "portal_access",
    level: "required_immediately",
    label: "Foto de perfil",
    description: "Usada para reconocimiento en operación.",
    icon: "user",
    blocksScope: [],
    resolveHref: "/portal/profile",
    ctaLabel: "Subir foto",
  },

  // ── Documents core ──────────────────────────────────────────
  {
    key: "documents.w9",
    category: "documents_core",
    level: "before_payroll",
    label: "W-9",
    description: "Necesario para procesar pagos como contratista 1099.",
    icon: "file-text",
    blocksScope: [],
    resolveHref: "/portal/documents",
    ctaLabel: "Subir documento",
  },
  {
    key: "documents.id",
    category: "documents_core",
    level: "before_assignment",
    label: "Identificación oficial",
    description: "Licencia, pasaporte o ID estatal.",
    icon: "file-text",
    blocksScope: ["be_auto_assigned"],
    resolveHref: "/portal/documents",
    ctaLabel: "Subir documento",
  },

  // ── Driver/vehicle ──────────────────────────────────────────
  {
    key: "driver.license",
    category: "driver_vehicle",
    level: "drivers_only",
    label: "Licencia de conducir",
    description: "Requerida solo si vas a manejar para la empresa.",
    icon: "car",
    blocksScope: ["take_driver_role"],
    resolveHref: "/portal/documents",
    ctaLabel: "Subir licencia",
  },
];

export const CATEGORY_LABELS: Record<RequirementCategory, string> = {
  identity: "Identidad",
  contact: "Contacto",
  address: "Dirección",
  emergency_contact: "Contacto de emergencia",
  work_profile: "Perfil de trabajo",
  availability: "Disponibilidad",
  documents_core: "Documentos básicos",
  documents_role: "Documentos por rol",
  driver_vehicle: "Conductor / vehículo",
  captain_readiness: "Capitán",
  portal_access: "Acceso al portal",
  compliance_ack: "Acuerdos de cumplimiento",
  payroll_readiness: "Listo para pago",
};

export const LEVEL_LABELS: Record<RequirementLevel, string> = {
  required_immediately: "Requerido ya",
  before_accepting_shifts: "Antes de aceptar turnos",
  before_assignment: "Antes de ser asignado",
  before_payroll: "Antes del pago",
  drivers_only: "Solo conductores",
  captains_only: "Solo capitanes",
  recommended: "Recomendado",
  optional: "Opcional",
  admin_only_legacy: "Solo admin",
};

export function getRequirement(key: string): RequirementDef | undefined {
  return REQUIREMENT_CATALOG.find((r) => r.key === key);
}
