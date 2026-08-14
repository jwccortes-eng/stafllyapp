import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { isPlatformOnlyPath, routePermissionsFor } from "@/lib/auth/nav-permissions";
import { ShieldAlert } from "lucide-react";

/**
 * P0 COMPANY_ADMIN BYPASS REMOVAL — guard de RUTA por permiso efectivo.
 *
 * NO permission → NO route. Se aplica una sola vez alrededor del `Outlet`
 * administrativo usando el mapa canónico `nav-permissions` (misma verdad que
 * el sidebar): no hay forma de entrar por URL directa a una superficie que el
 * menú oculta.
 */
export function RouteAuthorizationGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { allRoles } = useAuth();
  const { status } = usePermissions();

  const isPlatformStaff = allRoles.has("developer") || allRoles.has("owner");

  if (isPlatformOnlyPath(location.pathname)) {
    if (isPlatformStaff) return <>{children}</>;
    if (status === "loading") return null;
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <ShieldAlert className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-semibold">Sección reservada a la plataforma</p>
      </div>
    );
  }

  const required = routePermissionsFor(location.pathname);
  if (!required) return <>{children}</>;

  return <PermissionGate permission={required}>{children}</PermissionGate>;
}
