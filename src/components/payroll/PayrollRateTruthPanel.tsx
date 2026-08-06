/**
 * PayrollRateTruthPanel — read-only. Shows the SAME rate payroll really uses.
 *
 * No writes. No recalculation. Never renders $0 as a valid rate: if the
 * cascade finds nothing, it says the rate is missing and payroll will skip it.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  BILL_RATE_LABEL,
  PAY_RATE_LABEL,
  RATE_SOURCE_LABELS,
  fetchPayrollRateTruth,
  formatRate,
} from "@/lib/payroll/rate-resolver";
import { PayrollRateSnapshotCard } from "@/components/payroll/PayrollRateSnapshotCard";

interface Props {
  companyId: string;
  employeeId: string;
  /** Optional. When omitted, the most recent pay period of the company is used. */
  periodId?: string;
  /** Rate currently displayed by the compensation profile, to flag divergence. */
  profileRate?: number | null;
  className?: string;
}

export function PayrollRateTruthPanel({
  companyId,
  employeeId,
  periodId,
  profileRate,
  className,
}: Props) {
  const { data: resolvedPeriodId } = useQuery({
    queryKey: ["payroll-latest-period", companyId],
    enabled: !!companyId && !periodId,
    queryFn: async () => {
      const { data } = await supabase
        .from("pay_periods")
        .select("id")
        .eq("company_id", companyId)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { id?: string } | null)?.id ?? null;
    },
  });

  const effectivePeriodId = periodId ?? resolvedPeriodId ?? null;

  const { data: truth, isLoading } = useQuery({
    queryKey: ["payroll-rate-truth", companyId, employeeId, effectivePeriodId],
    enabled: !!companyId && !!employeeId && !!effectivePeriodId,
    queryFn: () =>
      fetchPayrollRateTruth({ companyId, employeeId, periodId: effectivePeriodId! }),
  });

  if (!effectivePeriodId || isLoading) {
    return (
      <div className={`rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground ${className ?? ""}`}>
        Consultando la tarifa real de payroll…
      </div>
    );
  }

  if (!truth) {
    return (
      <div className={`rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground ${className ?? ""}`}>
        No fue posible leer la tarifa real de payroll para este periodo.
      </div>
    );
  }

  const diverges =
    !truth.missing_rate &&
    profileRate != null &&
    Math.abs(Number(profileRate) - Number(truth.rate ?? 0)) > 0.005;

  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        truth.missing_rate
          ? "border-destructive/40 bg-destructive/5"
          : "border-border/60 bg-muted/20"
      } ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold">{PAY_RATE_LABEL} (real de payroll)</span>
        {truth.missing_rate ? (
          <Badge variant="destructive" className="text-[10px]">Falta tarifa</Badge>
        ) : (
          <>
            <span className="text-xs font-bold">{formatRate(truth.rate)}</span>
            <Badge variant="outline" className="text-[10px]">
              {RATE_SOURCE_LABELS[truth.source]}
            </Badge>
            {truth.is_legacy && (
              <Badge variant="outline" className="text-[10px]">Origen histórico</Badge>
            )}
            {truth.fallback_used && (
              <Badge variant="outline" className="text-[10px]">Valor por defecto</Badge>
            )}
          </>
        )}
      </div>

      {truth.missing_rate && (
        <p className="flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          Payroll no pagará a este trabajador en el periodo actual hasta que exista una tarifa.
          Ya no se paga $0 en silencio.
        </p>
      )}

      {diverges && (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          El perfil muestra {formatRate(Number(profileRate))} pero payroll aplica {formatRate(truth.rate)}.
          Esta configuración no modifica actualmente el cálculo de payroll.
        </p>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        {BILL_RATE_LABEL} es un valor distinto y no afecta este monto.
      </p>

      <PayrollRateSnapshotCard
        companyId={companyId}
        employeeId={employeeId}
        periodId={effectivePeriodId}
        periodStatus={truth.period_status}
      />
    </div>
  );
}
