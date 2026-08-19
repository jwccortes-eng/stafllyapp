/**
 * PayStatementDetailSheet — desglose de un recibo de pago publicado.
 *
 * Mobile-first. Sin charts. Solo muestra conceptos realmente presentes.
 * El total es el congelado en el servidor; aquí nunca se recalcula.
 */
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, CheckCircle2, Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StaflyStatusBadge } from "@/components/stafly-ui";
import { notifyError } from "@/lib/feedback/notify";
import {
  buildStatementBreakdown,
  fetchWorkerPayStatementDetail,
  fmtStatementMoney,
  type WorkerPayStatementDetail,
  type WorkerPayStatementSummary,
} from "@/lib/payroll/pay-statement";

interface Props {
  statement: WorkerPayStatementSummary | null;
  onOpenChange: (open: boolean) => void;
}

function fmtDay(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM", { locale: es });
  } catch {
    return iso;
  }
}

export default function PayStatementDetailSheet({ statement, onOpenChange }: Props) {
  const [detail, setDetail] = useState<WorkerPayStatementDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!statement) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchWorkerPayStatementDetail(statement.statement_id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) =>
        notifyError({
          title: "No pudimos abrir tu recibo",
          fact: "El desglose no se cargó.",
          consequence: "No puedes ver el detalle de este periodo ahora mismo.",
          cause: e,
        }),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statement]);

  const breakdown = detail ? buildStatementBreakdown(detail) : null;

  return (
    <Dialog open={!!statement} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="text-base font-heading">
            {statement
              ? `${fmtDay(statement.start_date)} – ${fmtDay(statement.end_date)}`
              : "Recibo"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Detalle del pago aprobado y publicado.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && !detail && statement && (
          <div className="px-5 pb-6 text-sm text-muted-foreground">
            Este recibo ya no está disponible.
          </div>
        )}

        {!loading && detail && breakdown && (
          <div className="max-h-[70vh] overflow-y-auto px-5 pb-6 space-y-5">
            <div className="rounded-2xl border bg-muted/30 p-4 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Total
              </p>
              <p className="mt-1 text-3xl font-bold font-heading tabular-nums">
                {fmtStatementMoney(breakdown.total)}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <StaflyStatusBadge tone={detail.paid_at ? "success" : "info"} icon={CheckCircle2}>
                  {detail.paid_at ? "Pagado" : "Publicado"}
                </StaflyStatusBadge>
                {detail.published_at && (
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDay(detail.published_at.slice(0, 10))}
                  </span>
                )}
              </div>
            </div>

            {breakdown.earnings.length > 0 && (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ganancias
                </p>
                <ul className="mt-2 divide-y rounded-2xl border">
                  {breakdown.earnings.map((b) => (
                    <li key={b.key} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm">{b.label}</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {fmtStatementMoney(b.amount)}
                        </span>
                      </div>
                      {b.lines.some((l) => l.note || (l.quantity != null && l.rate != null)) && (
                        <ul className="mt-1 space-y-0.5">
                          {b.lines.map((l) => (
                            <li key={l.id} className="text-[11px] text-muted-foreground">
                              {l.quantity != null && l.rate != null
                                ? `${l.quantity} × ${fmtStatementMoney(l.rate)}`
                                : l.concept_name}
                              {l.note ? ` · ${l.note}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {breakdown.adjustments.length > 0 && (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ajustes
                </p>
                <ul className="mt-2 divide-y rounded-2xl border">
                  {breakdown.adjustments.map((b) => (
                    <li key={b.key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm">{b.label}</span>
                      <span className="text-sm font-semibold tabular-nums text-destructive">
                        −{fmtStatementMoney(b.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3">
              <span className="text-sm font-semibold">TOTAL</span>
              <span className="text-lg font-bold font-heading tabular-nums">
                {fmtStatementMoney(breakdown.total)}
              </span>
            </div>

            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Este recibo quedó congelado al publicarse. Si algo cambia, tu empresa
              debe revisarlo y volver a publicarlo.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
