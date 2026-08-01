/**
 * OX-4 — Operational Card System (OCS): tokens de superficie.
 *
 * No define colores propios: reutiliza tokens semánticos OX-2
 * y la escala móvil OX-3. Únicamente resuelve densidad y superficie.
 */
import { MT } from "@/lib/mobile/mobile-scale";
import type { StatusFamily } from "@/lib/status/status-registry";

/** Tamaño de contenido de la card. */
export type OcsVariant = "compact" | "standard" | "expanded";
/** Interacción permitida. */
export type OcsMode = "interactive" | "readonly";
/** Densidad objetivo. `auto` = móvil en pantallas pequeñas. */
export type OcsDensity = "auto" | "mobile" | "desktop";

export const OCS_SURFACE =
  "relative w-full rounded-2xl border border-border/50 bg-card text-card-foreground overflow-hidden";

export const OCS_INTERACTIVE =
  "text-left transition-colors duration-200 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.995]";

/** Padding por variante y densidad. */
export const OCS_PADDING: Record<OcsVariant, { mobile: string; desktop: string }> = {
  compact: { mobile: "p-3", desktop: "p-3" },
  standard: { mobile: "p-4", desktop: "p-4" },
  expanded: { mobile: "p-4", desktop: "p-5" },
};

/** Separación vertical entre bloques de la estructura canónica. */
export const OCS_STACK: Record<OcsVariant, string> = {
  compact: "space-y-1.5",
  standard: "space-y-2.5",
  expanded: "space-y-3",
};

/** Tipografía del título por variante (OX-3). */
export const OCS_TITLE: Record<OcsVariant, string> = {
  compact: MT.bodyStrong,
  standard: MT.title,
  expanded: MT.title,
};

/** Rail de acento lateral por familia semántica (OX-2). */
export const OCS_ACCENT: Record<StatusFamily, string> = {
  positive: "bg-status-success",
  warning: "bg-status-warning",
  critical: "bg-status-danger",
  neutral: "bg-status-neutral",
  progress: "bg-status-progress",
};

/** Texto de apoyo (contexto / secundario). */
export const OCS_MUTED = "text-muted-foreground";
