import { useState } from "react";
import { ShieldAlert, CheckCircle2, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import DataQualityRiskPanel from "@/components/employee/DataQualityRiskPanel";
import type { RiskKey } from "@/lib/data-quality-risks";

/**
 * MobileDataQualitySummary — collapsed mobile entry point.
 * Shows a single line summary with "View risks" → opens the full panel
 * in a bottom sheet. Avoids dumping the 12+ risk grid on iPhone by default.
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
  const clean = needReview === 0;

  return (
    <>
      <Card
        className="md:hidden flex items-center gap-3 px-3 py-2.5 border border-border bg-card cursor-pointer active:scale-[0.99] transition"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
      >
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
          clean ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
        }`}>
          {clean ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">Data quality</div>
          <div className="text-xs text-muted-foreground">
            {clean ? "All clear · no issues detected" : `${needReview} worker${needReview === 1 ? "" : "s"} need review`}
          </div>
        </div>
        <span className="text-xs font-semibold text-primary mr-1">View risks</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[88vh] rounded-t-3xl p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 text-left border-b border-border/40">
            <SheetTitle className="text-base font-bold font-heading">Data quality risks</SheetTitle>
            <p className="text-xs text-muted-foreground">Tap a risk to filter the worker list.</p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <DataQualityRiskPanel
              employees={employees}
              documentSignals={documentSignals}
              riskFilter={riskFilter}
              onRiskFilterChange={(k) => { onRiskFilterChange(k); setOpen(false); }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
