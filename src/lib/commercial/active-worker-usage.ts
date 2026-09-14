/**
 * DEFINICIÓN CANÓNICA DE USO (P1, solo lectura).
 *
 * ACTIVE WORKER (entitlement key `active_workers`):
 *   employees WHERE company_id = :company
 *     AND is_active = true
 *     AND deleted_at IS NULL              -- excluye borrados lógicos
 *     AND merged_into_employee_id IS NULL -- excluye duplicados fusionados
 *
 * Explícitamente:
 *  - Inactivos y archivados NO cuentan (is_active = false).
 *  - Invitados que aún no activan NO cuentan si su fila no está activa.
 *  - Un admin que además es trabajador cuenta UNA vez, y solo como trabajador.
 *  - Históricos (personas que ya no trabajan) NO cuentan.
 *  - Todo el conteo es tenant-scoped por `company_id`: una persona presente en
 *    dos empresas cuenta una vez en cada una, nunca de forma cruzada.
 *
 * ADMIN USER (entitlement key `admin_users`):
 *   company_users WHERE company_id = :company AND role = 'admin'
 *   (misma fuente que usa hoy la pantalla de usuarios).
 */
import { supabase } from "@/integrations/supabase/client";
import type { EntitlementKey } from "./entitlements";

export async function getActiveWorkerUsage(companyId: string): Promise<number> {
  const { count, error } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .is("merged_into_employee_id", null);
  if (error) throw error;
  return count ?? 0;
}

export async function getAdminUserUsage(companyId: string): Promise<number> {
  const { count, error } = await supabase
    .from("company_users")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("role", "admin");
  if (error) throw error;
  return count ?? 0;
}

export async function getCanonicalUsage(
  companyId: string,
): Promise<Record<EntitlementKey, number>> {
  const [active_workers, admin_users] = await Promise.all([
    getActiveWorkerUsage(companyId),
    getAdminUserUsage(companyId),
  ]);
  return { active_workers, admin_users };
}
