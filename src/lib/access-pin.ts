/**
 * P0 — AUTH PIN CANONICALIZATION.
 *
 * El PIN pertenece al Auth User (una persona = un PIN = un bloqueo).
 * El frontend nunca lee ni escribe `employees.access_pin`: llama RPCs
 * SECURITY DEFINER que resuelven la credencial canónica, devuelven solo
 * existencia, o devuelven el PIN una única vez tras un reset autorizado.
 */
import { supabase } from "@/integrations/supabase/client";

/** Indica si la persona tiene PIN canónico configurado. Self / admin de empresa / global owner. */
export async function checkEmployeeHasPin(employeeId: string): Promise<boolean> {
  const { data, error } = await (supabase.rpc as any)("employee_has_access_pin", {
    _employee_id: employeeId,
  });
  if (error) {
    console.warn("[access-pin] employee_has_access_pin failed:", error.message);
    return false;
  }
  return !!data;
}

/** Versión masiva — ejecuta el RPC en paralelo. Ante error, false para ese id. */
export async function checkEmployeesHasPinBulk(
  ids: string[],
): Promise<Record<string, boolean>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const results = await Promise.all(
    unique.map(async (id) => [id, await checkEmployeeHasPin(id)] as const),
  );
  return Object.fromEntries(results);
}

/**
 * Reinicia el PIN de la persona a un valor nuevo de 4 dígitos.
 * Escritor único: limpia bloqueos y alias telefónicos legacy de forma atómica.
 * Devuelve el PIN una sola vez.
 */
export async function resetEmployeePin(employeeId: string): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("admin_reset_auth_pin", {
    _employee_id: employeeId,
  });
  if (error) throw new Error(error.message ?? "reset_failed");
  if (!data || typeof data !== "string") throw new Error("reset_no_pin_returned");
  return data;
}

/** Fija manualmente el PIN de la persona (4 dígitos) sobre la credencial canónica. */
export async function setEmployeePin(employeeId: string, pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error("invalid_pin_format");
  const { error } = await (supabase.rpc as any)("admin_set_auth_pin_for_employee", {
    _employee_id: employeeId,
    _pin: pin,
  });
  if (error) throw new Error(error.message ?? "set_failed");
}
