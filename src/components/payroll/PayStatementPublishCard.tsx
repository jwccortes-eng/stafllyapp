/**
 * PayStatementPublishCard — publicación controlada del recibo del trabajador.
 *
 * Única ruta de publicación: RPC `publish_pay_statement` (server-side).
 * El total se congela en el servidor; aquí solo se muestra la previsualización
 * y el resultado. Despublicar exige motivo y queda auditado.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, ShieldCheck, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";

interface Props {
  periodId: string;
  employeeId: string;
}

interface Preview {
  base_total: number;
  extras_total: number;
  deductions_total: number;
  projected_total: number;
  /** Suma del desglose (base + extras − descuentos). */
  computed_total: number;
  /** Total aprobado externo. `null` = no hay override. 0 es un valor válido. */
  approved_total_override: number | null;
  approved_total_source: string | null;
  /** Total EXACTO que congelará el servidor. Único válido para mostrar. */
  frozen_total_preview: number;
  has_override: boolean;
  line_count: number;
  pending_count: number;
}

interface StatementRow {
  id: string;
  status: string;
  source: string;
  frozen_total: number;
  published_at: string | null;
  revoke_reason: string | null;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export default function PayStatementPublishCard({ periodId, employeeId }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [statement, setStatement] = useState<StatementRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [previewRes, statementRes] = await Promise.all([
      supabase.rpc("pay_statement_preview", { _period_id: periodId, _employee_id: employeeId }),
      supabase
        .from("pay_statements")
        .select("id, status, source, frozen_total, published_at, revoke_reason")
        .eq("pay_period_id", periodId)
        .eq("employee_id", employeeId)
        .maybeSingle(),
    ]);
    setPreview((previewRes.data as unknown as Preview) ?? null);
    setStatement((statementRes.data as StatementRow | null) ?? null);
    setLoading(false);
  }, [periodId, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    setWorking(true);
    const { data, error } = await supabase.rpc("publish_pay_statement", {
      _period_id: periodId,
      _employee_id: employeeId,
      _source: "external_approved",
    });
    setWorking(false);
    if (error) {
      notifyError({
        title: "No se publicó el recibo",
        fact: error.message,
        consequence: "El trabajador sigue sin ver este pago.",
        cause: error,
      });
      return;
    }
    const total = (data as any)?.frozen_total;
    notifySuccess({
      title: "Recibo publicado",
      fact: `Total congelado en ${money(Number(total) || 0)}.`,
      consequence: "El trabajador ya puede verlo en Mis pagos.",
    });
    void load();
  };

  const unpublish = async () => {
    if (reason.trim().length < 3) {
      notifyWarning({
        title: "Falta el motivo",
        fact: "Despublicar exige una razón.",
        consequence: "El recibo sigue publicado.",
      });
      return;
    }
    setWorking(true);
    const { error } = await supabase.rpc("unpublish_pay_statement", {
      _statement_id: statement!.id,
      _reason: reason.trim(),
    });
    setWorking(false);
    if (error) {
      notifyError({
        title: "No se despublicó el recibo",
        fact: error.message,
        consequence: "El trabajador sigue viendo el total anterior.",
        cause: error,
      });
      return;
    }
    setReason("");
    notifySuccess({
      title: "Recibo despublicado",
      fact: "Queda registrado en la auditoría.",
      consequence: "Puedes corregir los movimientos y volver a publicar.",
    });
    void load();
  };

  const isPublished = statement?.status === "published";

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Recibo del trabajador
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando estado del recibo…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {isPublished ? (
                <Badge className="gap-1">
                  Publicado · {money(Number(statement?.frozen_total) || 0)}
                </Badge>
              ) : statement ? (
                <Badge variant="secondary">Despublicado</Badge>
              ) : (
                <Badge variant="outline">Sin publicar</Badge>
              )}
              {preview && preview.pending_count > 0 && (
                <Badge variant="destructive">
                  {preview.pending_count} movimiento(s) pendiente(s)
                </Badge>
              )}
            </div>

            {preview && (
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Base</p>
                  <p className="font-mono font-semibold">{money(preview.base_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Extras</p>
                  <p className="font-mono font-semibold">{money(preview.extras_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Descuentos</p>
                  <p className="font-mono font-semibold">−{money(preview.deductions_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total a publicar</p>
                  <p className="font-mono font-semibold">{money(preview.projected_total)}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={publish}
                disabled={working || (preview?.pending_count ?? 0) > 0}
              >
                {working ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                {isPublished ? "Volver a publicar" : "Publicar recibo"}
              </Button>

              {isPublished && (
                <div className="flex items-center gap-2">
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Motivo para despublicar"
                    className="h-9 w-56"
                  />
                  <Button size="sm" variant="outline" onClick={unpublish} disabled={working}>
                    <Undo2 className="mr-1 h-4 w-4" /> Despublicar
                  </Button>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Al publicar, el total se congela en el servidor y el trabajador ve
              exactamente ese monto. Las notas internas nunca se publican: solo la
              nota visible para el trabajador.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
