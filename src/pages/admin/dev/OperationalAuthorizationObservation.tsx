import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, RefreshCw, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { OaiObservationGuard } from "@/components/operational-authorization/OaiObservationGuard";
import { getOaiSink } from "@/lib/operational-authorization/adapters/scheduling/emit";
import { computeMetrics, outcomeDistribution } from "@/lib/operational-authorization/observation/metrics";
import { getOaiSinkStats } from "@/lib/operational-authorization/observation/durable-sink";
import {
  isKillSwitchEngaged,
  isObservationEnabled,
  isPersistenceEnabled,
  setKillSwitch,
  setObservationEnabled,
  setPersistenceEnabled,
} from "@/lib/operational-authorization/flags";

export default function OperationalAuthorizationObservationPage() {
  return (
    <OaiObservationGuard>
      <OperationalAuthorizationObservation />
    </OaiObservationGuard>
  );
}

function OperationalAuthorizationObservation() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [, force] = useState(0);

  const records = useMemo(() => {
    void refreshKey;
    return getOaiSink().read();
  }, [refreshKey]);

  const metrics = useMemo(() => computeMetrics(records), [records]);
  const outcomes = useMemo(() => outcomeDistribution(records), [records]);
  const stats = getOaiSinkStats();

  const contradictions = records.filter((r) => r.contradictionDetected);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Helmet>
        <title>OAI · Modo Observación (interno)</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">Operational Authorization · Modo Observación</h1>
          <Badge variant="secondary">F1 · Etapa 1</Badge>
          <Badge variant="outline">observationOnly = true</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Este panel simula veredictos de autorización. No autoriza, no bloquea, no aprueba
          documentos y no modifica ninguna asignación. Todo lo que ves es evidencia de simulación.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Controles de la ventana</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <ToggleRow
            id="oai-observation"
            label="Observación"
            checked={isObservationEnabled()}
            onChange={(v) => {
              setObservationEnabled(v);
              force((n) => n + 1);
            }}
          />
          <ToggleRow
            id="oai-persistence"
            label="Persistencia durable"
            checked={isPersistenceEnabled()}
            onChange={(v) => {
              setPersistenceEnabled(v);
              force((n) => n + 1);
            }}
          />
          <ToggleRow
            id="oai-kill"
            label="Kill switch"
            checked={isKillSwitchEngaged()}
            onChange={(v) => {
              setKillSwitch(v);
              force((n) => n + 1);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((n) => n + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Observaciones en memoria" value={records.length} />
        <StatCard label="Enviadas a evidencia durable" value={stats.accepted} />
        <StatCard label="Descartadas por privacidad" value={stats.droppedByPrivacy} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Veredictos simulados</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {outcomes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin observaciones todavía.</p>
          ) : (
            outcomes.map(([outcome, count]) => (
              <Badge key={outcome} variant="outline">
                {outcome} · {count}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Contradicciones observadas ({contradictions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Una contradicción es una divergencia entre lo que el sistema mostró y lo que la
            organización hizo. No es un error del usuario ni un override.
          </p>
          {contradictions.slice(0, 20).map((r) => (
            <div
              key={r.observationId}
              className="rounded-md border p-3 text-xs text-muted-foreground"
            >
              <span className="font-medium text-foreground">{r.systemReadinessState}</span>
              {" → "}
              {r.humanAction} / {r.assignmentResult} · simulado:{" "}
              <span className="font-medium text-foreground">{r.simulatedOaiOutcome}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Métricas (25)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.key} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{metric.label}</span>
                {metric.status !== "observable" && (
                  <Badge variant="outline" className="text-[10px]">
                    {metric.status === "partial" ? "parcial" : "no observable"}
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-lg font-semibold">
                {metric.value === null ? "—" : metric.value}
                {metric.value !== null && metric.unit === "percent" ? "%" : ""}
              </div>
              {metric.note && (
                <p className="mt-1 text-[11px] text-muted-foreground">{metric.note}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Sin canales de entrega, sin colas y sin reintentos. La evidencia detallada se elimina a
          los 30 días y los agregados a los 90.
        </span>
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
