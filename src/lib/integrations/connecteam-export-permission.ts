/**
 * Connecteam export — canonical authorization (Phase 1).
 *
 * There is ONE policy for "can this user export Connecteam CSV for the
 * selected company": the canonical tenant-aware `canManageShifts()`.
 *
 * This module is NOT a fourth permission helper — it is a thin hook that
 * binds the canonical policy to the current auth + company context so every
 * entry point (bulk, detail, mobile) resolves identically.
 *
 * Fail-closed: no company selected → no export.
 */
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { canManageShifts } from "@/lib/shifts/shift-permissions";

export const EXPORT_PERMISSION_DENIED_COPY =
  "No tienes permiso para exportar servicios de esta empresa. Pide acceso a un administrador de la compañía.";

export function useCanExportConnecteam(): boolean {
  const { allRoles, canAccessAdminForCompany } = useAuth();
  const { selectedCompanyId } = useCompany();

  if (!selectedCompanyId) return false;

  return canManageShifts({
    allRoles: allRoles as any,
    canAccessAdminForCompany,
    companyId: selectedCompanyId,
  });
}
