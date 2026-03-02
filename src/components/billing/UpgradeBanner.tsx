import { useSubscription } from "@/hooks/useSubscription";
import { Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface UpgradeBannerProps {
  feature?: string;
  moduleKey?: string;
}

export default function UpgradeBanner({ feature, moduleKey }: UpgradeBannerProps) {
  const { isPremium, isLoading, isTrial, trialDaysLeft, requiredPlanForModule } = useSubscription();
  const navigate = useNavigate();

  if (isLoading || isPremium) return null;

  const requiredPlan = moduleKey ? requiredPlanForModule(moduleKey) : null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-4 animate-slide-up press-scale">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 animate-scale-in">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {feature ? `"${feature}" requiere plan ${requiredPlan || 'Pro'}` : "Desbloquea todas las funciones"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isTrial && trialDaysLeft !== null && trialDaysLeft > 0 ? (
            <>
              <Clock className="inline h-3 w-3 mr-1" />
              {trialDaysLeft} día{trialDaysLeft !== 1 ? 's' : ''} restantes de tu prueba Pro.
            </>
          ) : (
            "Actualiza tu plan para acceder a herramientas avanzadas."
          )}
        </p>
      </div>
      <Button size="sm" onClick={() => navigate("/app/pricing")}>
        Ver planes
      </Button>
    </div>
  );
}
