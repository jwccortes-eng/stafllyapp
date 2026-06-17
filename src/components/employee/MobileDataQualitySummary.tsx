import { useState } from "react";
import { ShieldAlert, CheckCircle2, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import DataQualityRiskPanel from "@/components/employee/DataQualityRiskPanel";
import type { RiskKey } from "@/lib/data-quality-risks";
import { useT } from "@/i18n";

/**
 * MobileDataQualitySummary — collapsed mobile entry point.
 * Renders as a slim row (not a heavy card) on mobile only. Opens a bottom
 * sheet with the actionable-only DataQualityRiskPanel.
 */
interface Props {
  needReview: number;
  employees: any[];
  documentSignals: any;
  riskFilter: RiskKey | "all";
  onRiskFilterChange: (k: RiskKey | "all") => void;
}

export default function MobileDataQualitySummary({
  needReview, employees, documentSignals, riskFilter, onRiskFilterChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const clean = needReview === 0;
  const alertsLabel = clean
    ? t("workers.data_quality.all_clear")
    : needReview === 1
      ? t("workers.data_quality.alerts_one").replace("{n}", String(needReview))
      : t("workers.data_quality.alerts_many").replace("{n}", String(needReview));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/50 bg-card/60 hover:bg-card transition active:scale-[0.99] text-left"
      >
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
          clean ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
        }`}>
          {clean
            ? <CheckCircle2 className="h-3.5 w-3.5" />
            : <ShieldAlert className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0 text-[12px] leading-tight">
          <span className="font-semibold text-foreground">{t("workers.data_quality.label")}</span>
          <span className="text-muted-foreground"> · {alertsLabel}</span>
        </div>
        <span className="text-[11px] font-semibold text-primary">{t("workers.data_quality.view")}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[88vh] rounded-t-3xl p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 text-left border-b border-border/40">
            <SheetTitle className="text-base font-bold font-heading">{t("workers.data_quality.sheet_title")}</SheetTitle>
            <p className="text-xs text-muted-foreground">{t("workers.data_quality.sheet_subtitle")}</p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <DataQualityRiskPanel
              employees={employees}
              documentSignals={documentSignals}
              riskFilter={riskFilter}
              onRiskFilterChange={(k) => { onRiskFilterChange(k); setOpen(false); }}
              actionableOnly
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
