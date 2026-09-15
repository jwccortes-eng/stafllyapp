/**
 * P0.1 — Hook de SOLO LECTURA sobre la capa canónica de persona (modo sombra).
 * No escribe, no fusiona, no copia contacto. Solo explica la identidad.
 */

import { useQuery } from "@tanstack/react-query";
import {
  resolveCanonicalPerson,
  type CanonicalPersonResolution,
} from "@/lib/identity/canonical-person";

export function useCanonicalPerson(
  employeeId: string | null | undefined,
  companyId?: string | null,
) {
  return useQuery<CanonicalPersonResolution | null>({
    queryKey: ["canonical-person", employeeId ?? null, companyId ?? null],
    enabled: !!employeeId,
    staleTime: 60_000,
    queryFn: () => resolveCanonicalPerson(employeeId, { companyId }),
  });
}
