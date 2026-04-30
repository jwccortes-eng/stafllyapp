/**
 * Weekly Payroll Reconciliation Report (Phase 1, read-only).
 *
 * Upload a finalized weekly payroll Excel/CSV → compare against
 * `period_base_pay` for the selected period → render an executive summary,
 * a comparison table, a print-ready layout, and an Excel export.
 *
 * Hard rules:
 *   - No payroll recalculation.
 *   - No writes / no migrations.
 *   - Stafly source = period_base_pay only.
 *   - Tolerance $0.01.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Upload,
  Printer,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowLeft,
  Scale,
} from "lucide-react";
import { format } from "date-fns";
import { writeExcelFile } from "@/lib/safe-xlsx";
import StaflyCalmProcessingBanner from "@/components/common/StaflyCalmProcessingBanner";
import {
  parseWeeklyPayrollFile,
  reconcile,
  TOLERANCE,
  type ComparisonRow,
  type ExcelRow,
  type ReconciliationSummary,
  type StaflyRow,
} from "@/lib/weekly-payroll-reconciliation";

interface PeriodOption {
  id: string;
  sequence_number: number | null;
  start_date: string;
  end_date: string;
  status: string | null;
}

const fmtMoney = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const bucketLabel: Record<ComparisonRow["bucket"], string> = {
  matched_exact: "Matched exact",
  amount_mismatch: "Amount mismatch",
  missing_in_stafly: "Missing in Stafly",
  extra_in_stafly: "Extra in Stafly",
  name_id_mismatch: "Name/ID mismatch",
  needs_review: "Needs review",
};

const bucketTone: Record<ComparisonRow["bucket"], string> = {
  matched_exact: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  amount_mismatch: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  missing_in_stafly: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  extra_in_stafly: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  name_id_mismatch: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  needs_review: "bg-muted text-muted-foreground border-border",
};

export default function WeeklyPayrollReconciliation() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [periodId, setPeriodId] = useState<string>(params.get("periodId") || "");
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [excelMeta, setExcelMeta] = useState<{ fileName: string; footer: number; warnings: string[] } | null>(null);
  const [staflyRows, setStaflyRows] = useState<StaflyRow[]>([]);
  const [loadingStafly, setLoadingStafly] = useState(false);
  const [parsing, setParsing] = useState(false);
  const generatedAt = useMemo(() => new Date(), [excelRows, staflyRows]);

  /* ---------------- Periods ---------------- */
  useEffect(() => {
    if (!selectedCompanyId) {
      setPeriods([]);
      return;
    }
    setLoadingPeriods(true);
    supabase
      .from("pay_periods")
      .select("id, sequence_number, start_date, end_date, status")
      .eq("company_id", selectedCompanyId)
      .order("start_date", { ascending: false })
      .limit(60)
      .then(({ data, error }) => {
        if (error) {
          toast({ title: "Couldn't load periods", description: error.message, variant: "destructive" });
        }
        setPeriods((data as PeriodOption[]) ?? []);
        setLoadingPeriods(false);
      });
  }, [selectedCompanyId, toast]);

  // sync querystring
  useEffect(() => {
    if (periodId) {
      const next = new URLSearchParams(params);
      next.set("periodId", periodId);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  /* ---------------- Stafly source ---------------- */
  useEffect(() => {
    if (!selectedCompanyId || !periodId) {
      setStaflyRows([]);
      return;
    }
    setLoadingStafly(true);
    (async () => {
      const { data: bp, error } = await supabase
        .from("period_base_pay")
        .select("employee_id, base_total_pay")
        .eq("company_id", selectedCompanyId)
        .eq("period_id", periodId);
      if (error) {
        toast({ title: "Couldn't load Stafly payroll", description: error.message, variant: "destructive" });
        setStaflyRows([]);
        setLoadingStafly(false);
        return;
      }
      const rows = (bp ?? []) as { employee_id: string; base_total_pay: number }[];
      const empIds = Array.from(new Set(rows.map((r) => r.employee_id)));
      const { data: emps } = empIds.length
        ? await supabase
            .from("employees")
            .select("id, first_name, last_name, employer_identification")
            .in("id", empIds)
        : { data: [] as any[] };
      const empMap = new Map<string, any>((emps ?? []).map((e: any) => [e.id, e]));
      setStaflyRows(
        rows.map((r) => {
          const e = empMap.get(r.employee_id);
          return {
            employee_id: r.employee_id,
            employer_identification: e?.employer_identification ?? null,
            first_name: e?.first_name ?? "",
            last_name: e?.last_name ?? "",
            base_total_pay: Number(r.base_total_pay) || 0,
          };
        }),
      );
      setLoadingStafly(false);
    })();
  }, [selectedCompanyId, periodId, toast]);

  /* ---------------- File upload ---------------- */
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    try {
      const r = await parseWeeklyPayrollFile(file);
      setExcelRows(r.rows);
      setExcelMeta({ fileName: file.name, footer: r.footer_excluded, warnings: r.warnings });
      toast({ title: `Parsed ${r.rows.length} rows`, description: file.name });
    } catch (e: any) {
      toast({ title: "Couldn't parse file", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  /* ---------------- Reconcile ---------------- */
  const result = useMemo(() => {
    if (!excelRows.length && !staflyRows.length) return null;
    return reconcile({ excelRows, staflyRows, footer_excluded: excelMeta?.footer ?? 0 });
  }, [excelRows, staflyRows, excelMeta]);

  const selectedPeriod = periods.find((p) => p.id === periodId) || null;

  /* ---------------- Export Excel ---------------- */
  const exportExcel = async () => {
    if (!result) return;
    const fileBase = `weekly_reconciliation_${selectedPeriod?.sequence_number ?? "period"}_${format(new Date(), "yyyyMMdd_HHmm")}`;
    const summary = [
      { Field: "Company", Value: selectedCompany?.name ?? "—" },
      { Field: "Period #", Value: selectedPeriod?.sequence_number ?? "—" },
      { Field: "Date range", Value: selectedPeriod ? `${selectedPeriod.start_date} → ${selectedPeriod.end_date}` : "—" },
      { Field: "Generated at", Value: format(generatedAt, "yyyy-MM-dd HH:mm") },
      { Field: "Source file", Value: excelMeta?.fileName ?? "—" },
      { Field: "Excel employees", Value: result.summary.excel_employees },
      { Field: "Stafly employees", Value: result.summary.stafly_employees },
      { Field: "Excel total", Value: result.summary.excel_total.toFixed(2) },
      { Field: "Stafly total", Value: result.summary.stafly_total.toFixed(2) },
      { Field: "Difference", Value: result.summary.difference.toFixed(2) },
      { Field: "Matched exact", Value: result.summary.matched_exact },
      { Field: "Amount mismatch", Value: result.summary.amount_mismatch },
      { Field: "Missing in Stafly", Value: result.summary.missing_in_stafly },
      { Field: "Extra in Stafly", Value: result.summary.extra_in_stafly },
      { Field: "Name/ID mismatch", Value: result.summary.name_id_mismatch },
      { Field: "Needs review", Value: result.summary.needs_review },
      { Field: "Footer excluded", Value: result.summary.footer_excluded },
      { Field: "Status", Value: result.summary.status },
    ];
    const comparison = result.rows.map((r) => ({
      Bucket: bucketLabel[r.bucket],
      EmployerID: r.excel?.employer_identification ?? r.stafly?.employer_identification ?? "",
      Worker:
        r.excel
          ? `${r.excel.last_name}, ${r.excel.first_name}`
          : r.stafly
          ? `${r.stafly.last_name}, ${r.stafly.first_name}`
          : "",
      ExcelAmount: r.excel_amount ?? "",
      StaflyAmount: r.stafly_amount ?? "",
      Difference: r.difference ?? "",
      MatchMethod: r.match_method,
      Notes: r.notes ?? "",
    }));
    const sourceRows = excelRows.map((r) => ({
      Row: r.row_number,
      EmployerID: r.employer_identification ?? "",
      FirstName: r.first_name,
      LastName: r.last_name,
      Total: r.total ?? "",
    }));
    const exceptions = result.rows
      .filter((r) => r.bucket !== "matched_exact")
      .map((r) => ({
        Bucket: bucketLabel[r.bucket],
        Worker:
          r.excel
            ? `${r.excel.last_name}, ${r.excel.first_name}`
            : r.stafly
            ? `${r.stafly.last_name}, ${r.stafly.first_name}`
            : "",
        Excel: r.excel_amount ?? "",
        Stafly: r.stafly_amount ?? "",
        Difference: r.difference ?? "",
        Notes: r.notes ?? "",
      }));
    // safe-xlsx writeExcelFile only writes one sheet — use ExcelJS directly to write multiple sheets.
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const addSheet = (name: string, rows: Record<string, any>[]) => {
      const ws = wb.addWorksheet(name);
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };
      rows.forEach((r) => ws.addRow(headers.map((h) => r[h])));
      headers.forEach((_, i) => (ws.getColumn(i + 1).width = 22));
    };
    addSheet("Summary", summary);
    addSheet("Comparison", comparison);
    addSheet("Source rows", sourceRows);
    addSheet("Exceptions", exceptions);
    addSheet("Metadata", [
      { Field: "Tolerance", Value: TOLERANCE },
      { Field: "Source", Value: "period_base_pay" },
      { Field: "Phase", Value: 1 },
      { Field: "Read-only", Value: true },
    ]);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Excel exported", description: `${fileBase}.xlsx` });
  };

  /* ---------------- Render ---------------- */
  return (
    <div className="space-y-6 print:space-y-3">
      <div className="print:hidden">
        <Link to="/app/periods" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Payroll periods
        </Link>
        <PageHeader
          title="Weekly Payroll Reconciliation Report"
          subtitle="Compare a finalized weekly payroll file against Stafly's period_base_pay. Read-only · no recalculation."
          icon={Scale}
        />
      </div>

      {/* Print header */}
      <div className="hidden print:block weekly-recon-print-header">
        <h1 className="text-2xl font-bold">Weekly Payroll Reconciliation Report</h1>
        <div className="text-sm text-muted-foreground mt-1">
          <div><strong>Company:</strong> {selectedCompany?.name ?? "—"}</div>
          {selectedPeriod && (
            <>
              <div><strong>Period #:</strong> {selectedPeriod.sequence_number ?? "—"}</div>
              <div><strong>Date range:</strong> {selectedPeriod.start_date} → {selectedPeriod.end_date}</div>
            </>
          )}
          <div><strong>Generated at:</strong> {format(generatedAt, "yyyy-MM-dd HH:mm")}</div>
          <div><strong>Source file:</strong> {excelMeta?.fileName ?? "—"}</div>
        </div>
      </div>

      {/* Selectors + actions */}
      <Card className="print:hidden">
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pay period</label>
              <Select value={periodId} onValueChange={setPeriodId} disabled={loadingPeriods || !selectedCompanyId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={loadingPeriods ? "Loading…" : "Select a period"} />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sequence_number != null ? `#${p.sequence_number} · ` : ""}
                      {p.start_date} → {p.end_date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source file (Excel / CSV)</label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsing}
                  className="w-full justify-start"
                >
                  {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {excelMeta?.fileName ?? "Upload payroll file"}
                </Button>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => window.print()} disabled={!result}>
                <Printer className="h-4 w-4 mr-1.5" /> Print
              </Button>
              <Button variant="outline" onClick={exportExcel} disabled={!result}>
                <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Export Excel
              </Button>
            </div>
          </div>
          {!selectedCompanyId && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
              Select a company to load periods.
            </div>
          )}
          {excelMeta && excelMeta.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
              {excelMeta.warnings.join(" · ")}
            </div>
          )}
        </CardContent>
      </Card>

      {(loadingStafly || parsing) && (
        <StaflyCalmProcessingBanner
          title="Validando payroll semanal"
          message="Estamos comparando el archivo final contra Stafly. Todo está bien."
          footerNote="Scheduled hours are not used for payment."
        />
      )}

      {result && <SummaryGrid summary={result.summary} />}

      {result && (
        <Card className="weekly-recon-print-section">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Comparison ({result.rows.length})</CardTitle>
            <div className="text-xs text-muted-foreground print:hidden">Tolerance ±${TOLERANCE.toFixed(2)}</div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Bucket</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead className="font-mono text-xs">Employer ID</TableHead>
                  <TableHead className="text-right">Excel</TableHead>
                  <TableHead className="text-right">Stafly</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                  <TableHead className="hidden lg:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r, i) => {
                  const worker =
                    r.excel
                      ? `${r.excel.last_name}, ${r.excel.first_name}`
                      : r.stafly
                      ? `${r.stafly.last_name}, ${r.stafly.first_name}`
                      : "—";
                  const eid = r.excel?.employer_identification ?? r.stafly?.employer_identification ?? "—";
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant="outline" className={bucketTone[r.bucket]}>
                          {bucketLabel[r.bucket]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{worker}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{eid}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.excel_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.stafly_amount)}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          r.difference != null && Math.abs(r.difference) > TOLERANCE ? "text-rose-600 font-semibold" : ""
                        }`}
                      >
                        {r.difference == null ? "—" : fmtMoney(r.difference)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{r.match_method}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{r.notes ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="hidden print:block text-[10px] text-muted-foreground border-t pt-2 mt-4">
          Payroll is based on finalized/imported records. Scheduled hours are not used for payment.
        </div>
      )}
    </div>
  );
}

function SummaryGrid({ summary }: { summary: ReconciliationSummary }) {
  const StatusIcon =
    summary.status === "balanced" ? CheckCircle2 : summary.status === "needs_review" ? AlertTriangle : XCircle;
  const statusTone =
    summary.status === "balanced"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
      : summary.status === "needs_review"
      ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
      : "bg-rose-500/10 text-rose-700 border-rose-500/30";

  const Cell = ({ label, value, tone }: { label: string; value: string | number; tone?: string }) => (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-1 ${tone ?? ""}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-3 weekly-recon-print-section">
      <div className={`rounded-lg border px-4 py-3 flex items-center justify-between ${statusTone}`}>
        <div className="flex items-center gap-2">
          <StatusIcon className="h-5 w-5" />
          <div>
            <div className="text-sm font-bold uppercase tracking-wide">{summary.status.replace("_", " ")}</div>
            <div className="text-xs">
              Difference {fmtMoney(summary.difference)} (tolerance ±{fmtMoney(TOLERANCE)})
            </div>
          </div>
        </div>
        <div className="text-right text-xs">
          <div>Excel total <span className="font-bold tabular-nums">{fmtMoney(summary.excel_total)}</span></div>
          <div>Stafly total <span className="font-bold tabular-nums">{fmtMoney(summary.stafly_total)}</span></div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Cell label="Excel employees" value={summary.excel_employees} />
        <Cell label="Stafly employees" value={summary.stafly_employees} />
        <Cell label="Matched exact" value={summary.matched_exact} tone="text-emerald-700" />
        <Cell label="Amount mismatch" value={summary.amount_mismatch} tone={summary.amount_mismatch ? "text-amber-700" : ""} />
        <Cell label="Missing in Stafly" value={summary.missing_in_stafly} tone={summary.missing_in_stafly ? "text-rose-700" : ""} />
        <Cell label="Extra in Stafly" value={summary.extra_in_stafly} tone={summary.extra_in_stafly ? "text-blue-700" : ""} />
        <Cell label="Name/ID mismatch" value={summary.name_id_mismatch} tone={summary.name_id_mismatch ? "text-purple-700" : ""} />
        <Cell label="Needs review" value={summary.needs_review} />
        <Cell label="Footer excluded" value={summary.footer_excluded} />
        <Cell label="Difference" value={fmtMoney(summary.difference)} tone={Math.abs(summary.difference) > TOLERANCE ? "text-rose-700" : "text-emerald-700"} />
      </div>
    </div>
  );
}
