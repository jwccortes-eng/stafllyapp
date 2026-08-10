/**
 * CLIENT TRUTH LAYER V1 — vista administrativa "Posibles duplicados".
 *
 * Sólo registra decisiones humanas. NO fusiona, NO borra, NO mueve servicios
 * ni facturas. "Consolidar" queda deshabilitado hasta que exista un contrato
 * de merge auditado (VWC) que preserve referencias.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ExternalLink, Loader2, Merge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  duplicatePairKey,
  type ClientDuplicatePair,
  type ClientTruth,
} from "@/lib/clients/client-truth";

const REASON_LABEL: Record<ClientDuplicatePair["reason"], string> = {
  same_normalized_name: "Mismo nombre normalizado",
  similar_name: "Nombre muy parecido",
  same_email: "Mismo email",
  same_phone: "Mismo teléfono",
};

interface Props {
  pairs: ClientDuplicatePair[];
  truths: ClientTruth[];
  canEdit: boolean;
}

export function ClientDuplicatesPanel({ pairs, truths, canEdit }: Props) {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const truthById = useMemo(() => {
    const map: Record<string, ClientTruth> = {};
    truths.forEach((t) => (map[t.clientId] = t));
    return map;
  }, [truths]);

  const decisions = useQuery({
    queryKey: ["client-duplicate-reviews", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_duplicate_reviews")
        .select("client_a_id, client_b_id, decision")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => {
        map[duplicatePairKey(r.client_a_id, r.client_b_id)] = r.decision;
      });
      return map;
    },
  });

  const record = async (pair: ClientDuplicatePair, decision: "not_duplicate" | "needs_review") => {
    if (!selectedCompanyId) return;
    const [a, b] = pair.a.id < pair.b.id ? [pair.a.id, pair.b.id] : [pair.b.id, pair.a.id];
    const key = duplicatePairKey(a, b);
    setSavingKey(key);
    const { error } = await supabase
      .from("client_duplicate_reviews")
      .upsert(
        {
          company_id: selectedCompanyId,
          client_a_id: a,
          client_b_id: b,
          decision,
          decided_by: user?.id ?? null,
        } as any,
        { onConflict: "company_id,client_a_id,client_b_id" },
      );
    setSavingKey(null);
    if (error) {
      toast.error("No se pudo guardar la decisión", { description: error.message });
      return;
    }
    toast.success(
      decision === "not_duplicate" ? "Marcado como clientes distintos" : "Marcado para revisar",
      { description: "No se modificó ningún cliente ni servicio." },
    );
    qc.invalidateQueries({ queryKey: ["client-duplicate-reviews", selectedCompanyId] });
  };

  const visible = pairs.filter(
    (p) => decisions.data?.[duplicatePairKey(p.a.id, p.b.id)] !== "not_duplicate",
  );

  if (pairs.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="Sin posibles duplicados"
        description="No se detectaron clientes con nombre, email o teléfono equivalentes."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {visible.length} par(es) por revisar · {pairs.length - visible.length} descartado(s). Registrar
        una decisión no modifica clientes, servicios ni facturas.
      </p>

      {visible.map((pair) => {
        const key = duplicatePairKey(pair.a.id, pair.b.id);
        const state = decisions.data?.[key];
        return (
          <Card key={key} className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-sm font-semibold">{REASON_LABEL[pair.reason]}</span>
                <Badge variant="secondary" className="text-[9px]">
                  {Math.round(pair.score * 100)}%
                </Badge>
                {state === "needs_review" && (
                  <Badge variant="outline" className="text-[9px]">
                    En revisión
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[pair.a, pair.b].map((c) => {
                const t = truthById[c.id];
                return (
                  <div key={c.id} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => window.open(`/app/clients?focus=${c.id}`, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {c.client_code ?? "—"} · {t?.lifecycle === "active" ? "Activo" : "Inactivo"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Contacto: {t?.primaryContact?.name ?? "Sin contacto principal"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Lugares: {t?.venues.length ?? 0} · Servicios: {t?.serviceCount ?? 0}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Última actividad: {t?.lastServiceAt ?? "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Connecteam:{" "}
                      {t?.connecteamMappingStatus === "configured"
                        ? "✓ destino configurado"
                        : "⚠ falta mapping"}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || savingKey === key}
                onClick={() => record(pair, "not_duplicate")}
              >
                {savingKey === key && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                No son duplicados
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || savingKey === key}
                onClick={() => record(pair, "needs_review")}
              >
                Revisar
              </Button>
              <Button size="sm" variant="ghost" disabled title="Requiere contrato de merge auditado">
                <Merge className="h-3.5 w-3.5 mr-1" />
                Consolidar (no disponible)
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default ClientDuplicatesPanel;
