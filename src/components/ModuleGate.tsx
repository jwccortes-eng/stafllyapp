import { useSubscription, MODULE_PLAN_MAP, PLAN_INFO, PlanCode } from "@/hooks/useSubscription";
import { useCompany } from "@/hooks/useCompany";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight, Sparkles } from "lucide-react";

interface ModuleGateProps {
  /** The module key to check (e.g. "timeclock", "automations") */
  moduleKey: string;
  children: React.ReactNode;
}

/**
 * Wraps a page component. If the current plan doesn't have access
 * to the module, shows an upgrade prompt instead of the page content.
 *
 * Global-mode users (developer/owner with no company selected) are
 * never gated — billing is per-company, not per-user.
 */
export default function ModuleGate({ moduleKey, children }: ModuleGateProps) {
  const { canAccessModule, requiredPlanForModule, planCode } = useSubscription();
  const { isGlobalMode } = useCompany();
  const navigate = useNavigate();

  // Global mode bypasses all module gating — billing is per-company
  if (isGlobalMode) {
    return <>{children}</>;
  }

  if (canAccessModule(moduleKey)) {
    return <>{children}</>;
  }

  const planLabel = requiredPlanForModule(moduleKey) ?? "Pro";
  const currentLabel = PLAN_INFO[planCode]?.label ?? "Starter";

  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="max-w-md text-center space-y-6 px-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">
            Función exclusiva de {planLabel}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tu plan actual (<span className="font-semibold">{currentLabel}</span>) no incluye este módulo.
            Actualiza tu plan para desbloquear esta funcionalidad y muchas más.
          </p>
        </div>
        <Button
          onClick={() => navigate("/app/pricing")}
          className="press-scale gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Ver planes
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
