/**
 * Panel interno de diagnóstico de entitlements (SOMBRA).
 * Visible solo para administradores con acceso de facturación.
 * No bloquea nada: informa qué haría el motor canónico si estuviera activo.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge } from "lucide-react";
import { useEntitlementShadow } from "@/hooks/useEntitlementShadow";
import type { EntitlementEvaluation, ShadowStatus } from "@/lib/commercial/entitlements";

const STATUS_LABEL: Record<ShadowStatus, string> = {
  WITHIN_LIMIT: "Dentro del límite",
  NEAR_LIMIT: "Cerca del límite",
  AT_LIMIT: "En el límite",
  WOULD_EXCEED: "Superaría el límite",
  UNLIMITED: "Sin tope",
  CUSTOM: "Capacidad contractual",
  NEEDS_REVIEW: "Requiere revisión",
};

const STATUS_VARIANT: Record<ShadowStatus, "default" | "secondary" | "destructive" | "outline"> = {
  WITHIN_LIMIT: "secondary",
  NEAR_LIMIT: "outline",
  AT_LIMIT: "outline",
  WOULD_EXCEED: "destructive",
  UNLIMITED: "secondary",
  CUSTOM: "secondary",
  NEEDS_REVIEW: "destructive",
};

function Row({ label, e }: { label: string; e: EntitlementEvaluation }) {
  const limit = e.effective_limit === null ? "sin tope" : e.effective_limit;
  const remaining =
    e.remaining_capacity === null ? "—" : `${e.remaining_capacity} disponibles`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          {e.current_usage} / {limit} · {remaining}
        </p>
        <p className="text-xs text-muted-foreground">
          {e.override
            ? `Ajuste vigente: ${e.override.reason}`
            : "Sin ajuste específico"}
        </p>
      </div>
      <Badge variant={STATUS_VARIANT[e.status]}>{STATUS_LABEL[e.status]}</Badge>
    </div>
  );
}

export default function EntitlementDiagnosticPanel({
  companyId,
}: { companyId?: string | null }) {
  const { data, isLoading } = useEntitlementShadow(companyId);
  if (isLoading || !data) return null;

  const { workers, admins } = data;
  const planText = workers.plan ? workers.plan_label : "El plan requiere revisión";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" />
          Capacidad del plan
        </CardTitle>
        <CardDescription>
          Lectura informativa. Todavía no limita ninguna acción.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{planText}</Badge>
          {workers.conflicts.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Señales de plan que no coinciden
            </span>
          )}
        </div>
        <Row label="Personas activas" e={workers} />
        <Row label="Administradores" e={admins} />
      </CardContent>
    </Card>
  );
}
