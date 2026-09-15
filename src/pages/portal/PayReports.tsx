/**
 * PayReports — "Mis pagos" (worker).
 *
 * Historial único con las dos fuentes canónicas ya existentes:
 *   - Recibos nativos publicados (`pay_statements` vía `worker_pay_statements`).
 *   - Reportes históricos importados (`period_base_pay` con `import_id`).
 *
 * Reglas:
 *  - Nunca se recalcula el total en el cliente: nativo = `frozen_total`,
 *    histórico = `base_total_pay` importado.
 *  - Un periodo con recibo nativo nunca se duplica con su histórico.
 *  - Nunca se leen movimientos pendientes ni notas internas (RLS + RPC).
 *  - Solo pagos del propio trabajador.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Wallet, CheckCircle2, ChevronRight, Receipt, Archive } from "lucide-react";
import {
  StaflyCard,
  StaflyStatusBadge,
  StaflyEmptyState,
  StaflyLoadingState,
} from "@/components/stafly-ui";
import PayStatementDetailSheet from "@/components/portal/PayStatementDetailSheet";
import { notifyError } from "@/lib/feedback/notify";
import {
  fmtStatementMoney,
  statementStatusLabel,
  type WorkerPayStatementSummary,
} from "@/lib/payroll/pay-statement";
import {
  fetchWorkerPaymentHistory,
  summarizePaymentHistory,
  type PaymentHistoryItem,
} from "@/lib/payroll/payment-history";

function fmtRange(start: string, end: string): string {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    return `${format(s, "d MMM", { locale: es })} – ${format(e, "d MMM yyyy", { locale: es })}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export default function PayReports() {
  const [rows, setRows] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkerPayStatementSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchWorkerPaymentHistory());
    } catch (e) {
      notifyError({
        title: "No pudimos cargar tus pagos",
        fact: "La lista de pagos no se pudo leer.",
        consequence: "No verás tu historial de pagos hasta reintentar.",
        cause: e,
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => summarizePaymentHistory(rows), [rows]);

  return (
    <div className="min-h-dvh bg-background pb-28">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            to="/portal"
            aria-label="Volver al portal"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 transition active:scale-95"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold font-heading leading-tight text-foreground">
              Mis pagos
            </h1>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Recibos aprobados y publicados por tu empresa.
            </p>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {loading ? (
          <StaflyLoadingState variant="cards" count={3} label="Cargando tus pagos" />
        ) : rows.length === 0 ? (
          <StaflyEmptyState
            icon={Wallet}
            title="Todavía no tienes pagos registrados"
            description="Cuando tu empresa publique un pago aprobado, lo verás aquí con su desglose."
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Último</p>
                <p className="mt-1 text-sm font-bold tabular-nums">
                  {fmtStatementMoney(kpis.latest)}
                </p>
              </div>
              <div className="rounded-2xl border bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Año</p>
                <p className="mt-1 text-sm font-bold tabular-nums">
                  {fmtStatementMoney(kpis.ytd)}
                </p>
              </div>
              <div className="rounded-2xl border bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pagos</p>
                <p className="mt-1 text-sm font-bold tabular-nums">{kpis.count}</p>
              </div>
            </div>

            <ul className="space-y-2">
              {rows.map((r) => {
                const isNative = r.kind === "native" && r.statement !== null;
                return (
                  <li key={r.key}>
                    <StaflyCard
                      tone={isNative ? "interactive" : "default"}
                      as={isNative ? "button" : "div"}
                      onClick={isNative ? () => setSelected(r.statement) : undefined}
                      aria-label={
                        isNative
                          ? `Ver detalle del pago ${fmtRange(r.start_date, r.end_date)}`
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {fmtRange(r.start_date, r.end_date)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {isNative ? (
                              <StaflyStatusBadge
                                tone={r.paid_at ? "success" : "info"}
                                icon={CheckCircle2}
                              >
                                {statementStatusLabel({ paid_at: r.paid_at })}
                              </StaflyStatusBadge>
                            ) : (
                              <StaflyStatusBadge tone="neutral" icon={Archive}>
                                Reporte histórico
                              </StaflyStatusBadge>
                            )}
                            {r.company_name && (
                              <span className="text-[11px] text-muted-foreground">
                                {r.company_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold font-heading tabular-nums">
                            {fmtStatementMoney(r.amount)}
                          </p>
                          {isNative && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              Ver detalle <ChevronRight className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </StaflyCard>
                  </li>
                );
              })}
            </ul>

            <p className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground">
              <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Cada recibo queda congelado al publicarse. Los reportes históricos
              conservan el importe con el que se cerraron. Si detectas una
              diferencia, habla con tu coordinador.
            </p>
          </>
        )}
      </main>

      <PayStatementDetailSheet
        statement={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
