import { useSubscription, PLAN_LIMITS } from "@/hooks/useSubscription";
import { useContactSales } from "@/hooks/useBilling";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CreditCard, Calendar, ArrowRight, Receipt, MessageCircle, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import UpgradeBanner from "@/components/billing/UpgradeBanner";
import { PageHeader } from "@/components/ui/page-header";

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
  const { contactSales } = useContactSales();

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  const statusInfo = statusLabels[subscription?.status ?? ""] ?? { label: "Plan gratuito", variant: "outline" as const };
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        variant="2"
        icon={CreditCard}
        title="Facturación"
        subtitle="Gestión de plan y suscripción"
        badge={isActive ? statusInfo.label : "Gratuito"}
        rightSlot={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => contactSales("whatsapp")} className="press-scale gap-1.5">
              <MessageCircle className="h-4 w-4" />Contactar ventas
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/app/pricing")} className="press-scale">
              Ver planes <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        }
      />

      {!isActive && <UpgradeBanner />}

      {/* Current plan card */}
      <Card className="hover-lift">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Plan actual</CardTitle>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <CardDescription>
            {plan === "free"
              ? "Plan gratuito — funciones básicas incluidas"
              : `Plan ${limits.label}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {plan === "free"
                ? "Sin método de pago requerido"
                : "Plan activado manualmente por el equipo de StaflyApps"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Límite: hasta {limits.maxEmployees === Infinity ? '∞' : limits.maxEmployees} empleados
              {" · "}
              {limits.maxAdmins === Infinity ? '∞' : limits.maxAdmins} admin{limits.maxAdmins !== 1 ? 's' : ''}
            </span>
          </div>
          {subscription?.current_period_end && (
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Vigente hasta: {format(new Date(subscription.current_period_end), "d MMM yyyy", { locale: es })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade CTA */}
      {plan === "free" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-semibold">¿Necesitas más funciones?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Contacta a nuestro equipo para activar un plan Pro o Enterprise. Próximamente habilitaremos el pago en línea.
                </p>
              </div>
              <Button size="sm" onClick={() => contactSales("whatsapp")} className="gap-1.5 shrink-0">
                <MessageCircle className="h-4 w-4" />
                Hablar con ventas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de pagos</CardTitle>
          <CardDescription>Los pagos aparecerán aquí cuando se active un plan pago</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Receipt}
            title="Sin registros aún"
            description="El historial de pagos se mostrará aquí una vez que tu plan pago esté activo."
            compact
          />
        </CardContent>
      </Card>
    </div>
  );
}
