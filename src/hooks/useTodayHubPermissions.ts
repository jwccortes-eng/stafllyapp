/**
 * OX-4.3.1 — Resolver canónico de permisos del Today Hub.
 *
 * No define permisos nuevos: traduce el resolver existente (`useAuth`:
 * `getRoleForCompany`, `hasModuleAccess`, `hasActionPermission`) al conjunto de
 * capacidades que consumen los CTAs del Today Hub.
 *
 * Reglas duras:
 *  - FAIL-CLOSED: mientras auth carga, si no hay compañía seleccionada, si el
 *    rol no resuelve o si el resolver falla, todas las capacidades son `false`.
 *  - Tenant-scoped: el rol se resuelve SIEMPRE contra `selectedCompanyId`.
 *    Nunca se usa el flag global deprecado `canAccessAdmin`.
 *  - La UI no reemplaza la seguridad: RPC/RLS siguen validando autorización.
 */
import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { isAdminLevelRole, isGatedAdminRole } from "@/lib/roles";
import type { HubPermissions } from "@/lib/command-center/today-hub-model";
import { NO_HUB_PERMISSIONS } from "@/lib/command-center/today-hub-model";

export interface TodayHubPermissionsResult {
  permissions: HubPermissions;
  /** true sólo cuando el resolver terminó y hay tenant + rol. */
  resolved: boolean;
  /** true mientras auth/compañía siguen cargando. */
  loading: boolean;
  /** Motivo técnico cuando `resolved` es false. */
  reason: string | null;
  role: string | null;
}

export function useTodayHubPermissions(): TodayHubPermissionsResult {
  const { getRoleForCompany } = useAuth();
  const { selectedCompanyId, loading: companyLoading } = useCompany() as {
    selectedCompanyId: string | null;
    loading?: boolean;
  };
  const { can, status } = usePermissions();

  const loading = status === "loading" || !!companyLoading;
  const role = selectedCompanyId ? getRoleForCompany(selectedCompanyId) : null;

  return useMemo<TodayHubPermissionsResult>(() => {
    if (loading) {
      return {
        permissions: NO_HUB_PERMISSIONS,
        resolved: false,
        loading: true,
        reason: "permissions_loading",
        role: null,
      };
    }
    if (!selectedCompanyId) {
      return {
        permissions: NO_HUB_PERMISSIONS,
        resolved: false,
        loading: false,
        reason: "no_tenant_selected",
        role: null,
      };
    }

    // P0 Legacy Bypass Retirement — el permiso efectivo es la única autoridad.
    const permissions: HubPermissions = {
      canAssign: can("staffing.assign"),
      canConfirmTeam: can("staffing.assign"),
      canOperate: can("service.edit") || can("service.view"),
      canClose: can("service.close"),
      canReviewCloseout: can("closeout.close_day") || can("service.close"),
      canApproveHours: can("time_entries.approve") || can("payroll.approve"),
      canAccessValidations:
        can("payroll.view") || can("time_entries.review") || can("time_entries.approve"),
      canManageWorkers: can("workers.edit"),
      canManageAttendance: can("time_entries.review") || can("time_entries.adjust"),
    };

    return {
      permissions,
      resolved: true,
      loading: false,
      reason: null,
      role: (role as string) ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selectedCompanyId, role, can]);
}

