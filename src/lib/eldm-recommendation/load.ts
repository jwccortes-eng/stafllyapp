/**
 * ELDM Fase 1C — carga de memoria para recomendación (único punto de I/O).
 * Lee señales vigentes del tenant y las agrupa por persona. Sin escrituras.
 */
import { loadSignals } from "@/lib/eldm-store";
import type { EcosystemSignal } from "@/lib/eldm";

export async function loadSignalsByPerson(params: {
  companyId: string;
  personIds: string[];
  venueId?: string;
  limit?: number;
}): Promise<Map<string, EcosystemSignal[]>> {
  const byPerson = new Map<string, EcosystemSignal[]>();
  if (params.personIds.length === 0) return byPerson;

  const signals = await loadSignals({
    companyId: params.companyId,
    limit: params.limit ?? 1000,
  });

  const wanted = new Set(params.personIds);
  for (const signal of signals) {
    const personId = signal.subject.personId;
    if (!personId || !wanted.has(personId)) continue;
    const list = byPerson.get(personId) ?? [];
    list.push(signal);
    byPerson.set(personId, list);
  }
  return byPerson;
}
