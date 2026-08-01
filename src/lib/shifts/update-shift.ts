/**
 * P0 — Guardado verificado de un turno.
 *
 * Nunca declaramos éxito porque el diálogo se cerró. Éxito sólo cuando:
 *  1. el backend no devuelve error;
 *  2. el UPDATE afectó exactamente la fila esperada (la devolvemos con `select`);
 *  3. el registro releído coincide con los campos enviados.
 *
 * Un UPDATE bloqueado por permisos en PostgREST devuelve 200 con cero filas.
 * Sin `select()` eso se veía como éxito y el usuario perdía sus cambios.
 *
 * No toca payroll, fichajes, asistencia, shift_ref ni company_id.
 */
import { supabase } from "@/integrations/supabase/client";

export type ShiftUpdateResult =
  | { ok: true; row: Record<string, any>; mismatched: string[] }
  | { ok: false; reason: "error" | "no_rows" | "mismatch"; message: string; mismatched?: string[] };

function sameValue(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "string" && typeof b === "string") {
    // Horas: la base normaliza "08:00" → "08:00:00".
    return a.slice(0, 5) === b.slice(0, 5) ? a.replace(/:00$/, "") === b.replace(/:00$/, "") || a === b : a === b;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function updateShiftVerified(
  shiftId: string,
  updates: Record<string, any>,
  companyId?: string | null,
): Promise<ShiftUpdateResult> {
  let query = supabase.from("scheduled_shifts").update(updates as any).eq("id", shiftId);
  // Blindaje de tenant: nunca editamos un turno de otra empresa.
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query.select("*").maybeSingle();

  if (error) return { ok: false, reason: "error", message: error.message };
  if (!data) {
    return {
      ok: false,
      reason: "no_rows",
      message:
        "El turno no se actualizó: no tienes permiso sobre este turno o pertenece a otra empresa.",
    };
  }

  const mismatched = Object.keys(updates).filter(
    (key) => !sameValue((data as any)[key], updates[key]),
  );
  if (mismatched.length > 0) {
    return {
      ok: false,
      reason: "mismatch",
      message: `El turno se guardó parcialmente. Campos sin aplicar: ${mismatched.join(", ")}.`,
      mismatched,
    };
  }

  return { ok: true, row: data as Record<string, any>, mismatched: [] };
}
