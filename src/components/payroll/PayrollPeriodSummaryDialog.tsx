import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";
import {
  Users,
  DollarSign,
  FileSpreadsheet,
  ShieldCheck,
  AlertTriangle,
  Search,
  CheckCircle2,
  Lock,
  Upload,
  Sparkles,
  Loader2,
  Printer,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Period {
  id: string;
  sequence_number?: number | null;
  start_date: string;
  end_date: string;
  status: string;
  source_type?: string | null;
}

interface ImportRow {
  id: string;
  file_name: string;
  status: string;
  row_count: number | null;
  created_at: string;
}

interface BasePayRow {
  employee_id: string;
  base_total_pay: number;
  import_id: string | null;
}

interface EmployeeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  employer_identification: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: Period | null;
  companyId: string | null;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function initials(fn?: string | null, ln?: string | null) {
  return `${(fn?.[0] ?? "").toUpperCase()}${(ln?.[0] ?? "").toUpperCase()}` || "??";
}

export default function PayrollPeriodSummaryDialog({ open, onOpenChange, period, companyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [basePay, setBasePay] = useState<BasePayRow[]>([]);
  const [employees, setEmployees] = useState<Record<string, EmployeeRow>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !period || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [impRes, bpRes] = await Promise.all([
          supabase
            .from("imports")
            .select("id,file_name,status,row_count,created_at")
            .eq("period_id", period.id)
            .eq("company_id", companyId)
            .order("created_at", { ascending: false }),
          supabase
            .from("period_base_pay")
            .select("employee_id,base_total_pay,import_id")
            .eq("period_id", period.id)
            .eq("company_id", companyId),
        ]);
        if (cancelled) return;
        const bp = (bpRes.data as BasePayRow[]) ?? [];
        setImports((impRes.data as ImportRow[]) ?? []);
        setBasePay(bp);

        const empIds = Array.from(new Set(bp.map((r) => r.employee_id))).filter(Boolean);
        if (empIds.length) {
          const { data: empData } = await supabase
            .from("employees")
            .select("id,first_name,last_name,employer_identification,avatar_url")
            .in("id", empIds);
          if (cancelled) return;
          const map: Record<string, EmployeeRow> = {};
          ((empData as EmployeeRow[]) ?? []).forEach((e) => (map[e.id] = e));
          setEmployees(map);
        } else {
          setEmployees({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, period?.id, companyId]);

  const totals = useMemo(() => {
    const total = basePay.reduce((s, r) => s + Number(r.base_total_pay || 0), 0);
    return { count: basePay.length, total };
  }, [basePay]);

  const importRowCount = imports.reduce((s, i) => s + (i.row_count ?? 0), 0);
  const validationOk =
    imports.length > 0 && basePay.length > 0 && importRowCount === basePay.length;

  const sortedRows = useMemo(() => {
    return [...basePay].sort((a, b) => Number(b.base_total_pay) - Number(a.base_total_pay));
  }, [basePay]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((r) => {
      const e = employees[r.employee_id];
      if (!e) return false;
      const hay = `${e.first_name ?? ""} ${e.last_name ?? ""} ${e.employer_identification ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [search, sortedRows, employees]);

  if (!period) return null;

  const isImported = (period.source_type ?? "organic") === "imported" || imports.length > 0;
  const hasRows = basePay.length > 0;
  const hasImport = imports.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>Payroll Summary</span>
            {period.sequence_number != null && (
              <Badge variant="outline" className="text-xs">
                Period #{period.sequence_number}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground font-normal">
              {format(new Date(period.start_date), "yyyy-MM-dd")} → {format(new Date(period.end_date), "yyyy-MM-dd")}
            </span>
          </DialogTitle>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {period.status !== "open" && (
              <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground gap-1">
                <Lock className="h-3 w-3" /> Cerrado
              </Badge>
            )}
            {isImported && (
              <Badge variant="outline" className="text-[10px] bg-info/15 text-info border-info/30 gap-1">
                <Upload className="h-3 w-3" /> Importado
              </Badge>
            )}
            {hasImport && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 gap-1">
                <Sparkles className="h-3 w-3" /> Historical Import
              </Badge>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading summary…
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KpiCard value={totals.count} label="Employees" icon={<Users className="h-4 w-4" />} accent="primary" />
              <KpiCard value={fmtMoney(totals.total)} label="Total imported" icon={<DollarSign className="h-4 w-4" />} accent="earning" mono size="lg" className="col-span-2 sm:col-span-1" />
              <KpiCard value={imports.length} label="Imports" icon={<FileSpreadsheet className="h-4 w-4" />} accent="muted" />
              <KpiCard
                value={validationOk ? "OK" : hasRows ? "Check" : "—"}
                label="Validation"
                icon={validationOk ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                accent={validationOk ? "earning" : hasRows ? "warning" : "muted"}
              />
            </div>

            {/* Import audit */}
            {hasImport ? (
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Import audit
                </div>
                {imports.map((imp) => (
                  <div key={imp.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate font-medium">{imp.file_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">#{imp.id.slice(0, 8)}</span>
                      <span>{format(new Date(imp.created_at), "yyyy-MM-dd HH:mm")}</span>
                      <span>{imp.row_count ?? 0} rows</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          imp.status === "completed"
                            ? "bg-earning/10 text-earning border-earning/30"
                            : imp.status === "error"
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {imp.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : hasRows ? (
              <div className="rounded-xl border border-border/60 bg-card p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Organic / no import record
              </div>
            ) : null}

            {/* Validation */}
            {hasRows && (
              <div className={cn(
                "rounded-xl border p-3 text-xs flex items-center gap-2",
                validationOk
                  ? "bg-earning/5 border-earning/30 text-earning"
                  : "bg-warning/5 border-warning/30 text-warning"
              )}>
                {validationOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <span>
                  period_base_pay rows: <b>{basePay.length}</b>
                  {hasImport && <> · imports.row_count: <b>{importRowCount}</b></>} · Total: <b>{fmtMoney(totals.total)}</b>
                  {!validationOk && hasImport && " — mismatch detected"}
                </span>
              </div>
            )}

            {/* Empty state */}
            {!hasRows && (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                No payroll rows found for this period
              </div>
            )}

            {/* Employee list */}
            {hasRows && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search employee or ID…"
                      className="pl-8 h-9 text-sm"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {filteredRows.length} of {sortedRows.length}
                  </span>
                </div>

                <div className="rounded-xl border border-border/60 bg-card max-h-[360px] overflow-auto">
                  {filteredRows.map((r) => {
                    const e = employees[r.employee_id];
                    const name = e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : "Unknown employee";
                    return (
                      <div
                        key={r.employee_id}
                        className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/30 last:border-b-0 hover:bg-accent/30"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {e?.avatar_url ? (
                            <img src={e.avatar_url} alt={name} className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                              {initials(e?.first_name, e?.last_name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {e?.employer_identification ? `#${e.employer_identification}` : "—"}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-semibold">
                          {fmtMoney(Number(r.base_total_pay))}
                        </span>
                      </div>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matches</div>
                  )}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground italic">
              This is historical imported payroll. It does not recalculate from scheduled hours.
            </p>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
