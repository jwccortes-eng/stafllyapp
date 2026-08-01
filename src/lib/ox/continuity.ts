/**
 * OX-8 — ONE STAFLY. Continuidad de experiencia.
 *
 * Única fuente de verdad para composición, ritmo, respiración y profundidad
 * de TODA pantalla de Stafly (admin, operación, portal).
 *
 * Regla: ninguna pantalla inventa su propio ritmo. Si necesitas un espaciado
 * nuevo, no lo escribas en la pantalla: cámbialo aquí y cámbialo para todos.
 *
 * Sólo presentación. No toca auth, payroll, time_entries, RLS, tenants,
 * assignment logic, compliance ni RPCs.
 */

/** Respiración horizontal de pantalla (móvil primero). */
export const OX_SCREEN_X = "px-4 md:px-6";

/** Respiración vertical superior de pantalla. */
export const OX_SCREEN_TOP = "pt-4 md:pt-6";

/** Ritmo vertical entre bloques de una pantalla. */
export const OX_STACK = "space-y-4 md:space-y-5";

/** Ritmo interno de un bloque (items de una misma historia). */
export const OX_STACK_TIGHT = "space-y-2.5";

/** Clearance inferior para no chocar con la barra del pulgar. */
export const OX_SCREEN_BOTTOM = "pb-24 md:pb-10";

/** Profundidad única de superficie. Nunca sombras ad-hoc por pantalla. */
export const OX_SURFACE =
  "rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]";

/** Superficie secundaria (anidada dentro de otra). */
export const OX_SURFACE_SOFT = "rounded-xl border border-border/40 bg-muted/30";

/** Transición única del producto: continuidad, nunca cambio brusco. */
export const OX_MOTION =
  "transition-[background-color,border-color,color,transform,opacity] duration-200 ease-out";

/** Entrada de contenido de pantalla — la misma en toda la app. */
export const OX_ENTER = "animate-fade-in";

/** Presión táctil coherente en cualquier elemento accionable. */
export const OX_PRESS = "active:scale-[0.99]";

/** Composición canónica de cabecera de pantalla. */
export const OX_HEADER = {
  /** Eyebrow: la empresa anfitriona. Nunca el módulo. */
  host: "text-[12px] leading-[16px] font-semibold tracking-tight text-muted-foreground truncate",
  /** ¿Dónde estoy? */
  title:
    "text-[20px] md:text-[24px] leading-tight font-semibold tracking-tight text-foreground truncate",
  /** ¿Qué está pasando? Una sola línea. */
  context: "text-[13px] md:text-sm leading-snug text-muted-foreground",
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * OX-9 — MOBILE PREMIUM EXPERIENCE
 *
 * Un solo ritmo móvil. Menos cajas, más continuidad. El color sólo comunica
 * decisión, confianza, riesgo o éxito: nunca decora.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Respiración horizontal móvil. Única. */
export const OX9_X = "px-5";

/** Ritmo vertical entre bloques móviles. Amplio, calmado, uniforme. */
export const OX9_STACK = "space-y-6";

/**
 * Superficie móvil silenciosa: sin sombra, sin borde duro. Es una zona,
 * no una caja. Se usa cuando el contenido ya tiene jerarquía propia.
 */
export const OX9_QUIET = "rounded-3xl bg-card/70 border border-border/40";

/** Lista continua: una sola superficie con separadores finos, no N tarjetas. */
export const OX9_LIST = "rounded-3xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden";

/** Fila táctil de lista: 60px reales, presión discreta. */
export const OX9_ROW =
  "w-full flex items-center gap-3.5 px-4 min-h-[60px] py-3 text-left transition-colors active:bg-muted/40";

/** Eyebrow de sección móvil: se lee, no grita. */
export const OX9_EYEBROW =
  "text-[11px] font-medium tracking-[0.12em] uppercase text-muted-foreground/70";

/** Título de bloque móvil. */
export const OX9_BLOCK_TITLE = "text-[15px] font-semibold tracking-tight";

/** Escala única de icono móvil. Una familia, un tamaño, una personalidad. */
export const OX9_ICON = "h-[18px] w-[18px]";

/** Contenedor de icono: siempre el mismo tamaño y radio. */
export const OX9_ICON_TILE =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl";

