/**
 * P1 — CLIENT VISUAL IDENTITY SYSTEM
 * ==================================
 * Identidad cromática canónica del CLIENTE.
 *
 * REGLAS DURAS
 *  · El color pertenece al Cliente. Servicios, Venues y vistas sólo lo heredan.
 *  · Nunca se persiste color en scheduled_shifts / shift_assignments /
 *    time_entries / payroll. El origen es SIEMPRE el Cliente (Client Truth).
 *  · Se guarda/usa el TOKEN, jamás un HEX. El valor real vive en index.css
 *    como `--client-accent-<token>` para respetar tema claro/oscuro.
 *  · Asignación determinista por `client_id`: no depende del nombre ni del
 *    orden de creación, y sobrevive a backups, duplicados y exportaciones.
 *  · El color NO es un estado. Los estados siguen siendo verde/ámbar/rojo.
 *
 * Módulo PURO: sin React, sin BD, sin escrituras.
 */

export const CLIENT_ACCENT_TOKENS = [
  "emerald",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "purple",
  "rose",
  "coral",
  "orange",
  "amber",
  "gold",
  "lime",
  "olive",
  "mint",
  "sky",
] as const;

export type ClientAccentToken = (typeof CLIENT_ACCENT_TOKENS)[number];

/** Intensidad de herencia: el Venue nunca estrena color, sólo baja intensidad. */
export type ClientAccentIntensity = "full" | "medium" | "light";

/** FNV-1a — estable entre sesiones, navegadores y restauraciones de backup. */
function stableHash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** hash(client_id) → paleta oficial → accent_color. Nunca cambia. */
export function clientAccentToken(clientId?: string | null): ClientAccentToken | null {
  const id = (clientId ?? "").trim();
  if (!id) return null;
  return CLIENT_ACCENT_TOKENS[stableHash(id) % CLIENT_ACCENT_TOKENS.length];
}

/** Referencia CSS del token (nunca HEX en la app). */
export function clientAccentVar(token: ClientAccentToken | null, alpha = 1): string | undefined {
  if (!token) return undefined;
  return alpha >= 1
    ? `hsl(var(--client-accent-${token}))`
    : `hsl(var(--client-accent-${token}) / ${alpha})`;
}

const INTENSITY_ALPHA: Record<ClientAccentIntensity, number> = {
  full: 1,
  medium: 0.66,
  light: 0.42,
};

/**
 * Color de acento listo para pintar (borde, barra, avatar).
 * `intensity` permite que un Venue se lea como variación del mismo Cliente.
 */
export function clientAccentColor(
  clientId?: string | null,
  intensity: ClientAccentIntensity = "full",
): string | undefined {
  return clientAccentVar(clientAccentToken(clientId), INTENSITY_ALPHA[intensity]);
}

/** Tinte suave para superficies (avatar, chip, cabecera de drawer). */
export function clientAccentSoft(clientId?: string | null, alpha = 0.14): string | undefined {
  return clientAccentVar(clientAccentToken(clientId), alpha);
}

/**
 * Venue: hereda el color del Cliente y sólo modula la intensidad de forma
 * determinista, para que dos venues del mismo cliente sigan siendo "el mismo".
 */
export function venueAccentIntensity(venueId?: string | null): ClientAccentIntensity {
  const id = (venueId ?? "").trim();
  if (!id) return "full";
  return (["light", "medium"] as const)[stableHash(id) % 2];
}
