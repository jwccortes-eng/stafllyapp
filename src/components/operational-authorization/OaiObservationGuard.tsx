import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { OAI_ACCESS_DENIED_COPY, evaluateOaiPanelAccess } from "@/lib/operational-authorization/access";
import {
  isCompanyObserved,
  isObservationEnabled,
  isPanelEnabled,
} from "@/lib/operational-authorization/flags";

/**
 * OAI F1 Stage 1 — the observation panel is an internal instrument, not a
 * product surface. Every condition in `evaluateOaiPanelAccess` must hold.
 */
export function OaiObservationGuard({ children }: { children: ReactNode }) {
  const { user, allRoles, loading } = useAuth();
  const { selectedCompanyId } = useCompany();

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Verificando autorización…</div>;
  }

  const staffAllowlist = String(import.meta.env.VITE_OAI_STAFF_ALLOWLIST ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const decision = evaluateOaiPanelAccess({
    isAuthenticated: Boolean(user),
    roles: allRoles ?? [],
    staffAllowlist,
    userId: user?.id ?? null,
    panelEnabled: isPanelEnabled(),
    observationEnabled: isObservationEnabled(),
    companyObserved: isCompanyObserved(selectedCompanyId),
    isProduction: import.meta.env.PROD,
    productionOverride: import.meta.env.VITE_OAI_PANEL_PROD_OVERRIDE === "true",
  });

  if (!decision.allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <ShieldAlert className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Acceso restringido</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {OAI_ACCESS_DENIED_COPY[decision.reason]}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
