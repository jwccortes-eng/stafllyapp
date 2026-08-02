/**
 * useServiceState — única fuente observable de un servicio en la UI.
 *
 * Las superficies de detalle (diálogo desktop, hoja móvil, editor) deben leer
 * de aquí en lugar de renderizar el snapshot que recibieron por props.
 * El `placeholder` (la fila que la lista ya tenía) se muestra al instante para
 * no romper la continuidad visual, y se reemplaza por la fila completa en cuanto
 * el backend responde. Nunca degrada a una versión más antigua.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchServiceRow,
  mergeServiceRow,
  serviceStateKey,
  writeServiceRow,
  type ServiceRow,
} from "@/lib/shifts/service-state";

interface Options<T extends ServiceRow> {
  companyId: string | null | undefined;
  shiftId: string | null | undefined;
  /** Fila conocida por la lista. Solo semilla visual, nunca fuente de verdad. */
  placeholder?: T | null;
  enabled?: boolean;
}

export function useServiceState<T extends ServiceRow>({
  companyId,
  shiftId,
  placeholder = null,
  enabled = true,
}: Options<T>) {
  const queryClient = useQueryClient();
  const active = Boolean(enabled && companyId && shiftId);

  // Semilla: la fila de la lista entra a la cache canónica con guardia de versión.
  useEffect(() => {
    if (!active || !placeholder?.id || placeholder.id !== shiftId) return;
    writeServiceRow(queryClient, companyId, placeholder);
  }, [active, companyId, shiftId, placeholder, queryClient]);

  const query = useQuery({
    queryKey: serviceStateKey(companyId, shiftId),
    queryFn: () => fetchServiceRow(companyId, shiftId),
    enabled: active,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const service = useMemo(() => {
    const seed = placeholder?.id === shiftId ? placeholder : null;
    return (mergeServiceRow(seed, query.data ?? null) ?? seed ?? null) as T | null;
  }, [placeholder, shiftId, query.data]);

  return {
    service,
    /** true solo mientras no hay NADA que mostrar (evita spinners de pantalla completa). */
    isInitialLoading: active && !service && query.isLoading,
    isReconciling: query.isFetching,
    refetch: query.refetch,
  };
}
