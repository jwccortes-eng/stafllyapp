import { useSubscription } from "@/hooks/useSubscription";
import { useContactSales } from "@/hooks/useBilling";
import { Sparkles, Clock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradeBannerProps {
  feature?: string;
  moduleKey?: string;
}

export default function UpgradeBanner({ feature, moduleKey }: UpgradeBannerProps) {
  const { isPremium, isLoading, isTrial, trialDaysLeft, requiredPlanForModule } = useSubscription();
  const { contactSales } = useContactSales();

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
            "Contacta a nuestro equipo para activar funciones avanzadas."
          )}
        </p>
      </div>
      <Button size="sm" onClick={() => contactSales("whatsapp")} className="gap-1.5">
        <MessageCircle className="h-4 w-4" />
        Hablar con ventas
      </Button>
    </div>
  );
}
