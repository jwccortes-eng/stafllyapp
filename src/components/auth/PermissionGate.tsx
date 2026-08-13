import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Guard de superficie por PERMISO (no por rol).
 *
 * FASE 2 — mientras la autorización no esté resuelta se muestra
 * AUTHORIZATION_LOADING; nunca se renderiza contenido no autorizado
 * "mientras tanto".
 */
interface Props {
  /** Permiso canónico requerido (o varios: basta con uno). */
  permission: string | string[];
  children: ReactNode;
  /** Si se indica, redirige en vez de mostrar el bloqueo. */
  redirectTo?: string;
  /** Contenido alternativo cuando no hay permiso. */
  fallback?: ReactNode;
}

export function AuthorizationLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <span className="sr-only">Verificando permisos…</span>
    </div>
  );
}

export function PermissionGate({ permission, children, redirectTo, fallback }: Props) {
  const { status, canAny } = usePermissions();
  const list = Array.isArray(permission) ? permission : [permission];

  if (status === "loading") return <AuthorizationLoading />;

  if (status === "error") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <ShieldAlert className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-semibold">No pudimos verificar tus permisos</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          No se pudo leer tu autorización para esta empresa. Recarga la página o cambia de empresa.
        </p>
      </div>
    );
  }

  if (!canAny(list)) {
    if (redirectTo) return <Navigate to={redirectTo} replace />;
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <ShieldAlert className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-semibold">Sin acceso a esta sección</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu acceso en esta empresa no incluye esta función. Pídeselo a quien administra la empresa.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
