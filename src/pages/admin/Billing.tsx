import { useSubscription, PLAN_INFO } from "@/hooks/useSubscription";
import { useContactSales, useRequestUpgrade } from "@/hooks/useBilling";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CreditCard, Calendar, ArrowRight, Receipt, MessageCircle, Users, ShieldCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import UpgradeBanner from "@/components/billing/UpgradeBanner";
import { PageHeader } from "@/components/ui/page-header";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Activo", variant: "default" },
  suspended: { label: "Suspendido", variant: "destructive" },
  pending: { label: "Pendiente", variant: "secondary" },
};

const billingLabels: Record<string, string> = {
  none: "Sin solicitud",
  contact_requested: "Contacto solicitado",
  invoiced: "Facturado",
  paid: "Pagado",
};

export default function Billing() {
  const {
    isLoading, planCode, planStatus, billingStatus,
    isPaid, maxEmployees, maxAdmins, companyPlan,
    hasRequestedUpgrade,
  } = useSubscription();
  const navigate = useNavigate();
  const { contactSales } = useContactSales();
  const requestUpgrade = useRequestUpgrade();

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  const planInfo = PLAN_INFO[planCode] ?? PLAN_INFO.free;
  const statusInfo = statusLabels[planStatus] ?? statusLabels.active;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        variant="2"
        icon={CreditCard}
        title="Facturación"
        subtitle="Gestión de plan y suscripción"
        badge={planInfo.label}
        rightSlot={
          <div className="flex items-center gap-2">
            {!isPaid && !hasRequestedUpgrade && (
              <Button
                variant="default"
                size="sm"
                onClick={() => requestUpgrade.mutate({})}
                disabled={requestUpgrade.isPending}
                className="press-scale gap-1.5"
              >
                <Sparkles className="h-4 w-4" />Solicitar Pro
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => contactSales("whatsapp")} className="press-scale gap-1.5">
              <MessageCircle className="h-4 w-4" />Ventas
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/app/pricing")} className="press-scale">
              Ver planes <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        }
      />

      {!isPaid && <UpgradeBanner />}

      {/* Current plan card */}
      <Card className="hover-lift">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Plan actual</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              <Badge variant="outline">{planCode === "free" ? "Gratis" : "Pro"}</Badge>
            </div>
          </div>
          <CardDescription>{planInfo.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              Hasta {maxEmployees} empleados · {maxAdmins} admin{maxAdmins !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              Features premium: {companyPlan?.paid_features_enabled ? "Activadas" : "No activadas"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              Billing: {billingLabels[billingStatus] ?? billingStatus}
            </span>
          </div>
          {companyPlan?.plan_activated_at && (
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Plan activado: {format(new Date(companyPlan.plan_activated_at), "d MMM yyyy", { locale: es })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade CTA for free plan */}
      {planCode === "free" && !hasRequestedUpgrade && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-semibold">¿Necesitas más funciones?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Contacta a nuestro equipo para activar un plan Pro con nómina, reportes avanzados y más.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => requestUpgrade.mutate({})}
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
