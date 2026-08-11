/**
 * Stafly Design Tokens — DS1A foundation.
 *
 * Single source of truth for cross-surface visual constants.
 * Frontend-only. No logic, no data, no behavior.
 *
 * Usage rules:
 *  - Prefer these tokens over ad-hoc Tailwind strings for page chrome.
 *  - Worker Portal and Admin Mobile must share these (same product, one identity).
 *  - Do NOT inline colors here — keep semantic tokens in index.css / tailwind.config.ts.
 *
 * NOTE: Mirrors values already in `src/components/admin/mobile/mobile-admin-tokens.ts`
 * to guarantee continuity. That file re-exports STAFLY_* aliases below as it migrates.
 */

// ── Layout ──────────────────────────────────────────────────────────────────

/** Standard horizontal page padding for mobile surfaces (worker + admin). */
export const STAFLY_PAGE_PX = "px-5";

/** Bottom-nav safe-area clearance (AdminBottomNav / PortalBottomNav ~64px + safe inset). */
export const STAFLY_BOTTOM_NAV_CLEARANCE =
  "pb-[calc(env(safe-area-inset-bottom,0px)+88px)]";

/** Alias kept for naming parity in DS1A spec. */
export const STAFLY_PAGE_PB = STAFLY_BOTTOM_NAV_CLEARANCE;

/** Inset for sticky-bottom safe areas without the nav clearance (sheets, CTAs). */
export const STAFLY_MOBILE_SAFE_BOTTOM =
  "pb-[calc(env(safe-area-inset-bottom,0px)+12px)]";

// ── Surfaces ────────────────────────────────────────────────────────────────

/** Standard tappable card surface (matches MobileEntityCard / MobileAdminHome). */
export const STAFLY_CARD_BASE =
  "rounded-2xl border border-border/50 bg-card shadow-xs";

/** Softer card variant for nested or secondary surfaces. */
export const STAFLY_CARD_SOFT =
  "rounded-2xl border border-border/40 bg-card/60 shadow-none";

// ── Typography ──────────────────────────────────────────────────────────────

/** Section eyebrow: 11px uppercase tracked, muted. */
export const STAFLY_SECTION_EYEBROW =
  "text-[11px] uppercase tracking-[0.14em] text-muted-foreground";

/** Mono tabular numerals for times and amounts. */
export const STAFLY_TIME_TEXT = "font-mono tabular-nums";

/** Muted caption (secondary metadata). */
export const STAFLY_MUTED_CAPTION = "text-xs text-muted-foreground";

// ── Composition ─────────────────────────────────────────────────────────────

/** Default action grid: 2 columns, 12px gap. Used in home/more/operations sheets. */
export const STAFLY_ACTION_GRID = "grid grid-cols-2 gap-3";

// ═══════════════════════════════════════════════════════════════════════════
// ONE DESIGN SYSTEM — Fase 1 (Foundation)
// Escala única compartida por Desktop / iPad / iPhone / Android.
// Solo clases Tailwind semánticas. Nunca colores literales.
// ═══════════════════════════════════════════════════════════════════════════

// ── Radius ──────────────────────────────────────────────────────────────────
export const STAFLY_RADIUS = {
  chip: "rounded-full",
  control: "rounded-xl",
  surface: "rounded-2xl",
  overlay: "rounded-3xl",
} as const;

// ── Elevación ───────────────────────────────────────────────────────────────
export const STAFLY_ELEVATION = {
  flat: "shadow-none",
  raised: "shadow-xs",
  floating: "shadow-md",
  overlay: "shadow-lg",
} as const;

// ── Espaciado / ritmo ───────────────────────────────────────────────────────
/** Padding horizontal de página, adaptativo (mismo lenguaje en las 4 pantallas). */
export const STAFLY_GUTTER = "px-4 sm:px-5 lg:px-6";
/** Ritmo vertical entre bloques de una pantalla. */
export const STAFLY_STACK = {
  tight: "space-y-2",
  base: "space-y-4",
  section: "space-y-6",
} as const;
/** Gap horizontal canónico dentro de filas/toolbars. */
export const STAFLY_ROW_GAP = "gap-2 sm:gap-3";
/** Altura mínima táctil (accesibilidad AA). */
export const STAFLY_TAP_TARGET = "min-h-11 min-w-11";

// ── Tipografía ──────────────────────────────────────────────────────────────
export const STAFLY_TEXT = {
  pageTitle: "font-heading text-xl sm:text-2xl font-semibold tracking-tight text-foreground",
  sectionTitle: "font-heading text-base font-semibold text-foreground",
  cardTitle: "text-sm font-semibold text-foreground",
  body: "text-sm text-foreground",
  meta: "text-xs text-muted-foreground",
  eyebrow: STAFLY_SECTION_EYEBROW,
  metric: "font-heading text-2xl font-bold tabular-nums leading-none",
  mono: STAFLY_TIME_TEXT,
} as const;

// ── Tonos semánticos (estados) ──────────────────────────────────────────────
export type StaflyTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "critical"
  | "accent";

/** Superficie suave + borde + texto por tono. Para badges, chips y banners. */
export const STAFLY_TONE_SOFT: Record<StaflyTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border/60",
  info: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  accent: "bg-accent text-accent-foreground border-border/60",
};

/** Solo color de texto por tono (iconos, valores, métricas). */
export const STAFLY_TONE_TEXT: Record<StaflyTone, string> = {
  neutral: "text-muted-foreground",
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
  accent: "text-accent-foreground",
};

/** Punto/indicador sólido por tono. */
export const STAFLY_TONE_DOT: Record<StaflyTone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
  accent: "bg-foreground/40",
};

// ── Estados de interacción ──────────────────────────────────────────────────
export const STAFLY_STATE = {
  interactive: "transition-colors duration-200 hover:bg-accent/50 active:scale-[0.99]",
  focus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
  disabled: "opacity-50 pointer-events-none",
  selected: "bg-accent text-accent-foreground",
} as const;

// ── Badges y chips ──────────────────────────────────────────────────────────
export const STAFLY_BADGE_BASE =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap";
export const STAFLY_CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-medium whitespace-nowrap transition-colors";
