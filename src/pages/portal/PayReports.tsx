/**
 * PayReports — "Mis pagos" (worker).
 *
 * Fuente única: recibos publicados (`pay_statements`) leídos vía el RPC
 * `worker_pay_statements`, con desglose por conceptos canónicos (`movements`).
 *
 * Reglas:
 *  - Nunca se recalcula el total en el cliente: se muestra `frozen_total`.
 *  - Nunca se leen movimientos pendientes ni notas internas (RLS + RPC).
 *  - Nunca se usan horas programadas ni `time_entries`.
 *  - Solo recibos del propio trabajador.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Wallet, CheckCircle2, ChevronRight, Receipt } from "lucide-react";
import {
  StaflyCard,
  StaflyStatusBadge,
  StaflyEmptyState,
  StaflyLoadingState,
} from "@/components/stafly-ui";
import PayStatementDetailSheet from "@/components/portal/PayStatementDetailSheet";
import { notifyError } from "@/lib/feedback/notify";
import {
  fetchWorkerPayStatements,
  fmtStatementMoney,
  statementStatusLabel,
  type WorkerPayStatementSummary,
} from "@/lib/payroll/pay-statement";

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
  const [rows, setRows] = useState<WorkerPayStatementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkerPayStatementSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchWorkerPayStatements());
    } catch (e) {
      notifyError({
        title: "No pudimos cargar tus pagos",
        fact: "La lista de recibos no se pudo leer.",
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

  const kpis = useMemo(() => {
    const year = new Date().getFullYear();
    const ytd = rows
      .filter((r) => {
        try {
          return parseISO(r.end_date).getFullYear() === year;
        } catch {
          return false;
        }
      })
      .reduce((s, r) => s + r.frozen_total, 0);
    return { count: rows.length, latest: rows[0]?.frozen_total ?? 0, ytd };
  }, [rows]);

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
            title="Todavía no tienes recibos publicados"
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
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recibos</p>
                <p className="mt-1 text-sm font-bold tabular-nums">{kpis.count}</p>
              </div>
            </div>

            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.statement_id}>
                  <StaflyCard
                    tone="interactive"
                    as="button"
                    onClick={() => setSelected(r)}
                    aria-label={`Ver detalle del pago ${fmtRange(r.start_date, r.end_date)}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {fmtRange(r.start_date, r.end_date)}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StaflyStatusBadge
                            tone={r.paid_at ? "success" : "info"}
                            icon={CheckCircle2}
                          >
                            {statementStatusLabel(r)}
                          </StaflyStatusBadge>
                          {r.company_name && (
                            <span className="text-[11px] text-muted-foreground">
                              {r.company_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold font-heading tabular-nums">
                          {fmtStatementMoney(r.frozen_total)}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          Ver detalle <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </StaflyCard>
                </li>
              ))}
            </ul>

            <p className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground">
              <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Cada recibo queda congelado al publicarse. Si detectas una diferencia,
              habla con tu coordinador.
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
