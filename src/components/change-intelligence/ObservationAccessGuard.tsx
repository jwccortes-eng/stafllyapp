import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  ACCESS_DENIED_COPY,
  evaluatePanelAccess,
} from "@/lib/change-intelligence/access";

/**
 * F1.1 — restricts the Change Intelligence observation panel to platform staff
 * in non-production environments (or with an explicit production override).
 */
export function ObservationAccessGuard({ children }: { children: ReactNode }) {
  const { user, allRoles, loading } = useAuth();

  const decision = evaluatePanelAccess({
    isAuthenticated: Boolean(user),
    roles: allRoles ?? [],
    isProduction: import.meta.env.PROD,
    productionOverride: import.meta.env.VITE_CI_PANEL_PROD_OVERRIDE === "true",
  });

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Verificando autorización…</div>;
  }

  if (!decision.allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <ShieldAlert className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Acceso restringido</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {ACCESS_DENIED_COPY[decision.reason]}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
