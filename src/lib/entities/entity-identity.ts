/**
 * UNIFIED ENTITY DESIGN SYSTEM — capa canónica de identidad visual.
 *
 * Módulo PURO (sin React, sin red). Define:
 *  - Los tipos de entidad del ecosistema y su prefijo de pasaporte.
 *  - La referencia humana estable (ST-/CL-/VN-/PT-). Nunca UUID.
 *  - El color de estado del borde del avatar: getEntityStatusColor().
 *
 * REGLAS DURAS
 *  - Ningún módulo define su propio mapa cromático de entidades.
 *  - No se inventan colores nuevos: sólo tokens semánticos existentes.
 *  - No lee ni escribe datos: sólo interpreta lo que recibe.
 */

export type EntityKind = "worker" | "client" | "venue" | "partner";

/** Prefijo oficial del pasaporte por tipo de entidad. */
export const ENTITY_PREFIX: Record<EntityKind, string> = {
  worker: "ST",
  client: "CL",
  venue: "VN",
  partner: "PT",
};

export const ENTITY_LABEL: Record<EntityKind, string> = {
  worker: "Trabajador",
  client: "Cliente",
  venue: "Lugar",
  partner: "Partner",
};

/** Hash estable (FNV-1a) para derivar una referencia legible desde un id opaco. */
function stableHash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface EntityRefInput {
  /** Código oficial ya persistido (client_code, etc.). Tiene prioridad. */
  code?: string | null;
  /** Identificador interno. Sólo se usa para derivar una referencia legible. */
  id?: string | null;
  /** Número operativo legible ya existente (p. ej. employer_identification). */
  number?: string | number | null;
}

/**
 * Referencia humana del pasaporte: `ST-00124`, `CL-00084`, `VN-00142`, `PT-00008`.
 * Nunca devuelve un UUID. Si no hay código ni id, devuelve "—".
 */
export function formatEntityRef(kind: EntityKind, input: EntityRefInput): string {
  const prefix = ENTITY_PREFIX[kind];

  const code = (input.code ?? "").trim();
  if (code) {
    // Ya viene con prefijo oficial → normaliza mayúsculas.
    if (/^[A-Za-z]{2}-\d+$/.test(code)) return code.toUpperCase();
    const digits = code.replace(/\D/g, "");
    if (digits) return `${prefix}-${digits.padStart(5, "0")}`;
  }

  const num = input.number != null ? String(input.number).replace(/\D/g, "") : "";
  if (num) return `${prefix}-${num.padStart(5, "0")}`;

  const id = (input.id ?? "").trim();
  if (id) return `${prefix}-${(stableHash(id) % 100000).toString().padStart(5, "0")}`;

  return "—";
}

/* ───────────────────────────── estado del avatar ──────────────────────────── */

/**
 * Estado operativo comunicado por el borde del avatar. No es decorativo.
 *  operational  → verde   · listo para operar
 *  attention    → ámbar   · necesita atención
 *  blocked      → rojo    · bloqueado
 *  assigned     → azul    · asignado hoy
 *  historical   → gris    · histórico / inactivo
 */
export type EntityStatusTone =
  | "operational"
  | "attention"
  | "blocked"
  | "assigned"
  | "historical";

export interface EntityStatusColor {
  /** Anillo del avatar. */
  ring: string;
  /** Punto / icono sólido. */
  dot: string;
  /** Texto del mismo tono. */
  text: string;
  /** Etiqueta legible por defecto. */
  label: string;
}

const STATUS_COLORS: Record<EntityStatusTone, EntityStatusColor> = {
  operational: {
    ring: "ring-status-success/60",
    dot: "bg-status-success",
    text: "text-status-success",
    label: "Operativo",
  },
  attention: {
    ring: "ring-status-warning/70",
    dot: "bg-status-warning",
    text: "text-status-warning",
    label: "Necesita atención",
  },
  blocked: {
    ring: "ring-status-danger/70",
    dot: "bg-status-danger",
    text: "text-status-danger",
    label: "Bloqueado",
  },
  assigned: {
    ring: "ring-status-progress/70",
    dot: "bg-status-progress",
    text: "text-status-progress",
    label: "Asignado hoy",
  },
  historical: {
    ring: "ring-status-neutral/50",
    dot: "bg-status-neutral",
    text: "text-status-neutral",
    label: "Histórico",
  },
};

/** Función canónica de color de estado. Única fuente de verdad. */
export function getEntityStatusColor(
  tone: EntityStatusTone | null | undefined,
): EntityStatusColor {
  return STATUS_COLORS[tone ?? "historical"];
}

/* ──────────────────────────────── badges ─────────────────────────────────── */

/**
 * Jerarquía obligatoria de badges:
 *  critical → rojo  (riesgo de identidad, bloqueado, documento vencido)
 *  warning  → ámbar (foto requerida, documento pendiente, sin contacto)
 *  info     → gris  (portal activo, histórico, driver, supervisor)
 */
export type EntityBadgeTone = "critical" | "warning" | "info";

export const ENTITY_BADGE_CLASSES: Record<EntityBadgeTone, string> = {
  critical: "bg-status-danger-bg text-status-danger border-status-danger-border",
  warning: "bg-status-warning-bg text-status-warning border-status-warning-border",
  info: "bg-status-neutral-bg text-status-neutral border-status-neutral-border",
};

const BADGE_RANK: Record<EntityBadgeTone, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export interface EntityBadgeSpec {
  label: string;
  tone: EntityBadgeTone;
  /** Explicación en tooltip / title. */
  hint?: string;
  key?: string;
}

/** Ordena por jerarquía (críticos → atención → informativos), estable. */
export function sortEntityBadges(badges: EntityBadgeSpec[]): EntityBadgeSpec[] {
  return [...badges].sort((a, b) => BADGE_RANK[a.tone] - BADGE_RANK[b.tone]);
}

/** Iniciales estables para el avatar. */
export function entityInitials(name: string): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
