import { useCompany } from "@/hooks/useCompany";
import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

/**
 * Wraps pages that require a selected company.
 * In global mode (no company selected), shows a prompt instead of empty/broken UI.
 */
export function CompanyRequiredGuard({ children }: { children: ReactNode }) {
  const { selectedCompanyId, isGlobalMode } = useCompany();
  const navigate = useNavigate();

  if (!selectedCompanyId && isGlobalMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
          <Building2 className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <div>
          <h2 className="text-lg font-semibold font-heading text-foreground">
            Selecciona una empresa
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Esta vista requiere un contexto de empresa. Selecciona una desde el panel o el selector en la barra lateral.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/app")}>
          Ir al panel global
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
