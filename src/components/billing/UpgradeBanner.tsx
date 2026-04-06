import { useSubscription } from "@/hooks/useSubscription";
import { useContactSales, useRequestUpgrade } from "@/hooks/useBilling";
import { Sparkles, MessageCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradeBannerProps {
  feature?: string;
  moduleKey?: string;
}

export default function UpgradeBanner({ feature, moduleKey }: UpgradeBannerProps) {
  const { isPaid, isLoading, hasRequestedUpgrade, requiredPlanForModule } = useSubscription();
  const { contactSales } = useContactSales();
  const requestUpgrade = useRequestUpgrade();

  if (isLoading || isPaid) return null;

  const requiredPlan = moduleKey ? requiredPlanForModule(moduleKey) : null;

  if (hasRequestedUpgrade) {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-50 dark:bg-green-950/20 p-4 flex items-center gap-4 animate-slide-up">
        <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Solicitud de upgrade enviada</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Nuestro equipo se pondrá en contacto contigo pronto.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => contactSales("whatsapp")} className="gap-1.5">
          <MessageCircle className="h-4 w-4" />
          Contactar ahora
        </Button>
      </div>
    );
  }

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
          Contacta a nuestro equipo para activar funciones avanzadas.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            requestUpgrade.mutate({});
          }}
          disabled={requestUpgrade.isPending}
        >
          Solicitar plan
        </Button>
        <Button size="sm" onClick={() => contactSales("whatsapp")} className="gap-1.5">
          <MessageCircle className="h-4 w-4" />
          Ventas
        </Button>
      </div>
    </div>
  );
}
