/**
 * OX-3 — Escala móvil canónica (tipografía + área táctil).
 *
 * Única fuente de verdad para el tamaño de texto y el tamaño de los controles
 * en superficies móviles de Stafly (worker, capitán, supervisor, admin).
 *
 * Reglas:
 *  - Ningún texto operativo importante por debajo de 14px (`MT.body`).
 *  - 12px (`MT.caption`) sólo para metadatos no críticos.
 *  - Máximo 3 niveles tipográficos visibles por bloque.
 *  - Toda acción interactiva usa `TAP` (44x44 real, no sólo padding visual).
 *  - Sin colores aquí: el color vive en los tokens semánticos (OX-2).
 */

/** Escala tipográfica móvil. */
export const MT = {
  /** 12px — metadatos secundarios, timestamps. Nunca para estado ni CTA. */
  caption: "text-[12px] leading-[16px]",
  /** 13px — labels de campo y eyebrows de sección. */
  label: "text-[13px] leading-[17px] font-medium",
  /** 14px — texto operativo por defecto. */
  body: "text-[14px] leading-[20px]",
  /** 16px — texto operativo destacado y contenido de CTA. */
  bodyStrong: "text-[16px] leading-[22px] font-medium",
  /** 17px — título de card. */
  title: "text-[17px] leading-[22px] font-semibold tracking-tight",
  /** 20px — título de sección / hoja. */
  section: "text-[20px] leading-[26px] font-semibold tracking-tight",
  /** 24px — cifra o título dominante de pantalla. */
  display: "text-[24px] leading-[28px] font-bold tracking-tight",
  /** Cifras: display con tabular-nums. */
  metric: "text-[24px] leading-[28px] font-bold tracking-tight tabular-nums",
} as const;

/** Eyebrow de sección — el único uso permitido de mayúsculas pequeñas. */
export const MT_EYEBROW =
  "text-[12px] leading-[16px] font-semibold uppercase tracking-wide";

/** Área táctil mínima (44x44 real). */
export const TAP = "min-h-[44px] min-w-[44px]";

/** Botón de icono móvil: 44x44 centrado. */
export const TAP_ICON =
  "inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-xl";

/** Fila completa clickeable (lista, worker, destino de navegación). */
export const TAP_ROW =
  "w-full text-left min-h-[56px] flex items-center gap-3 active:scale-[0.99] transition-transform";

/** Chip interactivo: alto táctil sin engordar la tipografía. */
export const TAP_CHIP =
  "inline-flex items-center justify-center min-h-[44px] px-3 rounded-full";

/** Foco visible consistente para controles móviles. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Barra de acción fija sobre la zona del pulgar, respetando safe-area. */
export const THUMB_BAR =
  "sticky bottom-0 z-20 -mx-4 px-4 pt-3 pb-[max(env(safe-area-inset-bottom,12px),12px)] bg-background/95 backdrop-blur-xl border-t border-border/50";

/** Clearance inferior para contenido sobre una barra de acción fija. */
export const THUMB_BAR_CLEARANCE = "pb-[max(env(safe-area-inset-bottom,16px),16px)]";
