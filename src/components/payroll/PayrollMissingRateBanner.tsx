/**
 * PayrollMissingRateBanner — read-only.
 *
 * Surfaces what the last consolidation of a period really did with rates:
 * how many workers were skipped because no pay rate exists, and how many
 * were paid using a historical (legacy) rate. No writes, no recalculation.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PAY_RATE_LABEL, isPeriodLocked } from "@/lib/payroll/rate-resolver";

interface Props {
  companyId: string | null | undefined;
  periodId: string | null | undefined;
  periodStatus?: string | null;
  className?: string;
}

interface AuditRow {
  employee_id: string;
  result: string;
  is_legacy_source: boolean;
  created_at: string;
}

export function PayrollMissingRateBanner({ companyId, periodId, periodStatus, className }: Props) {
  const { data } = useQuery({
    queryKey: ["payroll-consolidation-audit", companyId, periodId],
    enabled: !!companyId && !!periodId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("payroll_consolidation_audit" as any)
        .select("employee_id, result, is_legacy_source, created_at")
        .eq("company_id", companyId!)
        .eq("period_id", periodId!)
        .order("created_at", { ascending: false })
        .limit(500);
      const list = (rows ?? []) as unknown as AuditRow[];
      if (list.length === 0) return { missing: 0, legacy: 0, lastRun: null as string | null };
      // Only the most recent consolidation run matters.
      const lastRun = list[0].created_at;
      const runStart = new Date(new Date(lastRun).getTime() - 60_000).toISOString();
      const latest = list.filter((r) => r.created_at >= runStart);
      const seen = new Set<string>();
      let missing = 0;
      let legacy = 0;
      for (const r of latest) {
        if (seen.has(r.employee_id)) continue;
        seen.add(r.employee_id);
        if (r.result === "blocked_missing_rate") missing += 1;
        if (r.is_legacy_source) legacy += 1;
      }
      return { missing, legacy, lastRun };
    },
  });

  const locked = isPeriodLocked(periodStatus);
  if (!data || (data.missing === 0 && data.legacy === 0 && !locked)) return null;

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {data.missing > 0 && (
        <div
          role="note"
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                {data.missing} trabajador(es) sin {PAY_RATE_LABEL.toLowerCase()}.
              </p>
              <p className="opacity-90 mt-0.5">
                Quedaron fuera de la consolidación. Nadie se paga en $0 en silencio: configure la
                tarifa y vuelva a consolidar el periodo.
              </p>
            </div>
          </div>
        </div>
      )}

      {data.legacy > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
          <History className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {data.legacy} trabajador(es) se calcularon con tarifa de importación histórica del periodo,
          no con la tarifa del perfil.
        </div>
      )}

      {locked && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2 text-[11px] text-muted-foreground">
          Periodo {periodStatus === "paid" ? "pagado" : "cerrado"}: la consolidación está bloqueada y
          los montos no pueden recalcularse.
        </div>
      )}
    </div>
  );
}
