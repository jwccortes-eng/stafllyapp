import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Layers, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import {
  computeShadowMetrics,
  type ShadowDecisionRow,
} from "@/lib/operational-signals/metrics";
import {
  isKillSwitchEngaged,
  isShadowPersistenceEnabled,
  setKillSwitch,
  setShadowPersistenceEnabled,
} from "@/lib/operational-signals/flags";
import { OSE_DECISION_VERSION } from "@/lib/operational-signals/version";

const PRIORITY_VARIANT: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
  silent: "outline",
};

export default function OperationalSignalsShadowPage() {
  const { selectedCompanyId } = useCompany();
  const [, force] = useState(0);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ose-shadow-decisions", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ShadowDecisionRow[]> => {
      const { data, error } = await supabase
        .from("operational_signal_shadow_decisions")
        .select(
          "id, company_id, event_type, notification_family, priority, should_group, requires_acknowledgement, suppress_reason, actual_recipients_count, recommended_recipients_count, estimated_noise_reduction, risk_detected, subject_user_id, created_at, current_system_action, dedupe_key",
        )
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as ShadowDecisionRow[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);
  const metrics = useMemo(() => computeShadowMetrics(rows), [rows]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Helmet>
        <title>Operational Signals · Shadow Mode (interno)</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">Operational Signals — Shadow Mode</h1>
          <Badge variant="secondary">F1</Badge>
          <Badge variant="outline">operational_signal_shadow_mode = true</Badge>
          <Badge variant="outline">{OSE_DECISION_VERSION}</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Esta capa solo observa. No envía notificaciones, no silencia las actuales, no cambia
          push, email, SMS ni chat, y no altera preferencias. Compara lo que el sistema actual
          hizo contra lo que el motor de señales habría recomendado.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Controles de observación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="ose-persist"
              checked={isShadowPersistenceEnabled()}
              onCheckedChange={(v) => {
                setShadowPersistenceEnabled(v);
                force((n) => n + 1);
              }}
            />
            <Label htmlFor="ose-persist">Registrar decisiones sombra</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="ose-kill"
              checked={isKillSwitchEngaged()}
              onCheckedChange={(v) => {
                setKillSwitch(v);
                force((n) => n + 1);
              }}
            />
            <Label htmlFor="ose-kill">Kill switch (detiene toda observación)</Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Eventos observados" value={metrics.totalEvents} />
        <Metric
          label="Reducción de ruido estimada"
          value={`${metrics.estimatedNotificationReductionPct}%`}
        />
        <Metric label="Agrupables" value={metrics.groupableEvents} icon={<Layers className="h-4 w-4" />} />
        <Metric
          label="Alertas críticas"
          value={metrics.criticalAlerts}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <Metric label="Audiencia demasiado amplia" value={metrics.overBroadAudienceEvents} />
        <Metric label="Requerirían confirmación" value={metrics.acknowledgementNeededEvents} />
        <Metric label="Podrían ser silenciosos" value={metrics.silentCandidates} />
        <Metric
          label="Familia más ruidosa"
          value={metrics.noisiestFamilies[0]?.family ?? "—"}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Actual vs recomendado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aún no hay decisiones sombra registradas para esta compañía.
            </p>
          )}
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
            >
              <Badge variant={PRIORITY_VARIANT[row.priority] ?? "outline"}>{row.priority}</Badge>
              <Badge variant="outline">{row.notification_family}</Badge>
              <span className="font-medium">{row.event_type}</span>
              <span className="text-muted-foreground">
                actual {row.actual_recipients_count} → recomendado{" "}
                {row.recommended_recipients_count}
              </span>
              {row.should_group && <Badge variant="secondary">agrupar</Badge>}
              {row.requires_acknowledgement && <Badge variant="secondary">confirmación</Badge>}
              {row.suppress_reason && (
                <span className="text-muted-foreground italic">{row.suppress_reason}</span>
              )}
              {(row.risk_detected ?? []).map((risk) => (
                <Badge key={risk} variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {risk}
                </Badge>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
