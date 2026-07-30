import { useMemo, useState, useSyncExternalStore } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  isObservationModeEnabled,
  setObservationMode,
} from "@/lib/change-intelligence/flags";
import { getObservationSink } from "@/lib/change-intelligence/adapters/scheduling/emit";
import {
  buildDivergenceReport,
  buildSimulatedConfigAlerts,
} from "@/lib/change-intelligence/observation/report";
import { aggregateUnresolved } from "@/lib/change-intelligence/observation/unresolved-aggregate";
import { runAllScenarios } from "@/lib/change-intelligence/validation/run-scenarios";
import { ObservationAccessGuard } from "@/components/change-intelligence/ObservationAccessGuard";
import { useAuth } from "@/hooks/useAuth";

function useRecords(userId: string | null, refreshKey: number) {
  return useMemo(() => {
    void refreshKey;
    return getObservationSink(userId).read?.() ?? [];
  }, [userId, refreshKey]);
}

export default function ChangeIntelligenceObservationPage() {
  return (
    <ObservationAccessGuard>
      <ChangeIntelligenceObservation />
    </ObservationAccessGuard>
  );
}

function ChangeIntelligenceObservation() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [showScenarios, setShowScenarios] = useState(false);
  const enabled = useSyncExternalStore(
    () => () => {},
    () => isObservationModeEnabled(),
    () => false,
  );
  const [, force] = useState(0);

  const liveRecords = useRecords(userId, refreshKey);
  const scenarioResults = useMemo(() => (showScenarios ? runAllScenarios() : []), [showScenarios]);
  const records = useMemo(
    () => (showScenarios ? scenarioResults.map((r) => r.record) : liveRecords),
    [showScenarios, scenarioResults, liveRecords],
  );
  const report = useMemo(() => buildDivergenceReport(records), [records]);
  const alerts = useMemo(() => buildSimulatedConfigAlerts(records), [records]);
  const unresolved = useMemo(() => aggregateUnresolved(records), [records]);


  const metrics: Array<[string, string | number]> = [
    ["Destinatarios legacy", report.legacyRecipients],
    ["Destinatarios CI", report.ciRecipients],
    ["Reducción de volumen", `${report.volumeReductionPct}%`],
    ["Interrupciones suprimidas", report.suppressedInterruptions],
    ["Eventos sin manager resuelto", report.unresolvedManagerEvents],
    ["Afectados no alcanzables", report.affectedButUnreachable],
    ["Operaciones consolidadas", report.consolidatedOperations],
    ["Duplicados evitados", report.duplicateNotificationsAvoided],
    ["Nivel 0 silenciados", report.level0Silenced],
    ["Managers legacy sin relación", report.legacyManagersWithoutExplicitRelation],
  ];

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <Helmet>
        <title>Change Intelligence — Modo Observación</title>
        <meta
          name="description"
          content="Log de simulación del motor Change Intelligence en modo observación. No envía notificaciones."
        />
      </Helmet>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Change Intelligence — Modo Observación</h1>
          <Badge variant="outline">F1</Badge>
          <Badge variant="secondary">Simulación · no envía nada</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          El motor detecta, clasifica y simula. No existe ninguna ruta de envío en esta fase.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Control</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Switch
              id="ci-observation"
              checked={enabled}
              onCheckedChange={(v) => {
                setObservationMode(v);
                force((n) => n + 1);
              }}
            />
            <Label htmlFor="ci-observation">Modo observación activo</Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            Recargar log
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              getObservationSink(userId).clear?.();
              setRefreshKey((k) => k + 1);
            }}
          >
            Limpiar buffer
          </Button>
          <span className="text-sm text-muted-foreground">{records.length} registros</span>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {metrics.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Causas de manager no resuelto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.unresolvedCauses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin causas registradas.</p>
          ) : (
            report.unresolvedCauses.map((c) => (
              <div key={c.cause} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="font-mono">{c.cause}</span>
                <Badge variant="outline">{c.count}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Alertas de configuración simuladas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna alerta agregada.</p>
          ) : (
            alerts.map((a) => (
              <div
                key={`${a.companyId}-${a.cause}-${a.windowDay}`}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <span className="font-mono">
                  {a.windowDay} · {a.cause}
                </span>
                <Badge variant="outline">{a.count}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Registros de observación (redactados)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[500px] overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(records.slice(-25), null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
