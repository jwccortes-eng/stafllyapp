/**
 * "Requiere tu atención" — modelo genérico de acciones pendientes del portal.
 *
 * Hoy solo se alimenta de Comunicados Oficiales que requieren acuse. El modelo
 * es deliberadamente agnóstico para que más adelante puedan sumarse turnos por
 * responder o documentos requeridos SIN crear otro sistema ni otra tabla: cada
 * fuente sigue viviendo en su dominio y aquí solo se proyecta la acción.
 *
 * Reglas:
 *  - Solo entra lo que exige una acción real de la persona.
 *  - Nada informativo.
 *  - El pendiente se resuelve por ACKNOWLEDGED, nunca por abrir.
 */

export type AttentionKind = "official_communication";

export interface AttentionItem {
  /** Identidad estable del pendiente (dominio + id de origen). */
  id: string;
  kind: AttentionKind;
  /** Empresa dueña del pendiente. Siempre visible: la persona puede ser multi-empresa. */
  companyId: string;
  companyName: string | null;
  /** Etiqueta de categoría, p. ej. "Comunicado importante". */
  category: string;
  title: string;
  /** Qué se le pide a la persona. */
  requirement: string;
  ctaLabel: string;
  to: string;
  critical: boolean;
}

export function attentionCount(items: readonly AttentionItem[]): number {
  return items.length;
}
