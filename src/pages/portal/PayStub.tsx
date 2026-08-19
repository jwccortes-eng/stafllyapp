/**
 * PayStub — recibo de pago publicado de un periodo (worker).
 *
 * Lee exclusivamente el recibo congelado (`pay_statements`) y sus líneas
 * aprobadas vía RPC. No recalcula totales, no lee movimientos pendientes y
 * nunca muestra notas internas.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Receipt, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/ui/page-header";
import { StaflyLoadingState, StaflyStatusBadge } from "@/components/stafly-ui";
import { notifyError } from "@/lib/feedback/notify";
import {
  buildStatementBreakdown,
  fetchWorkerPayStatementDetail,
  fetchWorkerPayStatements,
  fmtStatementMoney,
  type WorkerPayStatementDetail,
} from "@/lib/payroll/pay-statement";

function fmtDay(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy", { locale: es });
  } catch {
    return iso;
  }
}

export default function PayStub() {
  const { periodId } = useParams<{ periodId: string }>();
  const [detail, setDetail] = useState<WorkerPayStatementDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!periodId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const list = await fetchWorkerPayStatements();
        const match = list.find((s) => s.period_id === periodId);
        if (!match) {
          if (!cancelled) setDetail(null);
          return;
        }
        const d = await fetchWorkerPayStatementDetail(match.statement_id);
        if (!cancelled) setDetail(d);
      } catch (e) {
        notifyError({
          title: "No pudimos abrir tu recibo",
          fact: "El recibo de este periodo no se cargó.",
          consequence: "No puedes ver el detalle ahora mismo.",
          cause: e,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [periodId]);

  const breakdown = useMemo(
    () => (detail ? buildStatementBreakdown(detail) : null),
    [detail],
  );

  if (loading) {
    return <StaflyLoadingState variant="cards" count={3} label="Cargando recibo" />;
  }

  if (!detail || !breakdown) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <p className="text-sm">Este periodo todavía no tiene un recibo publicado.</p>
        <Link to="/portal/pay-reports" className="mt-2 inline-block text-sm text-primary">
          ← Volver a Mis pagos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        variant="2"
        icon={Receipt}
        title="Recibo de pago"
        subtitle={`${fmtDay(detail.start_date)} → ${fmtDay(detail.end_date)}`}
        badge={detail.paid_at ? "Pagado" : "Publicado"}
        rightSlot={
          <Link
            to="/portal/pay-reports"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted transition-colors hover:bg-accent"
            aria-label="Volver a Mis pagos"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />

      <div className="rounded-2xl border bg-card p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Total
        </p>
        <p className="mt-2 text-4xl font-bold font-heading tabular-nums tracking-tight">
          {fmtStatementMoney(breakdown.total)}
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
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
          <h2 className="mb-2 text-sm font-semibold">Ganancias</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {breakdown.earnings.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">{b.label}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {fmtStatementMoney(b.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {breakdown.adjustments.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Ajustes</h2>
          <ul className="divide-y rounded-2xl border bg-card">
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

      <div className="flex items-center justify-between rounded-2xl border bg-card px-4 py-4">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-muted-foreground" /> TOTAL
        </span>
        <span className="text-xl font-bold font-heading tabular-nums">
          {fmtStatementMoney(breakdown.total)}
        </span>
      </div>
    </div>
  );
}
