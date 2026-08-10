/**
 * PERSON STATUS — ÚNICA fuente de verdad de las 4 dimensiones de una persona.
 * ---------------------------------------------------------------------------
 * Prohibido mezclar dimensiones en un solo badge o inferir una a partir de otra.
 *
 *   1. IDENTITY     → quién es (Person Truth / Worker Identity)
 *   2. PORTAL       → si puede entrar al portal (resolver canónico de portal)
 *   3. COMPLIANCE   → papeles (documentos / cumplimiento)
 *   4. ASSIGNABILITY→ ¿se puede asignar HOY a un Servicio? (y por qué no)
 *
 * Reglas clave:
 *   - Portal activo NO implica asignable.
 *   - Missing docs NO bloquea por sí solo (solo advierte, salvo política real).
 *   - Invited NO implica sin acceso ni bloqueo.
 *   - Possible duplicate solo bloquea si está sin resolver; siempre se explica.
 *
 * Lectura pura. No escribe, no fusiona, no borra, no toca payroll ni RLS.
 */
import {
  resolvePortalStatus,
  type PortalStatusEmployeeLike,
  type PortalStatusInvitationLike,
  type PortalStatusResult,
} from "@/lib/portal/portal-status";
import {
  classifyWorkerAssignability,
  type AssignableCandidate,
} from "@/lib/shifts/assignable-workers";
import { isPendingIdentity, isPlaceholderWorker } from "@/lib/employee-identity";

/* ────────────────── 1 · IDENTITY ────────────────── */

export type IdentityDimension =
  | "VERIFIED"
  | "PENDING_IDENTITY"
  | "POSSIBLE_DUPLICATE"
  | "HISTORICAL"
  | "REVIEW_REQUIRED";

/* ────────────────── 2 · PORTAL ────────────────── */

export type PortalDimension =
  | "PORTAL_ACTIVE"
  | "INVITED"
  | "ACCESS_REPAIR_REQUIRED"
  | "NO_PORTAL";

/* ────────────────── 3 · COMPLIANCE ────────────────── */

export type ComplianceDimension =
  | "COMPLIANT"
  | "MISSING_DOCS"
  | "EXPIRED_DOCS"
  | "REVIEW_REQUIRED"
  | "UNKNOWN";

/* ────────────────── 4 · ASSIGNABILITY ────────────────── */

export type AssignabilityDimension =
  | "ASSIGNABLE"
  | "ASSIGNABLE_WITH_WARNING"
  | "BLOCKED";

export type StatusTone = "ok" | "info" | "warn" | "critical" | "muted";

export interface PersonStatusInput
  extends AssignableCandidate,
    PortalStatusEmployeeLike {
  id?: string;
  deleted_at?: string | null;
  /** Grupo de posible duplicado sin resolver (identity quality). */
  duplicateGroupKey?: string | null;
  duplicateResolved?: boolean | null;
  /** Motivo textual del hint de duplicado, si la superficie lo calcula. */
  duplicateReason?: string | null;
  /** Señales de cumplimiento ya resueltas por la superficie. */
  missingDocuments?: number | null;
  expiredDocuments?: number | null;
  documentsUnderReview?: number | null;
  profileIncomplete?: boolean | null;
  /** Empresa activa vs empresa del registro (cross-tenant). */
  company_id?: string | null;
}

export interface DimensionResult<T extends string> {
  value: T;
  label: string;
  description: string;
  tone: StatusTone;
}

export interface PersonStatus {
  identity: DimensionResult<IdentityDimension>;
  portal: DimensionResult<PortalDimension>;
  compliance: DimensionResult<ComplianceDimension>;
  assignability: DimensionResult<AssignabilityDimension> & {
    /** Razón operativa corta ("posible duplicado pendiente de resolución"). */
    reason: string;
    /** Todos los motivos que bloquean o advierten, en orden de severidad. */
    reasons: string[];
    canAssign: boolean;
  };
  /** Estado del portal completo, por si la superficie necesita el detalle. */
  portalDetail: PortalStatusResult;
}

const IDENTITY_COPY: Record<IdentityDimension, Omit<DimensionResult<IdentityDimension>, "value">> = {
  VERIFIED: { label: "Verificada", description: "Identidad verificada, sin señales pendientes.", tone: "ok" },
  PENDING_IDENTITY: {
    label: "Identidad pendiente",
    description: "Registro sin identidad verificada (placeholder o emergency worker).",
    tone: "warn",
  },
  POSSIBLE_DUPLICATE: {
    label: "Posible duplicado",
    description: "Pertenece a un grupo de posible duplicado sin resolver.",
    tone: "warn",
  },
  HISTORICAL: { label: "Histórico", description: "Registro histórico, no operativo.", tone: "muted" },
  REVIEW_REQUIRED: {
    label: "Requiere revisión",
    description: "Identidad marcada para revisión manual.",
    tone: "warn",
  },
};

const PORTAL_COPY: Record<PortalDimension, Omit<DimensionResult<PortalDimension>, "value">> = {
  PORTAL_ACTIVE: { label: "Portal activo", description: "Cuenta vinculada: puede entrar al portal.", tone: "ok" },
  INVITED: { label: "Invitado", description: "Invitación enviada, aún sin cuenta vinculada.", tone: "info" },
  ACCESS_REPAIR_REQUIRED: {
    label: "Acceso a reparar",
    description: "La invitación falló o fue aceptada sin vincular la cuenta.",
    tone: "warn",
  },
  NO_PORTAL: { label: "Sin portal", description: "No tiene acceso al portal.", tone: "muted" },
};

const COMPLIANCE_COPY: Record<ComplianceDimension, Omit<DimensionResult<ComplianceDimension>, "value">> = {
  COMPLIANT: { label: "Al día", description: "Documentación completa y vigente.", tone: "ok" },
  MISSING_DOCS: { label: "Faltan documentos", description: "Documentos pendientes de entregar.", tone: "warn" },
  EXPIRED_DOCS: { label: "Documentos vencidos", description: "Hay documentos vencidos.", tone: "warn" },
  REVIEW_REQUIRED: { label: "En revisión", description: "Documentos entregados pendientes de revisión.", tone: "info" },
  UNKNOWN: { label: "Sin datos", description: "No hay señales de cumplimiento en esta vista.", tone: "muted" },
};

const ASSIGNABILITY_COPY: Record<
  AssignabilityDimension,
  Omit<DimensionResult<AssignabilityDimension>, "value">
> = {
  ASSIGNABLE: { label: "Asignable", description: "No existe impedimento operativo.", tone: "ok" },
  ASSIGNABLE_WITH_WARNING: {
    label: "Asignable con advertencia",
    description: "Se puede asignar, pero hay pendientes no bloqueantes.",
    tone: "warn",
  },
  BLOCKED: { label: "Bloqueado", description: "No se puede asignar hasta resolver el impedimento.", tone: "critical" },
};

function isUnresolvedDuplicate(e: PersonStatusInput): boolean {
  if (e.duplicateResolved === true) return false;
  return !!e.duplicateGroupKey || !!e.duplicateReason;
}

/** 1 · Identidad — nunca decide asignabilidad por sí sola. */
export function resolveIdentityDimension(e: PersonStatusInput): DimensionResult<IdentityDimension> {
  let value: IdentityDimension = "VERIFIED";
  if ((e.employee_role ?? "").toLowerCase().trim() === "historical") value = "HISTORICAL";
  else if (isPlaceholderWorker(e as never) || isPendingIdentity(e as never)) value = "PENDING_IDENTITY";
  else if (isUnresolvedDuplicate(e)) value = "POSSIBLE_DUPLICATE";
  else if (e.requires_identity_resolution === true) value = "REVIEW_REQUIRED";
  // Un placeholder que además está en grupo de duplicado se explica como duplicado.
  if (value === "PENDING_IDENTITY" && isUnresolvedDuplicate(e)) value = "REVIEW_REQUIRED";
  return { value, ...IDENTITY_COPY[value] };
}

/** 2 · Portal — delega en el resolver canónico y agrupa a 4 valores. */
export function resolvePortalDimension(
  e: PersonStatusInput,
  invitation?: PortalStatusInvitationLike | null,
): { dimension: DimensionResult<PortalDimension>; detail: PortalStatusResult } {
  const detail = resolvePortalStatus(e, invitation);
  let value: PortalDimension;
  switch (detail.status) {
    case "active":
      value = "PORTAL_ACTIVE";
      break;
    case "invited":
      value = "INVITED";
      break;
    case "invite_failed":
    case "activation_unlinked":
      value = "ACCESS_REPAIR_REQUIRED";
      break;
    default:
      value = "NO_PORTAL";
  }
  return {
    dimension: { value, ...PORTAL_COPY[value], description: detail.description || PORTAL_COPY[value].description },
    detail,
  };
}

/** 3 · Cumplimiento — nunca bloquea por sí solo. */
export function resolveComplianceDimension(e: PersonStatusInput): DimensionResult<ComplianceDimension> {
  const missing = e.missingDocuments ?? null;
  const expired = e.expiredDocuments ?? null;
  const review = e.documentsUnderReview ?? null;
  if (missing == null && expired == null && review == null && e.profileIncomplete == null) {
    return { value: "UNKNOWN", ...COMPLIANCE_COPY.UNKNOWN };
  }
  let value: ComplianceDimension = "COMPLIANT";
  if ((expired ?? 0) > 0) value = "EXPIRED_DOCS";
  else if ((missing ?? 0) > 0 || e.profileIncomplete === true) value = "MISSING_DOCS";
  else if ((review ?? 0) > 0) value = "REVIEW_REQUIRED";
  const base = COMPLIANCE_COPY[value];
  const description =
    value === "MISSING_DOCS" && (missing ?? 0) > 0
      ? `Faltan ${missing} documento(s) requeridos.`
      : value === "EXPIRED_DOCS" && (expired ?? 0) > 0
        ? `${expired} documento(s) vencidos.`
        : base.description;
  return { value, ...base, description };
}

/**
 * 4 · Asignabilidad — la única dimensión que responde
 * "¿se puede asignar esta persona a un Servicio ahora?".
 */
export function resolveAssignabilityDimension(
  e: PersonStatusInput,
  ctx: {
    identity: DimensionResult<IdentityDimension>;
    portal: DimensionResult<PortalDimension>;
    compliance: DimensionResult<ComplianceDimension>;
    /** Empresa activa: si no coincide con `company_id`, es cross-tenant. */
    activeCompanyId?: string | null;
    /** Restricción operativa real ya calculada (conflicto, no disponible). */
    operationalBlockReason?: string | null;
    /** Advertencia operativa no bloqueante (falta foto, etc.). */
    operationalWarning?: string | null;
  },
): PersonStatus["assignability"] {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (ctx.activeCompanyId && e.company_id && e.company_id !== ctx.activeCompanyId)
    blocking.push("pertenece a otra empresa (cross-tenant)");

  const verdict = classifyWorkerAssignability(e);
  if (!verdict.assignable) {
    if (verdict.bucket === "inactive") blocking.push("registro inactivo o archivado");
    else if (verdict.bucket === "placeholder") blocking.push("identidad pendiente sin verificar");
    else if (verdict.bucket === "historical") blocking.push("registro histórico");
    else if (verdict.bucket === "pending_approval") blocking.push("pendiente de aprobación");
  }

  if (isUnresolvedDuplicate(e)) blocking.push("posible duplicado pendiente de resolución");
  if (ctx.operationalBlockReason) blocking.push(ctx.operationalBlockReason.toLowerCase());

  // Nunca bloquean por sí solos:
  if (ctx.compliance.value === "MISSING_DOCS") warnings.push("faltan documentos no bloqueantes");
  if (ctx.compliance.value === "EXPIRED_DOCS") warnings.push("documentos vencidos por renovar");
  if (ctx.compliance.value === "REVIEW_REQUIRED") warnings.push("documentos en revisión");
  if (ctx.portal.value !== "PORTAL_ACTIVE") warnings.push("portal pendiente");
  if (ctx.identity.value === "REVIEW_REQUIRED" && blocking.length === 0)
    warnings.push("identidad marcada para revisión");
  if (ctx.operationalWarning) warnings.push(ctx.operationalWarning.toLowerCase());

  const value: AssignabilityDimension = blocking.length
    ? "BLOCKED"
    : warnings.length
      ? "ASSIGNABLE_WITH_WARNING"
      : "ASSIGNABLE";
  const reasons = blocking.length ? blocking : warnings;
  const base = ASSIGNABILITY_COPY[value];
  return {
    value,
    ...base,
    reason: reasons[0] ?? base.description,
    reasons,
    canAssign: value !== "BLOCKED",
  };
}

/** Resolver único: las 4 dimensiones de una persona, sin mezclarlas. */
export function resolvePersonStatus(
  e: PersonStatusInput | null | undefined,
  opts?: {
    invitation?: PortalStatusInvitationLike | null;
    activeCompanyId?: string | null;
    operationalBlockReason?: string | null;
    operationalWarning?: string | null;
  },
): PersonStatus {
  const input: PersonStatusInput = e ?? {};
  const identity = resolveIdentityDimension(input);
  const { dimension: portal, detail: portalDetail } = resolvePortalDimension(input, opts?.invitation);
  const compliance = resolveComplianceDimension(input);
  const assignability = resolveAssignabilityDimension(input, {
    identity,
    portal,
    compliance,
    activeCompanyId: opts?.activeCompanyId,
    operationalBlockReason: opts?.operationalBlockReason,
    operationalWarning: opts?.operationalWarning,
  });
  return { identity, portal, compliance, assignability, portalDetail };
}

export const PERSON_DIMENSION_LABELS = {
  identity: "Identidad",
  portal: "Portal",
  compliance: "Cumplimiento",
  assignability: "Asignabilidad",
} as const;
