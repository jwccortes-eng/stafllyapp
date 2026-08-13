/**
 * usePermissions — ÚNICA API canónica de autorización en frontend.
 *
 * FASE 4 del P1 Permission System Consolidation.
 *
 *   const { can, canAny, canAll, status } = usePermissions();
 *   if (status !== "ready") return <AuthorizationLoading />;
 *   if (!can("service.publish")) return null;
 *
 * Reglas:
 *  - NO crear hooks paralelos por módulo.
 *  - NO comparar roles en las pantallas: los roles son plantillas de permisos.
 *  - Mientras `status === "loading"` nadie puede nada (fail-closed sin flash).
 */
import { useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  evaluatePermission,
  isFullAccess,
  type AuthorizationInput,
  type AuthorizationStatus,
} from "@/lib/auth/permission-resolver";
import { PERMISSION_CATALOG, summarizeAccess } from "@/lib/auth/permission-catalog";

export interface UsePermissionsResult {
  status: AuthorizationStatus;
  /** Compañía sobre la que se evalúa (la activa salvo override explícito). */
  companyId: string | null;
  can: (permission: string, companyId?: string | null) => boolean;
  canAny: (permissions: string[], companyId?: string | null) => boolean;
  canAll: (permissions: string[], companyId?: string | null) => boolean;
  /** Acceso total dentro de la compañía (owner/admin de empresa o staff plataforma). */
  isFullAccess: (companyId?: string | null) => boolean;
  /** Permisos concedidos en la compañía activa. */
  grantedPermissions: string[];
  /** Resumen humano para la consola y la previsualización. */
  summary: string;
}

export function usePermissions(): UsePermissionsResult {
  const { allRoles, companyRoles, permissions, actionPermissions, authorizationStatus, authState, loading } = useAuth();
  const { selectedCompanyId, loading: companyLoading } = useCompany();

  const input: AuthorizationInput = useMemo(
    () => ({
      globalRoles: allRoles,
      companyRoles,
      modulePermissions: permissions,
      actionPermissions,
    }),
    [allRoles, companyRoles, permissions, actionPermissions],
  );

  const status: AuthorizationStatus = useMemo(() => {
    if (authorizationStatus === "error") return "error";
    // Sesión resuelta como anónima: autorización conocida (deny), no "loading".
    if (authState === "unauthenticated") return "ready";
    if (loading || companyLoading || authorizationStatus === "loading") return "loading";
    return "ready";
  }, [authorizationStatus, authState, loading, companyLoading]);

  const can = useCallback(
    (permission: string, companyId?: string | null) => {
      if (status !== "ready") return false;
      return evaluatePermission(input, permission, companyId ?? selectedCompanyId);
    },
    [input, selectedCompanyId, status],
  );

  const canAny = useCallback(
    (list: string[], companyId?: string | null) => list.some((p) => can(p, companyId)),
    [can],
  );

  const canAll = useCallback(
    (list: string[], companyId?: string | null) => list.every((p) => can(p, companyId)),
    [can],
  );

  const fullAccess = useCallback(
    (companyId?: string | null) =>
      status === "ready" && isFullAccess(input, companyId ?? selectedCompanyId),
    [input, selectedCompanyId, status],
  );

  const grantedPermissions = useMemo(
    () => (status === "ready" ? PERMISSION_CATALOG.filter((p) => can(p.permission)).map((p) => p.permission) : []),
    [can, status],
  );

  const summary = useMemo(() => summarizeAccess(new Set(grantedPermissions)), [grantedPermissions]);

  return {
    status,
    companyId: selectedCompanyId,
    can,
    canAny,
    canAll,
    isFullAccess: fullAccess,
    grantedPermissions,
    summary,
  };
}

/**
 * Evalúa permisos de OTRA persona (consola / previsualización) sin impersonar.
 * Devuelve el mapa completo del catálogo.
 */
export function evaluateAccessPreview(
  input: AuthorizationInput,
  companyId: string | null,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const spec of PERMISSION_CATALOG) {
    out[spec.permission] = evaluatePermission(input, spec.permission, companyId);
  }
  return out;
}
