import { useSubscription } from "@/hooks/useSubscription";
import { useOpenCustomerPortal } from "@/hooks/useBilling";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CreditCard, Calendar, ArrowRight, Receipt, ExternalLink, AlertTriangle } from "lucide-react";
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
  const portalMutation = useOpenCustomerPortal();

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  const statusInfo = statusLabels[subscription?.status ?? ""] ?? { label: "Sin suscripción", variant: "outline" as const };
  const cancelAtEnd = (subscription as any)?.cancel_at_period_end === true;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-heading tracking-tight">Facturación</h1>
          <p className="text-xs text-muted-foreground mt-1">Gestión de plan y suscripción</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="press-scale"
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Portal de cliente
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/pricing")} className="press-scale">
            Ver planes <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {!isActive && <UpgradeBanner />}

      {cancelAtEnd && (
        <div className="rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 flex items-center gap-3 animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm text-warning font-medium">
            Tu suscripción se cancelará al final del periodo actual.
          </p>
        </div>
      )}

      {/* Current plan card */}
      <Card className="hover-lift">
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

      {/* Billing history placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de pagos</CardTitle>
          <CardDescription>Los pagos aparecerán aquí cuando Stripe esté conectado</CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO: Replace with real billing_events query when Stripe is active */}
          <EmptyState
            icon={Receipt}
            title="Sin registros aún"
            description="El historial de pagos se mostrará aquí una vez que la pasarela esté activa."
            compact
          />
        </CardContent>
      </Card>
    </div>
  );
}
