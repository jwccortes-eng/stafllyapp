/**
 * F1.2 — Durable Shadow Observation panel section.
 *
 * Read-only evidence ledger. It cannot send anything: the client has no
 * INSERT policy and this component has no delivery action.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  isDurableObservationEnabled,
  setDurableObservation,
  getDurableEnvironment,
  getDurablePilotStage,
} from "@/lib/change-intelligence/flags";
import { getDurableSinkStats } from "@/lib/change-intelligence/observation/durable-sink";

interface DurableRow {
  observation_id: string;
  company_id: string;
  change_type: string;
  impact_level: number;
  observed_at: string;
  environment: string;
  pilot_stage: number;
  unresolved_count: number;
  unreachable_count: number;
  legacy_recipient_count: number;
  ci_recipient_count: number;
  message_quality_gate: string | null;
  privacy_gate: string | null;
  simulated_channel: string;
  observation_only: boolean;
}

interface PilotRow {
  company_id: string;
  pilot_stage: number;
  environment: string;
  enabled: boolean;
  expires_at: string | null;
  daily_limit: number;
}

export function DurableObservationPanel() {
  const [rows, setRows] = useState<DurableRow[]>([]);
  const [pilot, setPilot] = useState<PilotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [durable, setDurable] = useState(() => isDurableObservationEnabled());
  const [stats, setStats] = useState(() => getDurableSinkStats());

  const load = useCallback(async () => {
    setLoading(true);
    const [obs, allow] = await Promise.all([
      supabase
        .from("ci_observations")
        .select(
          "observation_id, company_id, change_type, impact_level, observed_at, environment, pilot_stage, unresolved_count, unreachable_count, legacy_recipient_count, ci_recipient_count, message_quality_gate, privacy_gate, simulated_channel, observation_only",
        )
        .order("observed_at", { ascending: false })
        .limit(100),
      supabase
        .from("ci_pilot_allowlist")
        .select("company_id, pilot_stage, environment, enabled, expires_at, daily_limit"),
    ]);
    setRows((obs.data as DurableRow[]) ?? []);
    setPilot((allow.data as PilotRow[]) ?? []);
    setStats(getDurableSinkStats());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runMaintenance = async (action: "purge" | "stats" | "delete_company", companyId?: string) => {
    const { data, error } = await supabase.functions.invoke("ci-observation-maintenance", {
      body: { action, company_id: companyId },
    });
    if (error) {
      toast.error(`Mantenimiento falló: ${error.message}`);
      return;
    }
    toast.success(`Mantenimiento (${action}): ${JSON.stringify(data)}`);
    void load();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">F1.2 — Observación durable (evidencia)</CardTitle>
          <Badge variant="outline">Etapa {getDurablePilotStage()}</Badge>
          <Badge variant="secondary">{getDurableEnvironment()}</Badge>
          <Badge variant="secondary">Sin canal de entrega</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Switch
              id="ci-durable"
              checked={durable}
              onCheckedChange={(v) => {
                setDurableObservation(v);
                setDurable(isDurableObservationEnabled());
              }}
            />
            <Label htmlFor="ci-durable">Persistencia durable (OFF por defecto)</Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Recargar evidencia
          </Button>
          <Button variant="outline" size="sm" onClick={() => void runMaintenance("purge")}>
            Purgar vencidos (30/90 d)
          </Button>
          <span className="text-xs text-muted-foreground">
            Envíos: {stats.attempted} intentos · {stats.accepted} aceptados · {stats.failed} fallidos
            (sin reintentos)
          </span>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Allowlist del piloto ({pilot.length})
          </p>
          <div className="space-y-1">
            {pilot.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin compañías autorizadas: no se observa nada.
              </p>
            )}
            {pilot.map((p) => (
              <div
                key={p.company_id}
                className="flex flex-wrap items-center gap-3 rounded-md border p-2 text-sm"
              >
                <code className="text-xs">{p.company_id}</code>
                <Badge variant={p.enabled ? "default" : "outline"}>
                  {p.enabled ? "activa" : "inactiva"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  etapa {p.pilot_stage} · {p.environment} · límite {p.daily_limit}/día
                  {p.expires_at ? ` · vence ${new Date(p.expires_at).toLocaleString()}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void runMaintenance("delete_company", p.company_id)}
                >
                  Borrar evidencia de esta compañía
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Últimas observaciones persistidas ({rows.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2">Observado</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Nivel</th>
                  <th className="p-2">Legacy → CI</th>
                  <th className="p-2">Sin resolver</th>
                  <th className="p-2">Gates</th>
                  <th className="p-2">Canal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.observation_id} className="border-t">
                    <td className="p-2">{new Date(r.observed_at).toLocaleString()}</td>
                    <td className="p-2 font-mono">{r.change_type}</td>
                    <td className="p-2">L{r.impact_level}</td>
                    <td className="p-2">
                      {r.legacy_recipient_count} → {r.ci_recipient_count}
                    </td>
                    <td className="p-2">{r.unresolved_count}</td>
                    <td className="p-2">
                      msg:{r.message_quality_gate ?? "-"} / priv:{r.privacy_gate ?? "-"}
                    </td>
                    <td className="p-2">{r.simulated_channel}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="p-2 text-muted-foreground" colSpan={7}>
                      Sin evidencia persistida.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
