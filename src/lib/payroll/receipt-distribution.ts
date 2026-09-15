/**
 * Distribución de recibos — PROYECCIÓN OPERATIVA sobre sistemas canónicos.
 *
 * No es un motor de nómina, ni una tabla de identidad, ni un sistema de
 * cuentas/invitaciones/recibos/comunicaciones nuevo. Deriva un único estado
 * por trabajador-periodo a partir de:
 *   - `bulk_pay_statement_preview` (nómina aprobada + elegibilidad + recibo)
 *   - `employees.user_id` vía `resolvePortalStatus` (acceso real al portal)
 *   - la invitación canónica más reciente (ciclo de vida existente)
 *
 * Estados SEPARADOS por contrato (nunca colapsar):
 *   NÓMINA APROBADA ≠ RECIBO LISTO ≠ RECIBO PUBLICADO ≠ TIENE CUENTA ≠ PUEDE VER
 */

import type { BulkPreviewRow } from "@/lib/payroll/bulk-publish";
import {
  resolvePortalStatus,
  type PortalStatusEmployeeLike,
  type PortalStatusInvitationLike,
  type PortalStatus,
} from "@/lib/portal/portal-status";

export type DistributionStatus =
  | "READY_TO_PUBLISH"
  | "BLOCKED_PENDING_ADJUSTMENT"
  | "BLOCKED_PAYROLL_REVIEW"
  | "NEEDS_ACCOUNT"
  | "IDENTITY_REVIEW"
  | "PUBLISHED_VISIBLE"
  | "PUBLISHED_NO_ACCESS"
  | "OTHER_BLOCKER";

export interface DistributionRow {
  employeeId: string;
  workerName: string;
  employerIdentification: string | null;
  amount: number;
  /** Elegible para publicación server-side (readiness === "ready"). */
  eligible: boolean;
  published: boolean;
  portalAccess: boolean;
  portalStatus: PortalStatus;
  portalLabel: string;
  hasPendingInvitation: boolean;
  status: DistributionStatus;
  blocker: string | null;
  hasOverride: boolean;
  pendingCount: number;
  preview: BulkPreviewRow;
}

export const DISTRIBUTION_COPY: Record<
  DistributionStatus,
  { label: string; tone: "success" | "warn" | "critical" | "neutral"; help: string }
> = {
  READY_TO_PUBLISH: {
    label: "Listo para publicar",
    tone: "success",
    help: "Total aprobado disponible y sin bloqueos. Al publicar se congela el total.",
  },
  BLOCKED_PENDING_ADJUSTMENT: {
    label: "Bloqueado por ajustes",
    tone: "critical",
    help: "Tiene ajustes sin aprobar en este periodo. Resuélvelos antes de publicar.",
  },
  BLOCKED_PAYROLL_REVIEW: {
    label: "Revisión de nómina",
    tone: "critical",
    help: "El total del periodo no es calculable todavía.",
  },
  NEEDS_ACCOUNT: {
    label: "Necesita acceso",
    tone: "warn",
    help: "Nómina correcta, pero no tiene cuenta activa: no podría abrir el recibo.",
  },
  IDENTITY_REVIEW: {
    label: "Revisión de identidad",
    tone: "warn",
    help: "La identidad canónica de esta persona necesita evidencia humana.",
  },
  PUBLISHED_VISIBLE: {
    label: "Publicado y visible",
    tone: "success",
    help: "Recibo publicado y con acceso válido en Mis pagos.",
  },
  PUBLISHED_NO_ACCESS: {
    label: "Publicado sin acceso",
    tone: "warn",
    help: "El recibo existe y está congelado, pero el trabajador aún no puede abrirlo.",
  },
  OTHER_BLOCKER: {
    label: "Otro bloqueo",
    tone: "critical",
    help: "Hay una condición que impide publicar de forma segura.",
  },
};

export interface DistributionFilterKey {
  key:
    | "all"
    | "ready"
    | "blocked"
    | "no_account"
    | "identity"
    | "published"
    | "published_no_access";
  label: string;
}

export const DISTRIBUTION_FILTERS: DistributionFilterKey[] = [
  { key: "all", label: "Todos" },
  { key: "ready", label: "Listos para publicar" },
  { key: "blocked", label: "Bloqueados" },
  { key: "no_account", label: "Sin cuenta/acceso" },
  { key: "identity", label: "Revisión de identidad" },
  { key: "published", label: "Publicados" },
  { key: "published_no_access", label: "Publicados sin acceso" },
];

const PENDING_RE = /pendiente|pending|ajuste/i;
const IDENTITY_RE = /identidad|identity|cross-?tenant|empresa|duplicad/i;
const CALC_RE = /total|calcul|base/i;

function classifyBlocker(reason: string | null): DistributionStatus {
  if (!reason) return "OTHER_BLOCKER";
  if (PENDING_RE.test(reason)) return "BLOCKED_PENDING_ADJUSTMENT";
  if (IDENTITY_RE.test(reason)) return "IDENTITY_REVIEW";
  if (CALC_RE.test(reason)) return "BLOCKED_PAYROLL_REVIEW";
  return "OTHER_BLOCKER";
}

export interface DeriveContext {
  employee?: PortalStatusEmployeeLike | null;
  invitation?: PortalStatusInvitationLike | null;
}

/** Derivación pura. Nunca copia estado entre sistemas: solo lo interpreta. */
export function deriveDistributionRow(
  preview: BulkPreviewRow,
  ctx: DeriveContext = {},
): DistributionRow {
  const portal = resolvePortalStatus(ctx.employee ?? { user_id: null }, ctx.invitation ?? null);
  // El acceso real es `employees.user_id`; el preview lo confirma server-side.
  const portalAccess = portal.hasPortalAccess || preview.portal_access;
  const published = preview.readiness === "published";
  const eligible = preview.readiness === "ready";
  const pendingCount = preview.pending_count;

  let status: DistributionStatus;
  if (published) {
    status = portalAccess ? "PUBLISHED_VISIBLE" : "PUBLISHED_NO_ACCESS";
  } else if (preview.readiness === "blocked") {
    status = classifyBlocker(preview.blocking_reason);
    if (status === "BLOCKED_PENDING_ADJUSTMENT" && pendingCount === 0) {
      status = classifyBlocker(preview.blocking_reason?.replace(PENDING_RE, "") ?? null);
    }
  } else if (portal.status === "activation_unlinked") {
    // Invitación aceptada sin cuenta vinculada = señal de identidad, no falta de contacto.
    status = "IDENTITY_REVIEW";
  } else if (!portalAccess) {
    status = "NEEDS_ACCOUNT";
  } else {
    status = "READY_TO_PUBLISH";
  }

  const amount =
    published && preview.published_frozen_total !== null
      ? preview.published_frozen_total
      : preview.frozen_total_preview;

  return {
    employeeId: preview.employee_id,
    workerName: preview.worker_name?.trim() || "Sin nombre",
    employerIdentification: preview.employer_identification,
    amount,
    eligible,
    published,
    portalAccess,
    portalStatus: portal.status,
    portalLabel: portal.label,
    hasPendingInvitation: portal.status === "invited",
    status,
    blocker: preview.blocking_reason,
    hasOverride: preview.has_override,
    pendingCount,
    preview,
  };
}

export interface DistributionSummary {
  approved: number;
  ready: number;
  blocked: number;
  noAccount: number;
  identity: number;
  published: number;
  visible: number;
  publishedNoAccess: number;
  readyTotal: number;
}

export function summarizeDistribution(rows: DistributionRow[]): DistributionSummary {
  const ready = rows.filter((r) => r.status === "READY_TO_PUBLISH");
  const noAccount = rows.filter((r) => r.status === "NEEDS_ACCOUNT");
  return {
    approved: rows.length,
    ready: ready.length,
    blocked: rows.filter(
      (r) =>
        r.status === "BLOCKED_PENDING_ADJUSTMENT" ||
        r.status === "BLOCKED_PAYROLL_REVIEW" ||
        r.status === "OTHER_BLOCKER",
    ).length,
    noAccount: noAccount.length,
    identity: rows.filter((r) => r.status === "IDENTITY_REVIEW").length,
    published: rows.filter((r) => r.published).length,
    visible: rows.filter((r) => r.status === "PUBLISHED_VISIBLE").length,
    publishedNoAccess: rows.filter((r) => r.status === "PUBLISHED_NO_ACCESS").length,
    readyTotal: [...ready, ...noAccount].reduce((s, r) => s + (r.eligible ? r.amount : 0), 0),
  };
}

export function matchesDistributionFilter(
  row: DistributionRow,
  key: DistributionFilterKey["key"],
): boolean {
  switch (key) {
    case "ready":
      return row.status === "READY_TO_PUBLISH";
    case "blocked":
      return (
        row.status === "BLOCKED_PENDING_ADJUSTMENT" ||
        row.status === "BLOCKED_PAYROLL_REVIEW" ||
        row.status === "OTHER_BLOCKER"
      );
    case "no_account":
      return row.status === "NEEDS_ACCOUNT";
    case "identity":
      return row.status === "IDENTITY_REVIEW";
    case "published":
      return row.published;
    case "published_no_access":
      return row.status === "PUBLISHED_NO_ACCESS";
    default:
      return true;
  }
}

/**
 * Señal operativa derivada para el futuro Command Center canónico.
 * No crea workflow nuevo: apunta a esta misma cola filtrada.
 */
export function buildDistributionSignal(
  periodId: string,
  summary: DistributionSummary,
): { key: "PAYROLL_RECEIPTS_PENDING_DISTRIBUTION"; messages: string[]; href: string } | null {
  const messages: string[] = [];
  if (summary.ready > 0) messages.push(`${summary.ready} recibos listos para publicar`);
  if (summary.blocked > 0) messages.push(`${summary.blocked} recibos bloqueados por ajustes`);
  if (summary.noAccount > 0) messages.push(`${summary.noAccount} trabajadores necesitan acceso`);
  if (summary.publishedNoAccess > 0)
    messages.push(`${summary.publishedNoAccess} recibos publicados sin acceso`);
  if (messages.length === 0) return null;
  return {
    key: "PAYROLL_RECEIPTS_PENDING_DISTRIBUTION",
    messages,
    href: `/app/summary?periodId=${periodId}&tab=statements`,
  };
}

/** Rutas exactas de resolución: nunca a un módulo genérico. */
export const distributionRoutes = {
  adjustments: (employeeId: string, periodId: string) =>
    `/app/summary/detail?employeeId=${employeeId}&periodId=${periodId}`,
  receipt: (employeeId: string, periodId: string) =>
    `/app/summary/detail?employeeId=${employeeId}&periodId=${periodId}`,
  identity: (employeeId: string) => `/app/employees/${employeeId}`,
  worker: (employeeId: string) => `/app/employees/${employeeId}`,
};
