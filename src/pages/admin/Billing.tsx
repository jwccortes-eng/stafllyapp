import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Calendar, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import UpgradeBanner from "@/components/billing/UpgradeBanner";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Activa", variant: "default" },
  trialing: { label: "Prueba", variant: "secondary" },
  past_due: { label: "Pago pendiente", variant: "destructive" },
  canceled: { label: "Cancelada", variant: "outline" },
  incomplete: { label: "Incompleta", variant: "destructive" },
};

export default function Billing() {
  const { subscription, isLoading, plan, isActive } = useSubscription();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const statusInfo = statusLabels[subscription?.status ?? ""] ?? { label: "Sin suscripción", variant: "outline" as const };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-heading tracking-tight">Facturación</h1>
          <p className="text-xs text-muted-foreground mt-1">Gestión de plan y suscripción</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/pricing")}>
          Ver planes <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {!isActive && <UpgradeBanner />}

      {/* Current plan card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Plan actual</CardTitle>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <CardDescription>
            {plan === "free" ? "Plan gratuito — funciones básicas" : `Plan ${plan}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {subscription?.stripe_customer_id
                ? `Cliente: ${subscription.stripe_customer_id.slice(0, 12)}...`
                : "Sin método de pago configurado"}
            </span>
          </div>
          {subscription?.current_period_end && (
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Próxima renovación: {format(new Date(subscription.current_period_end), "d MMM yyyy", { locale: es })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de pagos</CardTitle>
          <CardDescription>Los pagos aparecerán aquí cuando Stripe esté conectado</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground/50 text-sm">
            Sin registros aún
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
