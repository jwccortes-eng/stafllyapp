/**
 * Phase B — frontend helpers around employees.access_pin.
 *
 * Frontend code MUST NOT read `employees.access_pin` directly anymore.
 * It calls SECURITY DEFINER RPCs that enforce permissions and only
 * return existence (not the value), or return the PIN exactly once
 * after a privileged reset/set operation.
 */
import { supabase } from "@/integrations/supabase/client";

/** Returns whether the worker has a PIN configured. Self / company admin / global owner. */
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

/** Bulk version — runs RPC in parallel. Falls back to false on error per id. */
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

/** Resets the worker PIN to a fresh 4-digit value. Returns the new PIN exactly once. */
export async function resetEmployeePin(employeeId: string): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("reset_employee_access_pin", {
    _employee_id: employeeId,
  });
  if (error) throw new Error(error.message ?? "reset_failed");
  if (!data || typeof data !== "string") throw new Error("reset_no_pin_returned");
  return data;
}

/** Sets the worker PIN to a manual 4-digit value. */
export async function setEmployeePin(employeeId: string, pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error("invalid_pin_format");
  const { error } = await (supabase.rpc as any)("set_employee_access_pin", {
    _employee_id: employeeId,
    _pin: pin,
  });
  if (error) throw new Error(error.message ?? "set_failed");
}
