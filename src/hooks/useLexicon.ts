/**
 * OX-10 — Acceso React a la capa de lenguaje visible.
 *
 * Uso:
 *   const lx = useLexicon();              // audiencia según la ruta actual
 *   const lx = useLexicon("payroll");     // audiencia forzada
 *
 * Ninguna pantalla debe escribir "Servicio" o "Turno" a mano.
 */

import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { audienceForPath, lexicon, type LexAudience, type LexiconTerms } from "@/lib/ox/lexicon";

export function useLexicon(override?: LexAudience): LexiconTerms {
  const location = useLocation();
  const pathname = location?.pathname ?? "";
  return useMemo(
    () => lexicon(override ?? audienceForPath(pathname)),
    [override, pathname],
  );
}

export type { LexAudience, LexiconTerms };
