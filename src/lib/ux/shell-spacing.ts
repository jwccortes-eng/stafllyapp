/**
 * STAFLY — App Shell spacing scale (UX pass, presentación pura).
 *
 * Escala única: 4 · 8 · 12 · 16 · 24 · 32 · 48.
 * Ninguna pantalla debe inventar márgenes propios: consumir estos tokens.
 * No contiene lógica de negocio ni datos.
 */

/** Escala base en px, para cálculos puntuales. */
export const SHELL_SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

/** Respiración horizontal del shell: 16 mobile · 20–24 tablet · 32 desktop. */
export const SHELL_GUTTER_X = "px-4 sm:px-5 md:px-6 xl:px-8";

/** Separación vertical entre bloques grandes de una pantalla (24 → 32). */
export const SHELL_BLOCK_GAP = "space-y-6 lg:space-y-8";

/** Padding interno canónico de una card: 16 mobile · 20–24 desktop. */
export const SHELL_CARD_PADDING = "p-4 sm:p-5 lg:p-6";

/** Ancho de la sidebar desktop. */
export const SHELL_SIDEBAR_WIDTH = { expanded: 240, collapsed: 68 } as const;
