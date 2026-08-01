/**
 * OX-2 — Registro canónico de estados operativos.
 *
 * Única fuente de verdad para: familia semántica, etiqueta en español e icono.
 * Ningún componente debe definir su propio mapa cromático.
 */

export type StatusFamily =
  | "positive"
  | "warning"
  | "critical"
  | "neutral"
  | "progress";

export type StatusKey =
  // Positive
  | "approved"
  | "completed"
  | "ready"
  | "active"
  | "confirmed"
  | "verified"
  | "paid"
  // Warning
  | "pending"
  | "waiting"
  | "documents_pending"
  | "needs_review"
  | "late"
  | "missing"
  | "warning"
  // Critical
  | "blocked"
  | "failed"
  | "cancelled"
  | "no_show"
  | "rejected"
  | "declined"
  | "expired"
  // Neutral
  | "draft"
  | "not_started"
  | "inactive"
  | "informational"
  | "not_applicable"
  | "imported"
  | "closed"
  // Progress
  | "in_progress"
  | "processing"
  | "under_review";

export interface StatusDefinition {
  family: StatusFamily;
  label: string;
  /** Nombre del icono lucide usado por StatusBadge */
  icon: StatusIconName;
}

export type StatusIconName =
  | "check"
  | "clock"
  | "alert"
  | "ban"
  | "x"
  | "info"
  | "loader"
  | "file"
  | "minus"
  | "shield";

export const STATUS_REGISTRY: Record<StatusKey, StatusDefinition> = {
  // ── Positive ──────────────────────────────────────────────
  approved: { family: "positive", label: "Aprobado", icon: "check" },
  completed: { family: "positive", label: "Completado", icon: "check" },
  ready: { family: "positive", label: "Listo", icon: "check" },
  active: { family: "positive", label: "Activo", icon: "check" },
  confirmed: { family: "positive", label: "Confirmado", icon: "check" },
  verified: { family: "positive", label: "Verificado", icon: "shield" },
  paid: { family: "positive", label: "Pagado", icon: "check" },

  // ── Warning ───────────────────────────────────────────────
  pending: { family: "warning", label: "Pendiente", icon: "clock" },
  waiting: { family: "warning", label: "En espera", icon: "clock" },
  documents_pending: { family: "warning", label: "Documentos pendientes", icon: "file" },
  needs_review: { family: "warning", label: "Requiere revisión", icon: "alert" },
  late: { family: "warning", label: "Con retraso", icon: "clock" },
  missing: { family: "warning", label: "Faltan trabajadores", icon: "alert" },
  warning: { family: "warning", label: "Atención", icon: "alert" },

  // ── Critical ──────────────────────────────────────────────
  blocked: { family: "critical", label: "Bloqueado", icon: "ban" },
  failed: { family: "critical", label: "Falló", icon: "x" },
  cancelled: { family: "critical", label: "Cancelado", icon: "x" },
  no_show: { family: "critical", label: "No se presentó", icon: "ban" },
  rejected: { family: "critical", label: "Rechazado", icon: "x" },
  declined: { family: "critical", label: "Declinado", icon: "x" },
  expired: { family: "critical", label: "Expirado", icon: "alert" },

  // ── Neutral ───────────────────────────────────────────────
  draft: { family: "neutral", label: "Borrador", icon: "file" },
  not_started: { family: "neutral", label: "Sin iniciar", icon: "minus" },
  inactive: { family: "neutral", label: "Inactivo", icon: "minus" },
  informational: { family: "neutral", label: "Informativo", icon: "info" },
  not_applicable: { family: "neutral", label: "No aplica", icon: "minus" },
  imported: { family: "neutral", label: "Importado", icon: "file" },
  closed: { family: "neutral", label: "Cerrado", icon: "minus" },

  // ── Progress ──────────────────────────────────────────────
  in_progress: { family: "progress", label: "En curso", icon: "loader" },
  processing: { family: "progress", label: "Procesando", icon: "loader" },
  under_review: { family: "progress", label: "En revisión", icon: "loader" },
};

/** Clases cromáticas por familia. Solo tokens semánticos, válidas en dark mode. */
export const FAMILY_CLASSES: Record<StatusFamily, string> = {
  positive: "bg-status-success-bg text-status-success border-status-success-border",
  warning: "bg-status-warning-bg text-status-warning border-status-warning-border",
  critical: "bg-status-danger-bg text-status-danger border-status-danger-border",
  neutral: "bg-status-neutral-bg text-status-neutral border-status-neutral-border",
  progress: "bg-status-progress-bg text-status-progress border-status-progress-border",
};

/** Color sólido (punto, icono, barra) por familia. */
export const FAMILY_DOT_CLASSES: Record<StatusFamily, string> = {
  positive: "bg-status-success",
  warning: "bg-status-warning",
  critical: "bg-status-danger",
  neutral: "bg-status-neutral",
  progress: "bg-status-progress",
};

/** Alias de estados heredados hacia claves canónicas. */
const ALIASES: Record<string, StatusKey> = {
  aprobado: "approved",
  approve: "approved",
  ok: "approved",
  success: "approved",
  done: "completed",
  finished: "completed",
  complete: "completed",
  open: "active",
  running: "in_progress",
  live: "in_progress",
  scheduled: "confirmed",
  submitted: "under_review",
  review: "under_review",
  in_review: "under_review",
  awaiting: "waiting",
  overdue: "late",
  error: "failed",
  denied: "rejected",
  canceled: "cancelled",
  noshow: "no_show",
  archived: "inactive",
  none: "not_applicable",
};

export function resolveStatusKey(value: string | null | undefined): StatusKey {
  if (!value) return "informational";
  const raw = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (raw in STATUS_REGISTRY) return raw as StatusKey;
  if (raw in ALIASES) return ALIASES[raw];
  return "informational";
}

export function getStatusFamily(value: string | null | undefined): StatusFamily {
  return STATUS_REGISTRY[resolveStatusKey(value)].family;
}
