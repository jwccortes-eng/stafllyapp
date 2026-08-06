/**
 * PayrollRateSnapshotCard — read-only historical truth for one worker/period.
 *
 * Renders the immutable snapshot created at consolidation time: real hours,
 * applied rate, its origin and effective window, the overtime rule used, and
 * who consolidated. Never reads the worker's current rate.
 */
import { useQuery } from "@tanstack/react-query";
import { Camera, History, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  fetchLatestRateSnapshot,
  describeSnapshot,
} from "@/lib/payroll/rate-snapshot";
import { RATE_SOURCE_LABELS, isPeriodLocked } from "@/lib/payroll/rate-resolver";

interface Props {
  companyId: string | null | undefined;
  employeeId: string | null | undefined;
  periodId: string | null | undefined;
  periodStatus?: string | null;
  className?: string;
}

export function PayrollRateSnapshotCard({
  companyId,
  employeeId,
  periodId,
  periodStatus,
  className,
}: Props) {
  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["payroll-rate-snapshot", companyId, employeeId, periodId],
    enabled: !!companyId && !!employeeId && !!periodId,
    queryFn: () =>
      fetchLatestRateSnapshot({
        companyId: companyId!,
        employeeId: employeeId!,
        periodId: periodId!,
      }),
  });

  if (!companyId || !employeeId || !periodId || isLoading) return null;

  if (!snapshot) {
    return (
      <div
        className={`rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground ${className ?? ""}`}
      >
        Este periodo aún no tiene fotografía de tarifa para el trabajador. Se crea al consolidar.
      </div>
    );
  }

  const locked = isPeriodLocked(snapshot.period_status_at_resolution) || isPeriodLocked(periodStatus);

  return (
    <div className={`rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2 ${className ?? ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Camera className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold">Fotografía de pago consolidado</span>
        <Badge variant="outline" className="text-[10px]">v{snapshot.consolidation_version}</Badge>
        {locked && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <Lock className="h-2.5 w-2.5" /> Inmutable
          </Badge>
        )}
      </div>

      <p className="text-xs font-medium">{describeSnapshot(snapshot)}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {RATE_SOURCE_LABELS[snapshot.rate_source] ?? snapshot.rate_source}
        </Badge>
        {snapshot.is_legacy_source && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <History className="h-2.5 w-2.5" /> Origen histórico
          </Badge>
        )}
        {snapshot.rate_changed_mid_period && (
          <Badge variant="outline" className="text-[10px]">Tarifa cambió dentro del periodo</Badge>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Horas tomadas de {snapshot.time_entry_count} registro(s) de reloj reales
        {snapshot.effective_from ? ` · tarifa vigente desde ${snapshot.effective_from}` : ""}
        {snapshot.effective_to ? ` hasta ${snapshot.effective_to}` : ""} · umbral de horas extra{" "}
        {snapshot.overtime_threshold_hours}h · consolidado el{" "}
        {new Date(snapshot.resolved_at).toLocaleString()}.
      </p>
    </div>
  );
}
