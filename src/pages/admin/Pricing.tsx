import { Check, Sparkles, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/useSubscription";
import { useCreateCheckoutSession } from "@/hooks/useBilling";
import { cn } from "@/lib/utils";

const plans = [
  {
    id: "free",
    name: "Starter",
    price: "$0",
    period: "/mes",
    description: "Para equipos pequeños que están iniciando",
    features: [
      "1 administrador",
      "Hasta 25 empleados",
      "Directorio y turnos básicos",
      "Anuncios",
    ],
    priceId: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    period: "/mes",
    description: "Para empresas en crecimiento",
    popular: true,
    features: [
      "Hasta 3 administradores",
      "Hasta 100 empleados",
      "Reloj de entrada/salida",
      "Nómina completa",
      "Reportes avanzados",
      "Clientes y ubicaciones",
      "Soporte prioritario",
    ],
    priceId: "price_1T5C9xK7PYTRtWks5cRmmPtJ",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$149",
    period: "/mes",
    description: "Para operaciones a gran escala",
    features: [
      "Todo en Pro",
      "Admins y empleados ilimitados",
      "Multi-empresa",
      "Chat interno",
      "Automatizaciones",
      "API externa",
      "SLA garantizado",
    ],
    priceId: "price_1T5CAJK7PYTRtWksY7nUGqB5",
  },
];

export default function Pricing() {
  const { plan: currentPlan, isLoading, isTrial, trialDaysLeft } = useSubscription();
  const checkoutMutation = useCreateCheckoutSession();

  const handleCheckout = (priceId: string | null) => {
    if (!priceId) return;
    checkoutMutation.mutate({ priceId });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        variant="4"
        eyebrow="PLANES"
        title="Planes y precios"
        subtitle="Elige el plan que mejor se adapte a tu operación"
      />

      {/* Trial notice */}
      {isTrial && trialDaysLeft !== null && (
        <div className="max-w-5xl mx-auto rounded-xl border border-primary/20 bg-primary/5 px-5 py-3 flex items-center gap-3 animate-slide-up">
          <Clock className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              Estás en tu prueba Pro gratuita
            </p>
            <p className="text-xs text-muted-foreground">
              {trialDaysLeft > 0
                ? `Te quedan ${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''} para explorar todas las funciones Pro.`
                : 'Tu prueba ha expirado. Selecciona un plan para continuar.'}
            </p>
          </div>
          <Sparkles className="h-5 w-5 text-primary/40" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((p, idx) => {
          const isCurrent = currentPlan === p.id;
          const isTrialPlan = isTrial && p.id === "pro";
          return (
            <Card
              key={p.id}
              className={cn(
                "flex flex-col relative hover-lift press-scale animate-slide-up",
                p.popular && "border-primary shadow-md ring-1 ring-primary/20"
              )}
              style={{ animationDelay: `${idx * 80}ms`, animationFillMode: 'backwards' }}
            >
              {p.popular && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 shadow-sm">
                  Más popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <CardDescription>{p.description}</CardDescription>
                <div className="mt-3">
                  <span className="text-3xl font-bold">{p.price}</span>
                  <span className="text-muted-foreground text-sm">{p.period}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={isCurrent || isTrialPlan ? "outline" : p.popular ? "default" : "secondary"}
                  disabled={(isCurrent && !isTrial) || isLoading || checkoutMutation.isPending}
                  onClick={() => handleCheckout(p.priceId)}
                >
                  {isCurrent && !isTrial
                    ? "Plan actual"
                    : isTrialPlan
                      ? "Activar Pro"
                      : checkoutMutation.isPending
                        ? "Procesando…"
                        : p.priceId
                          ? "Seleccionar"
                          : "Plan actual"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
