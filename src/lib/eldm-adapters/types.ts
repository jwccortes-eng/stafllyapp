/**
 * ELDM Fase 1B — adapters (fuera del core).
 *
 * El motor `src/lib/eldm` sigue siendo puro y sin I/O. Aquí vive la traducción
 * de eventos operativos reales a señales canónicas, y nada más.
 */
import type { EcosystemSignal, KnowledgeKind } from "@/lib/eldm";

/**
 * Señal lista para persistir. `sourceReference` es la identidad estable del
 * evento operativo: reprocesar el mismo evento nunca infla la evidencia.
 */
export interface PersistableSignal extends EcosystemSignal {
  knowledgeKind: KnowledgeKind;
  sourceReference: string;
}

/** Dominios habilitados en Fase 1B. El resto queda fuera a propósito. */
export const PHASE_1B_DOMAINS = ["intake", "assignment", "response", "attendance", "service", "rating"] as const;

export function buildSourceReference(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((p) => p !== null && p !== undefined && `${p}`.length > 0)
    .map((p) => `${p}`.trim().toLowerCase())
    .join(":");
}
