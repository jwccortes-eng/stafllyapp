import { Check } from "lucide-react";
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
      "Hasta 10 empleados",
      "Nómina semanal básica",
      "Turnos y reloj",
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
      "Empleados ilimitados",
      "Automatizaciones",
      "Reportes avanzados",
      "API externa",
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
      "Multi-empresa",
      "Monetización y facturación",
      "Integraciones personalizadas",
      "SLA garantizado",
    ],
    priceId: "price_1T5CAJK7PYTRtWksY7nUGqB5",
  },
];

export default function Pricing() {
  const { plan: currentPlan, isLoading } = useSubscription();
  const checkoutMutation = useCreateCheckoutSession();

  const handleCheckout = (priceId: string | null) => {
    if (!priceId) return;
    checkoutMutation.mutate({ priceId });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold font-heading tracking-tight">Planes y precios</h1>
        <p className="text-muted-foreground mt-2">Elige el plan que mejor se adapte a tu operación</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((p, idx) => {
          const isCurrent = currentPlan === p.id;
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
                  variant={isCurrent ? "outline" : p.popular ? "default" : "secondary"}
                  disabled={isCurrent || isLoading || checkoutMutation.isPending}
                  onClick={() => handleCheckout(p.priceId)}
                >
                  {isCurrent ? "Plan actual" : checkoutMutation.isPending ? "Procesando…" : "Seleccionar"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
