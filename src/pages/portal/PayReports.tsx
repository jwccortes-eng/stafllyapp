/**
 * PayReports — Worker Weekly Pay Reports (read-only).
 *
 * Read-only summary of weekly final payments for the authenticated worker.
 * Includes:
 *   - Stafly live payroll (period_base_pay rows the worker owns)
 *   - Historical Connecteam imports (rows in period_base_pay where the import
 *     row has a file_name — those are imported finals)
 *
 * Privacy:
 *   - Only reads period_base_pay scoped to the worker's own employee_id.
 *   - Never reads other workers' rows.
 *   - Never reads historical_payroll_entries (those are admin-only and
 *     intentionally do NOT have a worker SELECT policy).
 *   - Never exposes SSN/EIN.
 *
 * No writes. No recalculation. No scheduled hours. No notifications.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  ArrowLeft,
  Wallet,
  FileText,
  Loader2,
  Printer,
  Copy,
  Check,
  Archive,
  CheckCircle2,
  CalendarRange,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import WorkerPayBreakdownDialog from "@/components/portal/WorkerPayBreakdownDialog";

// ============================================================================
// Types
// ============================================================================

interface PeriodInfo {
  id: string;
  sequence_number: number | null;
  start_date: string;
  end_date: string;
  status: string | null;
  source_type: string | null;
  calculation_mode: string | null;
  paid_at: string | null;
  published_at: string | null;
}

interface ImportInfo {
  id: string;
  file_name: string;
  status: string | null;
  created_at: string;
  row_count: number | null;
}

interface PayReportRow {
  period: PeriodInfo;
  base_total_pay: number;
  total_regular: number | null;
  total_overtime: number | null;
  weekly_total_hours: number | null;
  total_work_hours: number | null;
  total_paid_hours: number | null;
  import_id: string | null;
  import_info: ImportInfo | null;
  /** True if this row came from a Connecteam-style historical import. */
  is_historical_import: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function fmtRange(start: string, end: string): string {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    return `${format(s, "MMM d", { locale: enUS })} – ${format(e, "MMM d, yyyy", { locale: enUS })}`;
  } catch {
    return `${start} – ${end}`;
  }
}

function fmtDateFriendly(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, yyyy", { locale: enUS });
  } catch {
    return iso;
  }
}

/**
 * Decide whether a period_base_pay row is a Connecteam-imported historical
 * record. Heuristic: there is an import_id AND the import file_name contains
 * a recognizable Connecteam marker. We are conservative: anything we can't
 * confidently classify as historical is shown as live Stafly payroll.
 */
function isHistoricalImport(importInfo: ImportInfo | null): boolean {
  if (!importInfo) return false;
  const fn = (importInfo.file_name || "").toLowerCase();
  // Connecteam exports we've seen so far:
  //   "129 UNTITLED_REPORT_2026-04-22_2026-04-28.xlsx"
  //   "PAYROLL_*.xlsx" with sheet PAYROLL
  // Treat any file imported via the historical pipeline as historical.
  return (
    fn.includes("untitled_report") ||
    fn.includes("payroll") ||
    fn.includes("connecteam")
  );
}

interface StatusBadgeStyle {
  label: string;
  cls: string;
  icon: typeof Wallet;
}

function statusBadge(row: PayReportRow): StatusBadgeStyle {
  if (row.is_historical_import) {
    return {
      label: "Historical Import",
      cls: "bg-muted text-muted-foreground border-border/60",
      icon: Archive,
    };
  }
  const p = row.period;
  if (p.paid_at) {
    return {
      label: "Paid",
      cls: "bg-[hsl(var(--status-confirmed)/0.12)] text-[hsl(var(--status-confirmed))] border-[hsl(var(--status-confirmed)/0.25)]",
      icon: CheckCircle2,
    };
  }
  if (p.published_at) {
    return {
      label: "Published",
      cls: "bg-primary/10 text-primary border-primary/25",
      icon: CheckCircle2,
    };
  }
  if (p.status === "closed") {
    return {
      label: "Closed",
      cls: "bg-warning/15 text-warning border-warning/25",
      icon: CheckCircle2,
    };
  }
  return {
    label: "Open",
    cls: "bg-muted text-muted-foreground border-border/60",
    icon: CalendarRange,
  };
}

function sourceLabel(row: PayReportRow): string {
  return row.is_historical_import ? "Connecteam final payroll" : "Stafly payroll";
}

function validationLabel(row: PayReportRow): string {
  if (row.is_historical_import) return "Historical";
  if (row.period.paid_at) return "Final";
  if (row.period.published_at) return "Published";
  return "Imported";
}

// ============================================================================
// Component
// ============================================================================

export default function PayReports() {
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const { toast } = useToast();

  const [rows, setRows] = useState<PayReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRow, setOpenRow] = useState<PayReportRow | null>(null);

  // ----- Load -----
  useEffect(() => {
    if (!effectiveEmployeeId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1. Pull all the worker's own period_base_pay rows.
      const { data: bp, error: bpErr } = await supabase
        .from("period_base_pay")
        .select(
          "period_id, base_total_pay, total_regular, total_overtime, weekly_total_hours, total_work_hours, total_paid_hours, import_id",
        )
        .eq("employee_id", effectiveEmployeeId!);

      if (cancelled) return;
      if (bpErr || !bp || bp.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const periodIds = Array.from(new Set(bp.map((r: any) => r.period_id)));
      const importIds = Array.from(
        new Set(bp.map((r: any) => r.import_id).filter(Boolean)),
      ) as string[];

      // 2. Fetch periods + imports in parallel.
      const [{ data: periods }, { data: imports }] = await Promise.all([
        supabase
          .from("pay_periods")
          .select(
            "id, sequence_number, start_date, end_date, status, source_type, calculation_mode, paid_at, published_at",
          )
          .in("id", periodIds),
        importIds.length > 0
          ? supabase
              .from("imports")
              .select("id, file_name, status, created_at, row_count")
              .in("id", importIds)
          : Promise.resolve({ data: [] as ImportInfo[] }),
      ]);

      if (cancelled) return;

      const periodMap = new Map<string, PeriodInfo>(
        (periods ?? []).map((p: any) => [p.id, p as PeriodInfo]),
      );
      const importMap = new Map<string, ImportInfo>(
        ((imports ?? []) as any[]).map((i: any) => [i.id, i as ImportInfo]),
      );

      const built: PayReportRow[] = bp
        .map((r: any) => {
          const period = periodMap.get(r.period_id);
          if (!period) return null;
          const importInfo = r.import_id
            ? (importMap.get(r.import_id) ?? null)
            : null;
          return {
            period,
            base_total_pay: Number(r.base_total_pay) || 0,
            total_regular: r.total_regular != null ? Number(r.total_regular) : null,
            total_overtime: r.total_overtime != null ? Number(r.total_overtime) : null,
            weekly_total_hours:
              r.weekly_total_hours != null ? Number(r.weekly_total_hours) : null,
            total_work_hours:
              r.total_work_hours != null ? Number(r.total_work_hours) : null,
            total_paid_hours:
              r.total_paid_hours != null ? Number(r.total_paid_hours) : null,
            import_id: r.import_id ?? null,
            import_info: importInfo,
            is_historical_import: isHistoricalImport(importInfo),
          } satisfies PayReportRow;
        })
        .filter(Boolean) as PayReportRow[];

      // Sort: most recent period first.
      built.sort((a, b) =>
        b.period.start_date.localeCompare(a.period.start_date),
      );

      setRows(built);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [effectiveEmployeeId]);

  // ----- KPIs -----
  const kpis = useMemo(() => {
    const total = rows.length;
    const latest = rows[0]?.base_total_pay ?? 0;
    const currentYear = new Date().getFullYear();
    const ytd = rows
      .filter((r) => {
        try {
          return parseISO(r.period.end_date).getFullYear() === currentYear;
        } catch {
          return false;
        }
      })
      .reduce((s, r) => s + r.base_total_pay, 0);
    const historical = rows
      .filter((r) => r.is_historical_import)
      .reduce((s, r) => s + r.base_total_pay, 0);
    return { total, latest, ytd, historical };
  }, [rows]);

  // ----- Print -----
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ----- Copy summary -----
  const copySummary = useCallback(
    async (row: PayReportRow) => {
      const text = `Pay Report · ${fmtRange(
        row.period.start_date,
        row.period.end_date,
      )} · Total paid ${fmtMoney(row.base_total_pay)} · Source ${sourceLabel(row)} · ${
        row.is_historical_import ? "Final historical record" : validationLabel(row) + " record"
      }`;
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Summary copied", description: text });
      } catch {
        toast({
          title: "Couldn't copy",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-dvh bg-background pb-28 print:bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/40 print:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            to="/portal"
            className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center active:scale-95 transition"
            aria-label="Back to portal home"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold font-heading text-foreground leading-tight">
              My Weekly Pay Reports
            </h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Your weekly payment summaries and historical payroll records.
            </p>
          </div>
          <button
            onClick={handlePrint}
            className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center active:scale-95 transition"
            aria-label="Print pay reports"
          >
            <Printer className="h-4 w-4 text-foreground" />
          </button>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4 print:px-0 print:pt-2">
        {/* KPIs */}
        <section
          aria-label="Pay reports summary"
          className="grid grid-cols-2 gap-2"
        >
          <KpiCard
            icon={FileText}
            label="Total reports"
            value={String(kpis.total)}
            tone="muted"
          />
          <KpiCard
            icon={Wallet}
            label="Latest payment"
            value={fmtMoney(kpis.latest)}
            tone="earning"
          />
          <KpiCard
            icon={CalendarRange}
            label="Year-to-date"
            value={fmtMoney(kpis.ytd)}
            tone="primary"
          />
          <KpiCard
            icon={Archive}
            label="Historical imported"
            value={fmtMoney(kpis.historical)}
            tone="warning"
          />
        </section>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <section aria-label="Pay reports" className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              Reports
            </h2>
            {rows.map((row) => (
              <PayReportCard
                key={row.period.id}
                row={row}
                onOpen={() => setOpenRow(row)}
              />
            ))}
          </section>
        )}
      </main>

      {/* Detail dialog */}
      <PayReportDetailDialog
        row={openRow}
        onClose={() => setOpenRow(null)}
        onCopy={copySummary}
        onPrint={handlePrint}
      />
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: "muted" | "earning" | "primary" | "warning";
}) {
  const TONE: Record<string, { bg: string; icon: string }> = {
    muted: { bg: "bg-muted/60", icon: "text-muted-foreground" },
    earning: { bg: "bg-[hsl(var(--status-confirmed)/0.12)]", icon: "text-[hsl(var(--status-confirmed))]" },
    primary: { bg: "bg-primary/10", icon: "text-primary" },
    warning: { bg: "bg-warning/15", icon: "text-warning" },
  };
  const t = TONE[tone];
  return (
    <div className="rounded-2xl bg-card border border-border/40 p-3 shadow-sm">
      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", t.bg)}>
        <Icon className={cn("h-3.5 w-3.5", t.icon)} />
      </div>
      <p className="text-base font-bold font-heading tabular-nums leading-none text-foreground">
        {value}
      </p>
      <p className="text-[9.5px] font-semibold text-muted-foreground/65 uppercase tracking-wider mt-1.5">
        {label}
      </p>
    </div>
  );
}

function PayReportCard({
  row,
  onOpen,
}: {
  row: PayReportRow;
  onOpen: () => void;
}) {
  const badge = statusBadge(row);
  const BadgeIcon = badge.icon;
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-2xl bg-card border border-border/40 px-4 py-3.5 shadow-sm active:scale-[0.99] transition-all hover:border-border/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {row.period.sequence_number != null && (
              <span className="text-[10px] font-bold tabular-nums text-muted-foreground/70 uppercase tracking-wide">
                Period #{row.period.sequence_number}
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                badge.cls,
              )}
            >
              <BadgeIcon className="h-2.5 w-2.5" />
              {badge.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground mt-1 leading-tight">
            {fmtRange(row.period.start_date, row.period.end_date)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {sourceLabel(row)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold font-heading tabular-nums leading-none text-foreground">
            {fmtMoney(row.base_total_pay)}
          </p>
          <p className="text-[9.5px] font-semibold text-muted-foreground/65 uppercase tracking-wider mt-1.5">
            Total paid
          </p>
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-card border border-border/40 px-6 py-12 text-center shadow-sm">
      <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">No pay reports yet</p>
      <p className="text-[12px] text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
        Your weekly payment summaries will appear here once payroll is finalized.
      </p>
    </div>
  );
}

function PayReportDetailDialog({
  row,
  onClose,
  onCopy,
  onPrint,
  onViewDetails,
}: {
  row: PayReportRow | null;
  onClose: () => void;
  onCopy: (row: PayReportRow) => void;
  onPrint: () => void;
  onViewDetails: (row: PayReportRow) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!row) return null;
  const badge = statusBadge(row);
  const BadgeIcon = badge.icon;
  const hasHours =
    !row.is_historical_import &&
    ((row.weekly_total_hours ?? 0) > 0 ||
      (row.total_work_hours ?? 0) > 0 ||
      (row.total_paid_hours ?? 0) > 0);
  const hasOvertime =
    (row.total_overtime ?? 0) > 0 && !row.is_historical_import;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Pay report details</DialogTitle>
          <DialogDescription>
            {fmtRange(row.period.start_date, row.period.end_date)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hero amount */}
          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Total paid
            </p>
            <p className="text-3xl font-bold font-heading tabular-nums text-foreground mt-1">
              {fmtMoney(row.base_total_pay)}
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border mt-3",
                badge.cls,
              )}
            >
              <BadgeIcon className="h-2.5 w-2.5" />
              {badge.label}
            </span>
          </div>

          {/* Breakdown */}
          <div className="space-y-2">
            <DetailRow label="Date range" value={fmtRange(row.period.start_date, row.period.end_date)} />
            {row.period.sequence_number != null && (
              <DetailRow label="Period #" value={String(row.period.sequence_number)} mono />
            )}
            <DetailRow label="Source" value={sourceLabel(row)} />
            <DetailRow label="Validation" value={validationLabel(row)} />
            {row.import_info?.created_at && (
              <DetailRow
                label="Imported on"
                value={fmtDateFriendly(row.import_info.created_at)}
              />
            )}
            {!row.is_historical_import && (row.total_regular ?? 0) > 0 && (
              <DetailRow
                label="Regular / base"
                value={fmtMoney(row.total_regular ?? 0)}
                mono
              />
            )}
            {hasOvertime && (
              <DetailRow
                label="Overtime"
                value={fmtMoney(row.total_overtime ?? 0)}
                mono
              />
            )}
            {hasHours && (
              <DetailRow
                label="Hours"
                value={`${(row.total_paid_hours ?? row.weekly_total_hours ?? 0).toFixed(2)} h`}
                mono
              />
            )}
          </div>

          {/* Historical disclaimer */}
          {row.is_historical_import && (
            <div className="rounded-xl bg-muted/40 border border-border/40 p-3 flex gap-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Final paid amount from historical payroll file. This summary
                reflects the final payroll record imported from Connecteam.
                Scheduled hours are not used to calculate payment.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await onCopy(row);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="w-full"
            >
              {copied ? (<><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</>) : (<><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy</>)}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onPrint} className="w-full">
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
            </Button>
            <Button type="button" variant="default" size="sm" onClick={() => onViewDetails(row)} className="w-full">
              <Info className="h-3.5 w-3.5 mr-1.5" /> Details
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span
        className={cn(
          "text-[13px] font-semibold text-foreground text-right",
          mono && "tabular-nums font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}
