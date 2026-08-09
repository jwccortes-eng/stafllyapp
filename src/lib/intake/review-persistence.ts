/**
 * Persistencia ligera de la revisión en curso (UI-only).
 *
 * Guarda en `sessionStorage` los candidatos ya extraídos y el batch en revisión
 * para que cambiar de pestaña, bloquear el teléfono o refrescar por accidente no
 * borre el trabajo del coordinador. NO es otro draft engine: no escribe en base
 * de datos, no reemplaza `import_batches` y se limpia al crear los borradores.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ServiceCandidate } from "@/lib/intake/candidate";

const PREFIX = "stafly.intake.review";

export interface PersistedReview<TExtra = unknown> {
  batchId: string | null;
  candidates: ServiceCandidate[];
  extra?: TExtra;
}

function keyFor(companyId: string | null | undefined, source: string): string | null {
  if (!companyId) return null;
  return `${PREFIX}.${companyId}.${source}`;
}

export function useIntakeReviewPersistence<TExtra = unknown>(
  companyId: string | null | undefined,
  source: string,
) {
  const storageKey = keyFor(companyId, source);
  const [restored, setRestored] = useState<PersistedReview<TExtra> | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || !storageKey) return;
    loaded.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedReview<TExtra>;
      if (Array.isArray(parsed?.candidates) && parsed.candidates.length > 0) {
        setRestored(parsed);
      }
    } catch {
      // Un estado corrupto nunca debe romper la pantalla de intake.
    }
  }, [storageKey]);

  const save = useCallback(
    (value: PersistedReview<TExtra>) => {
      if (!storageKey) return;
      try {
        if (value.candidates.length === 0) sessionStorage.removeItem(storageKey);
        else sessionStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // Cuota llena o modo privado: la revisión sigue viva en memoria.
      }
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    if (!storageKey) return;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // no-op
    }
  }, [storageKey]);

  return { restored, save, clear };
}
