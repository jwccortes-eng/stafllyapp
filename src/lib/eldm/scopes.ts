/**
 * ELDM — scopes.ts
 * Fronteras de privacidad. Ninguna lectura cruza un tenant por defecto.
 */
import type { KnowledgeItem, KnowledgeScope, EcosystemSignal } from "./types";

/** Campos que nunca pueden alimentar una inferencia. */
const SENSITIVE_ATTRIBUTE =
  /ssn|dni|passport_number|bank|account|salary|wage|rate|pay|address|email|phone|document_number|birth|medical|immigration/i;

export function stripSensitiveAttributes(
  attributes: EcosystemSignal["attributes"],
): EcosystemSignal["attributes"] {
  const out: EcosystemSignal["attributes"] = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (SENSITIVE_ATTRIBUTE.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export interface ReaderContext {
  companyId: string;
  personId?: string;
  /** Consentimiento vigente de la persona para reutilizar sus preferencias. */
  personConsent?: boolean;
}

/** ¿Este lector puede ver este scope? Decisión única de todo el ecosistema. */
export function canRead(scope: KnowledgeScope, reader: ReaderContext): boolean {
  switch (scope.level) {
    case "ecosystem":
      return true;
    case "tenant":
      return scope.companyId === reader.companyId;
    case "person":
      // La preferencia de una persona sólo se reutiliza con consentimiento.
      return scope.consented === true && reader.personConsent === true;
    case "shared_reputation":
      return true;
    default:
      return false;
  }
}

export function filterReadable<T extends { scope: KnowledgeScope }>(
  items: T[],
  reader: ReaderContext,
): T[] {
  return items.filter((i) => canRead(i.scope, reader));
}

/** Etiqueta humana del alcance, para mostrar el origen de cada razón. */
export function describeScope(scope: KnowledgeScope): string {
  switch (scope.level) {
    case "ecosystem":
      return "Hecho del ecosistema";
    case "tenant":
      return "Historial de esta empresa";
    case "person":
      return "Preferencia confirmada por la persona";
    case "shared_reputation":
      return "Reputación pública";
  }
}

export function scopeLevel(item: KnowledgeItem): KnowledgeScope["level"] {
  return item.scope.level;
}
