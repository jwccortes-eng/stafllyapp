/**
 * WorkerPayBreakdownDialog — Portal worker "View details" (Phase 1, read-only).
 *
 * Shows breakdown rows when source detail exists, else a single "Final total only"
 * row with the safe disclaimer. Never reads other workers' data.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Info, Archive } from "lucide-react";
import { fetchWeeklyPayBreakdown, type WeeklyPayBreakdownSummary } from "@/lib/weekly-pay-breakdown";

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  periodId: string | null;
  employeeId: string | null;
  periodLabel: string;
  isHistorical: boolean;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);

export default function WorkerPayBreakdownDialog({
  open,
  onClose,
  companyId,
  periodId,
  employeeId,
  periodLabel,
  isHistorical,
}: Props) {
  const [data, setData] = useState<WeeklyPayBreakdownSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !companyId || !periodId || !employeeId) return;
    setLoading(true);
    fetchWeeklyPayBreakdown({ companyId, periodId, employeeId })
      .then((r) => setData(r))
      .finally(() => setLoading(false));
  }, [open, companyId, periodId, employeeId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Pay details</DialogTitle>
          <DialogDescription>{periodLabel}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No data available.</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/30 border border-border/40 p-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Total paid</p>
              <p className="text-3xl font-bold font-heading tabular-nums mt-1">{fmtMoney(data.final_total)}</p>
            </div>

            {data.trace_level === "final_total_only" ? (
              <div className="rounded-xl bg-muted/40 border border-border/40 p-3 flex gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {isHistorical
                    ? "Historical payroll record imported from Connecteam. Final paid amount. Some rows may not link to Stafly shifts."
                    : "Final total only — source detail unavailable."}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border divide-y">
                {data.rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{r.pay_concept}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.pay_type.replace(/_/g, " ")}</div>
                    </div>
                    <div className="text-sm font-bold tabular-nums">{fmtMoney(r.amount)}</div>
                  </div>
                ))}
              </div>
            )}

            {isHistorical && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Archive className="h-3 w-3" /> Historical Import
              </div>
            )}

            <p className="text-[10px] text-muted-foreground border-t pt-2">
              Payroll is based on finalized/imported records. Scheduled hours are not used for payment.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
