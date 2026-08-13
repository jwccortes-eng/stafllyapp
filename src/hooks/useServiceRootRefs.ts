/**
 * P0 — SERVICE ROOT QK DISPLAY CONSOLIDATION
 *
 * Resuelve el QK del servicio raíz de los horarios cargados en pantalla y lo
 * publica en el registro de presentación. Solo lectura: un `select` de
 * `id, shift_ref` sobre las raíces que faltan. No toca payroll, asistencia,
 * asignaciones ni FKs.
 */
import { useEffect, useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  lookupShiftRef,
  missingRootIds,
  rememberShiftRefs,
  subscribeServiceRefs,
} from "@/lib/shifts/service-ref-registry";

interface ShiftLike {
  id?: string | null;
  shift_ref?: string | null;
  parent_shift_id?: string | null;
}

function useServiceRefVersion(): number {
  return useSyncExternalStore(
    (cb) => subscribeServiceRefs(cb),
    () => versionRef.value,
    () => versionRef.value,
  );
}

const versionRef = { value: 0 };
subscribeServiceRefs(() => {
  versionRef.value += 1;
});

/**
 * Registra las referencias visibles y descarga las raíces que falten.
 * Devuelve un contador que fuerza el re-render cuando llegan nuevos QK.
 */
export function useServiceRootRefs(shifts: ShiftLike[] | null | undefined): number {
  const version = useServiceRefVersion();
  const parentKey = (shifts ?? [])
    .map((s) => (s?.parent_shift_id ?? "").trim())
    .filter(Boolean)
    .sort()
    .join(",");

  useEffect(() => {
    rememberShiftRefs(shifts ?? []);
  }, [shifts]);

  useEffect(() => {
    const pending = missingRootIds(parentKey ? parentKey.split(",") : []);
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("scheduled_shifts")
        .select("id, shift_ref")
        .in("id", pending);
      if (cancelled) return;
      rememberShiftRefs(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [parentKey]);

  return version;
}

/** Variante de un solo turno (drawer, detalle, closeout). */
export function useServiceRootRef(shift: ShiftLike | null | undefined): string | null {
  useServiceRootRefs(shift ? [shift] : []);
  const parentId = (shift?.parent_shift_id ?? "").trim();
  if (!parentId) return (shift?.shift_ref ?? "").trim() || null;
  return lookupShiftRef(parentId);
}
