import { useState } from "react";
import { Check, MessageCircle, Mail, CheckCircle2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/useSubscription";
import { useContactSales } from "@/hooks/useBilling";
import { cn } from "@/lib/utils";
import UpgradeRequestDialog from "@/components/billing/UpgradeRequestDialog";

const plans = [
  {
    id: "free" as const,
    name: "Starter",
    price: "$0",
    period: "/mes",
    description: "Para equipos pequeños que están iniciando",
    features: [
      "Hasta 2 administradores",
      "Hasta 10 empleados",
      "Directorio y turnos básicos",
      "Portal de empleados",
      "Reloj de entrada/salida básico",
      "Anuncios",
      "Aplicaciones de empleo",
    ],
    isFree: true,
  },
  {
    id: "paid_manual" as const,
    name: "Pro",
    price: "Personalizado",
    period: "",
    description: "Para empresas en crecimiento",
    popular: true,
    features: [
      "Administradores ampliados",
      "Empleados ampliados o ilimitados",
      "Nómina completa y reconciliación",
      "Reportes avanzados",
      "Clientes y ubicaciones",
      "Command center",
      "Chat interno",
      "Automatizaciones",
      "Soporte prioritario",
    ],
  },
];

export default function Pricing() {
  const { planCode, isLoading, hasRequestedUpgrade, maxEmployees, maxAdmins } = useSubscription();
  const { contactSales } = useContactSales();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <div className="space-y-8 animate-fade-in">
      <UpgradeRequestDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      <PageHeader
        variant="4"
        eyebrow="PLANES"
        title="Planes y precios"
        subtitle="Elige el plan que mejor se adapte a tu operación."
      />

      {/* Manual upgrade notice */}
      <div className="max-w-4xl mx-auto rounded-xl border border-muted bg-muted/30 px-5 py-3 flex items-center gap-3">
        <MessageCircle className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Los planes pagos se activan de forma personalizada
          </p>
          <p className="text-xs text-muted-foreground">
            Contáctanos por WhatsApp o email para activar tu plan. Próximamente habilitaremos el pago en línea.
          </p>
        </div>
      </div>

      {hasRequestedUpgrade && (
        <div className="max-w-4xl mx-auto rounded-xl border border-green-500/20 bg-green-50 dark:bg-green-950/20 px-5 py-3 flex items-center gap-3 animate-slide-up">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Tu solicitud de upgrade fue enviada</p>
            <p className="text-xs text-muted-foreground">
              Nuestro equipo se pondrá en contacto contigo pronto para activar tu plan Pro.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {plans.map((p, idx) => {
          const isCurrent = planCode === p.id;
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
              {isCurrent && (
                <Badge variant="outline" className="absolute -top-2.5 right-4 shadow-sm bg-background">
                  Plan actual
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <CardDescription>{p.description}</CardDescription>
                <div className="mt-3">
                  <span className="text-3xl font-bold">{p.price}</span>
                  {p.period && <span className="text-muted-foreground text-sm">{p.period}</span>}
                </div>
                {isCurrent && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Límite actual: {maxEmployees} empleados · {maxAdmins} admin{maxAdmins !== 1 ? 's' : ''}
                  </p>
                )}
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
              <CardFooter className="flex flex-col gap-2">
                {isCurrent ? (
                  <div className="w-full text-center text-sm text-muted-foreground py-2">
                    ✓ Este es tu plan actual
                  </div>
                ) : p.isFree ? (
                  <div className="w-full text-center text-sm text-muted-foreground py-2">
                    Incluido gratis
                  </div>
                ) : (
                  <>
                    {!hasRequestedUpgrade && (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => requestUpgrade.mutate({})}
                        disabled={requestUpgrade.isPending}
                      >
                        <Sparkles className="h-4 w-4 mr-1.5" />
                        Solicitar plan Pro
                      </Button>
                    )}
                    <Button
                      className="w-full gap-1.5"
                      variant={hasRequestedUpgrade ? "outline" : "default"}
                      onClick={() => contactSales("whatsapp")}
                      disabled={isLoading}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Hablar con ventas
                    </Button>
                    <Button
                      className="w-full gap-1.5"
                      variant="ghost"
                      size="sm"
                      onClick={() => contactSales("email")}
                    >
                      <Mail className="h-4 w-4" />
                      Enviar email
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
