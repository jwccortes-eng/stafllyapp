/**
 * WeeklyPayBreakdownDrawer — admin Trace Pay (Phase 1, read-only).
 *
 * Shows period-level trace coverage and per-employee breakdown using the
 * read-only adapter `fetchWeeklyPayBreakdown`. Does NOT recalculate payroll.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Printer, ArrowLeft, ChevronRight } from "lucide-react";
import {
  fetchWeeklyPayBreakdown,
  type WeeklyPayBreakdownSummary,
} from "@/lib/weekly-pay-breakdown";

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  periodId: string | null;
  periodLabel: string;
  periodRange: string;
}

interface Row {
  employee_id: string;
  worker: string;
  employer_id: string | null;
  base_total_pay: number;
  breakdown: WeeklyPayBreakdownSummary | null;
  trace_level: WeeklyPayBreakdownSummary["trace_level"] | null;
  status: "balanced" | "partial_trace" | "needs_review";
  delta: number;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);

export default function WeeklyPayBreakdownDrawer({ open, onClose, companyId, periodId, periodLabel, periodRange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    if (!open || !companyId || !periodId) return;
    setSelected(null);
    setLoading(true);
    (async () => {
      const { data: bp, error } = await supabase
        .from("period_base_pay")
        .select("employee_id, base_total_pay")
        .eq("company_id", companyId)
        .eq("period_id", periodId);
      if (error) {
        toast({ title: "Couldn't load period", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const items = (bp ?? []) as { employee_id: string; base_total_pay: number }[];
      const empIds = Array.from(new Set(items.map((r) => r.employee_id)));
      const { data: emps } = empIds.length
        ? await supabase
            .from("employees")
            .select("id, first_name, last_name, employer_identification")
            .in("id", empIds)
        : { data: [] as any[] };
      const empMap = new Map<string, any>((emps ?? []).map((e: any) => [e.id, e]));

      // Fetch breakdowns in parallel (capped to avoid spamming)
      const breakdowns = await Promise.all(
        items.map((r) =>
          fetchWeeklyPayBreakdown({ companyId, periodId, employeeId: r.employee_id }).catch(() => null),
        ),
      );

      const built: Row[] = items.map((r, i) => {
        const e = empMap.get(r.employee_id);
        const b = breakdowns[i];
        const traced = b?.traced_total ?? 0;
        const delta = (Number(r.base_total_pay) || 0) - traced;
        return {
          employee_id: r.employee_id,
          worker: e ? `${e.last_name || ""}, ${e.first_name || ""}`.trim() : "—",
          employer_id: e?.employer_identification ?? null,
          base_total_pay: Number(r.base_total_pay) || 0,
          breakdown: b,
          trace_level: b?.trace_level ?? null,
          status: b?.status ?? "needs_review",
          delta,
        };
      });
      built.sort((a, b) => a.worker.localeCompare(b.worker));
      setRows(built);
      setLoading(false);
    })();
  }, [open, companyId, periodId, toast]);

  const totals = useMemo(() => {
    const finalT = rows.reduce((s, r) => s + r.base_total_pay, 0);
    const traced = rows.reduce((s, r) => s + (r.breakdown?.traced_total ?? 0), 0);
    const concept = rows.filter((r) => r.trace_level === "concept_breakdown").length;
    const finalOnly = rows.filter((r) => r.trace_level === "final_total_only").length;
    const coverage = finalT > 0 ? Math.round((traced / finalT) * 100) : 0;
    return { finalT, traced, untraced: Math.max(0, finalT - traced), coverage, concept, finalOnly };
  }, [rows]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading">
            {selected ? (
              <button onClick={() => setSelected(null)} className="inline-flex items-center text-sm hover:underline">
                <ArrowLeft className="h-4 w-4 mr-1" /> Trace pay · {periodLabel}
              </button>
            ) : (
              <>Trace pay · {periodLabel}</>
            )}
          </SheetTitle>
          <SheetDescription>
            {periodRange} · Read-only · No payroll recalculation
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading breakdown…
          </div>
        ) : selected ? (
          <EmployeeDetail row={selected} />
        ) : (
          <div className="mt-4 space-y-4">
            {/* Period summary */}
            <Card>
              <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Employees" value={String(rows.length)} />
                <Stat label="Final total" value={fmtMoney(totals.finalT)} />
                <Stat label="Traced" value={fmtMoney(totals.traced)} />
                <Stat label="Trace coverage" value={`${totals.coverage}%`} />
                <Stat label="Concept breakdown" value={String(totals.concept)} />
                <Stat label="Final total only" value={String(totals.finalOnly)} />
                <Stat label="Untraced" value={fmtMoney(totals.untraced)} />
                <Stat label="Period" value={periodLabel} />
              </CardContent>
            </Card>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead className="font-mono text-xs">Emp ID</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                    <TableHead className="text-right">Traced</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead>Trace level</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.employee_id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelected(r)}>
                      <TableCell className="font-medium">{r.worker}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.employer_id ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.base_total_pay)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.breakdown?.traced_total ?? 0)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${Math.abs(r.delta) > 0.01 ? "text-rose-600 font-semibold" : ""}`}>
                        {fmtMoney(r.delta)}
                      </TableCell>
                      <TableCell>
                        <TraceBadge level={r.trace_level} status={r.status} />
                      </TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Payroll is based on finalized/imported records. Scheduled hours are not used for payment.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function TraceBadge({
  level,
  status,
}: {
  level: WeeklyPayBreakdownSummary["trace_level"] | null;
  status: "balanced" | "partial_trace" | "needs_review";
}) {
  if (!level) {
    return <Badge variant="outline" className="bg-muted">Unavailable</Badge>;
  }
  const map: Record<string, string> = {
    balanced: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    partial_trace: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    needs_review: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  };
  const labels: Record<string, string> = {
    final_total_only: "Final total only",
    concept_breakdown: "Concept breakdown",
    row_detail: "Row detail",
    matched_time_entry: "Time entry",
    matched_shift: "Shift",
    matched_schedule: "Schedule",
  };
  return (
    <Badge variant="outline" className={map[status]}>
      {labels[level]}
    </Badge>
  );
}

function EmployeeDetail({ row }: { row: Row }) {
  const b = row.breakdown;
  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="text-lg font-bold font-heading">{row.worker}</div>
          {row.employer_id && (
            <div className="text-xs font-mono text-muted-foreground">Employer ID: {row.employer_id}</div>
          )}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Stat label="Final" value={fmtMoney(row.base_total_pay)} />
            <Stat label="Traced" value={fmtMoney(b?.traced_total ?? 0)} />
            <Stat label="Δ" value={fmtMoney(row.delta)} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <TraceBadge level={row.trace_level} status={row.status} />
            {b?.source_file && <span className="text-xs text-muted-foreground">Source: {b.source_file}</span>}
          </div>
          {b?.notes && <p className="text-[11px] text-muted-foreground border-t pt-2 mt-2">{b.notes}</p>}
        </CardContent>
      </Card>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concept</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(b?.rows ?? []).map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.pay_concept}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.pay_type}</TableCell>
                <TableCell className="text-right tabular-nums">{r.hours ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.rate != null ? fmtMoney(r.rate) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4 mr-1.5" /> Print breakdown
      </Button>
    </div>
  );
}
