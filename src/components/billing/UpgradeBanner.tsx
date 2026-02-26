import { useSubscription } from "@/hooks/useSubscription";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface UpgradeBannerProps {
  feature?: string;
}

export default function UpgradeBanner({ feature }: UpgradeBannerProps) {
  const { isPremium, isLoading } = useSubscription();
  const navigate = useNavigate();

  if (isLoading || isPremium) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-4 animate-slide-up press-scale">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 animate-scale-in">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {feature ? `"${feature}" es una función premium` : "Desbloquea todas las funciones"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Actualiza tu plan para acceder a herramientas avanzadas.
        </p>
      </div>
      <Button size="sm" onClick={() => navigate("/app/billing")}>
        Upgrade
      </Button>
    </div>
  );
}
