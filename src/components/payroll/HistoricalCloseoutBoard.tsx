import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Lock,
  Sparkles,
  Eye,
  Copy,
  Printer,
  FileSpreadsheet,
  Search,
  ListChecks,
  DollarSign,
  Calendar,
  Filter,
} from "lucide-react";

type Status =
  | "imported_validated"
  | "clean_candidate"
  | "needs_replace_review"
  | "paid_blocked"
  | "passover_blocked"
  | "manual_review";

interface PeriodLite {
  id: string;
  sequence_number: number | null;
  start_date: string;
  end_date: string;
  status: string;
  source_type: string | null;
  calculation_mode: string | null;
}

interface ImportLite {
  id: string;
  period_id: string | null;
  file_name: string;
  status: string;
  row_count: number | null;
  created_at: string;
}

interface BasePayAgg {
  period_id: string;
  rows: number;
  total: number;
}

interface BoardRow {
  period: PeriodLite;
  imports: ImportLite[];
  basePayRows: number;
  basePayTotal: number;
  importRowCount: number;
  status: Status;
  recommendation: string;
}

const STATUS_META: Record<Status, { label: string; cls: string; dot: string }> = {
  imported_validated: {
    label: "Validated",
    cls: "bg-earning/10 text-earning border-earning/30",
    dot: "bg-earning",
  },
  clean_candidate: {
    label: "Ready candidate",
    cls: "bg-info/10 text-info border-info/30",
    dot: "bg-info",
  },
  needs_replace_review: {
    label: "Review",
    cls: "bg-warning/10 text-warning border-warning/30",
    dot: "bg-warning",
  },
  paid_blocked: {
    label: "Paid blocked",
    cls: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
  passover_blocked: {
    label: "PASSOVER",
    cls: "bg-primary/10 text-primary border-primary/30",
    dot: "bg-primary",
  },
  manual_review: {
    label: "Manual review",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    dot: "bg-destructive",
  },
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "imported", label: "Imported" },
  { key: "ready", label: "Ready" },
  { key: "review", label: "Review" },
  { key: "blocked", label: "Blocked" },
  { key: "paid", label: "Paid" },
  { key: "passover", label: "PASSOVER" },
];

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function classify(period: PeriodLite, imports: ImportLite[], rows: number, total: number): { status: Status; recommendation: string } {
  // PASSOVER hardcoded periods #126 / #127 (2026-04-01 → 2026-04-14)
  const seq = period.sequence_number ?? -1;
  if (seq === 126 || seq === 127) {
    return { status: "passover_blocked", recommendation: "Needs split decision before any import." };
  }
  if (period.status === "paid") {
    return { status: "paid_blocked", recommendation: "Do not touch. Document only unless explicit approval." };
  }
  const completed = imports.find((i) => i.status === "completed");
  if (completed && completed.row_count != null && completed.row_count === rows && total > 0) {
    return { status: "imported_validated", recommendation: seq === 128 ? "Pilot approved" : "Validated import" };
  }
  if (imports.length > 0 && (completed == null || (completed.row_count ?? -1) !== rows)) {
    return { status: "manual_review", recommendation: "Import exists but row_count mismatch — verify." };
  }
  if (rows === 0 && imports.length === 0) {
    return { status: "clean_candidate", recommendation: "Ready for pilot import" };
  }
  if (rows > 0 && imports.length === 0) {
    return { status: "needs_replace_review", recommendation: "Decide replace / merge / skip — organic rows present." };
  }
  return { status: "manual_review", recommendation: "Inspect manually." };
}

function statusToFilterBucket(s: Status): string {
  switch (s) {
    case "imported_validated":
      return "imported";
    case "clean_candidate":
      return "ready";
    case "needs_replace_review":
      return "review";
    case "paid_blocked":
      return "paid";
    case "passover_blocked":
      return "passover";
    case "manual_review":
      return "review";
  }
}

interface Props {
  companyId: string | null;
  onOpenSummary: (period: any) => void;
}

export default function HistoricalCloseoutBoard({ companyId, onOpenSummary }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState<PeriodLite[]>([]);
  const [imports, setImports] = useState<ImportLite[]>([]);
  const [agg, setAgg] = useState<BasePayAgg[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [pRes, iRes, bpRes] = await Promise.all([
          supabase
            .from("pay_periods")
            .select("id,sequence_number,start_date,end_date,status,source_type,calculation_mode")
            .eq("company_id", companyId)
            .order("sequence_number", { ascending: false })
            .limit(60),
          supabase
            .from("imports")
            .select("id,period_id,file_name,status,row_count,created_at")
            .eq("company_id", companyId)
            .not("period_id", "is", null)
            .order("created_at", { ascending: false }),
          supabase
            .from("period_base_pay")
            .select("period_id,base_total_pay")
            .eq("company_id", companyId),
        ]);
        if (cancelled) return;
        setPeriods((pRes.data as PeriodLite[]) ?? []);
        setImports((iRes.data as ImportLite[]) ?? []);
        const map = new Map<string, BasePayAgg>();
        ((bpRes.data as { period_id: string; base_total_pay: number }[]) ?? []).forEach((r) => {
          const cur = map.get(r.period_id) ?? { period_id: r.period_id, rows: 0, total: 0 };
          cur.rows += 1;
          cur.total += Number(r.base_total_pay || 0);
          map.set(r.period_id, cur);
        });
        setAgg(Array.from(map.values()));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  const rows: BoardRow[] = useMemo(() => {
    const importsByPeriod = new Map<string, ImportLite[]>();
    imports.forEach((i) => {
      if (!i.period_id) return;
      const arr = importsByPeriod.get(i.period_id) ?? [];
      arr.push(i);
      importsByPeriod.set(i.period_id, arr);
    });
    const aggByPeriod = new Map(agg.map((a) => [a.period_id, a]));
    return periods.map((p) => {
      const imps = importsByPeriod.get(p.id) ?? [];
      const a = aggByPeriod.get(p.id);
      const basePayRows = a?.rows ?? 0;
      const basePayTotal = a?.total ?? 0;
      const importRowCount = imps.reduce((s, i) => s + (i.row_count ?? 0), 0);
      const { status, recommendation } = classify(p, imps, basePayRows, basePayTotal);
      return { period: p, imports: imps, basePayRows, basePayTotal, importRowCount, status, recommendation };
    });
  }, [periods, imports, agg]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && statusToFilterBucket(r.status) !== filter) return false;
      if (!q) return true;
      const hay = `#${r.period.sequence_number ?? ""} ${r.period.start_date} ${r.period.end_date} ${r.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, search]);

  const kpis = useMemo(() => {
    const validated = rows.filter((r) => r.status === "imported_validated");
    return {
      total: rows.length,
      validated: validated.length,
      ready: rows.filter((r) => r.status === "clean_candidate").length,
      blockedReview: rows.filter((r) =>
        ["paid_blocked", "passover_blocked", "needs_replace_review", "manual_review"].includes(r.status)
      ).length,
      historicalImported: validated.reduce((s, r) => s + r.basePayTotal, 0),
    };
  }, [rows]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const copyStatus = async (r: BoardRow) => {
    const parts = [
      `Period${r.period.sequence_number != null ? ` #${r.period.sequence_number}` : ""}`,
      `${format(new Date(r.period.start_date), "yyyy-MM-dd")} → ${format(new Date(r.period.end_date), "yyyy-MM-dd")}`,
      r.status,
      `${r.basePayRows} rows`,
      fmtMoney(r.basePayTotal),
      r.imports.length > 0
        ? `${r.imports.length} import${r.imports.length > 1 ? "s" : ""}${r.imports[0]?.status ? ` ${r.imports[0].status}` : ""}`
        : null,
      `validation ${
        r.status === "imported_validated" ? "OK" : r.basePayRows > 0 ? "check" : "n/a"
      }`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(parts.join(" · "));
      toast.success("Status copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const printBoard = () => window.print();

  return (
    <div className="mb-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full rounded-2xl border border-border/60 bg-card hover:bg-accent/30 transition-colors px-4 py-3 flex items-center justify-between gap-3 text-left no-print"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <ListChecks className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold">Historical Closeout Board</span>
                  <Badge className="text-[10px] bg-primary text-primary-foreground hover:bg-primary">
                    NEW
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    Read-only
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  Connecteam final payroll → Stafly historical snapshot
                </p>
              </div>
            </div>
            {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div id="closeout-board-printable" className="mt-3 space-y-4">
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #closeout-board-printable, #closeout-board-printable * { visibility: visible !important; }
                #closeout-board-printable { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
                .no-print { display: none !important; }
              }
            `}</style>

            {/* Print-only header */}
            <div className="hidden print:block border-b border-border pb-3 mb-3">
              <div className="text-xl font-bold">Historical Closeout Board</div>
              <div className="text-sm text-muted-foreground">
                Connecteam final payroll → Stafly historical snapshot · Generated {format(new Date(), "yyyy-MM-dd HH:mm")}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <KpiCard value={kpis.total} label="Periods" icon={<Calendar className="h-4 w-4" />} accent="muted" />
              <KpiCard value={kpis.validated} label="Validated" icon={<ShieldCheck className="h-4 w-4" />} accent="earning" />
              <KpiCard value={kpis.ready} label="Ready" icon={<Sparkles className="h-4 w-4" />} accent="primary" />
              <KpiCard value={kpis.blockedReview} label="Blocked / review" icon={<AlertTriangle className="h-4 w-4" />} accent="warning" />
              <KpiCard
                value={fmtMoney(kpis.historicalImported)}
                label="Total imported"
                icon={<DollarSign className="h-4 w-4" />}
                accent="earning"
                mono
                size="lg"
                className="col-span-2 sm:col-span-1"
              />
            </div>

            {/* Filters + actions */}
            <div className="flex flex-wrap items-center gap-2 no-print">
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={filter === f.key ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search period #, date or status…"
                  className="pl-8 h-8 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={printBoard}>
                <Printer className="h-3.5 w-3.5" /> Print board
              </Button>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Loading board…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                <Filter className="h-4 w-4 inline mr-1" /> No periods match this filter
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status];
                  const isExpanded = expanded.has(r.period.id);
                  const validationOk =
                    r.status === "imported_validated" && r.imports.length > 0 &&
                    r.importRowCount === r.basePayRows && r.basePayTotal > 0;
                  return (
                    <div
                      key={r.period.id}
                      className={cn(
                        "rounded-xl border bg-card transition-all",
                        meta.cls.replace(/text-\S+/, "").replace(/bg-\S+/, "bg-card"),
                        "border-border/60"
                      )}
                    >
                      <div className="p-3 flex flex-wrap items-start gap-3">
                        <div className={cn("h-2 w-2 rounded-full mt-2 shrink-0", meta.dot)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm">
                              Period {r.period.sequence_number != null ? `#${r.period.sequence_number}` : "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(r.period.start_date), "yyyy-MM-dd")} →{" "}
                              {format(new Date(r.period.end_date), "yyyy-MM-dd")}
                            </span>
                            <Badge variant="outline" className={cn("text-[10px]", meta.cls)}>
                              {meta.label}
                            </Badge>
                            {r.period.status === "paid" && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Lock className="h-3 w-3" /> paid
                              </Badge>
                            )}
                            {r.period.source_type && r.period.source_type !== "organic" && (
                              <Badge variant="outline" className="text-[10px]">
                                {r.period.source_type}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{r.recommendation}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Rows:</span>{" "}
                              <span className="font-mono tabular-nums">{r.basePayRows}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Total:</span>{" "}
                              <span className="font-mono tabular-nums">{fmtMoney(r.basePayTotal)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Imports:</span>{" "}
                              <span className="font-mono tabular-nums">{r.imports.length}</span>
                              {r.imports.length > 0 && (
                                <span className="text-muted-foreground"> ({r.importRowCount} rows)</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {validationOk ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-earning" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                              )}
                              <span>{validationOk ? "OK" : r.basePayRows > 0 ? "Check" : "—"}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 no-print">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => onOpenSummary(r.period)}
                          >
                            <Eye className="h-3 w-3" /> Summary
                          </Button>
                          {r.imports.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1"
                              onClick={() => toggle(r.period.id)}
                            >
                              <FileSpreadsheet className="h-3 w-3" />
                              {isExpanded ? "Hide" : "View"} import
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1"
                            onClick={() => copyStatus(r)}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                        </div>
                      </div>

                      {isExpanded && r.imports.length > 0 && (
                        <div className="border-t border-border/40 px-3 py-2 space-y-1 bg-muted/20">
                          {r.imports.map((imp) => (
                            <div key={imp.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">{imp.file_name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-muted-foreground">
                                <span className="font-mono">#{imp.id.slice(0, 8)}</span>
                                <span>{format(new Date(imp.created_at), "yyyy-MM-dd HH:mm")}</span>
                                <span>{imp.row_count ?? 0} rows</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {imp.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground italic">
              Read-only board. No writes, no payroll recalculation. Historical totals come from period_base_pay; never from scheduled hours.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
