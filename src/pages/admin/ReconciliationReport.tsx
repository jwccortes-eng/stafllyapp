import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  FileText, Download, RefreshCw, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, Clock, DollarSign, Users,
  TrendingUp, TrendingDown, Minus, Filter, BarChart3, Eye, Printer
} from "lucide-react";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface ReconPeriod {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
  connecteam_totals: any;
  stafly_totals: any;
  total_variance: number;
  variance_details: any;
  unresolved_count: number;
  notes: string | null;
}

interface Exception {
  id: string;
  period_reconciliation_id: string | null;
  exception_type: string;
  severity: string;
  source_data: any;
  status: string;
  resolution_action: string | null;
  resolution_note: string | null;
  created_at: string;
}

/* ─── Helpers ─── */
const fmt = (v: number | null | undefined) =>
  v != null ? `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";
const fmtSigned = (v: number | null | undefined) =>
  v != null ? `${v >= 0 ? "+" : "-"}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";
const fmtHrs = (v: number | null | undefined) =>
  v != null ? `${v.toLocaleString("en-US", { minimumFractionDigits: 1 })}h` : "—";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 border-red-200",
  high: "bg-orange-500/10 text-orange-700 border-orange-200",
  medium: "bg-amber-500/10 text-amber-700 border-amber-200",
  low: "bg-blue-500/10 text-blue-700 border-blue-200",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  reconciled: "default",
  locked: "default",
  under_review: "outline",
  draft_imported: "secondary",
};

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  orphan_clocks: { label: "Orphan Clocks", icon: Clock, color: "text-orange-600" },
  duration_mismatch: { label: "Duration Mismatch", icon: AlertTriangle, color: "text-amber-600" },
  unmapped_employee: { label: "Unmapped Employees", icon: Users, color: "text-red-600" },
  stafly_only_employees: { label: "StaflyApps Only", icon: Users, color: "text-blue-600" },
  rate_difference: { label: "Rate Differences", icon: DollarSign, color: "text-purple-600" },
};

/* ─── Component ─── */
export default function ReconciliationReport() {
  const { selectedCompanyId: companyId } = useCompany();
  const [periods, setPeriods] = useState<ReconPeriod[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [pRes, eRes] = await Promise.all([
      supabase.from("migration_period_reconciliation").select("*").eq("company_id", companyId).order("week_start"),
      supabase.from("migration_exceptions").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ]);
    setPeriods((pRes.data as ReconPeriod[]) || []);
    setExceptions((eRes.data as Exception[]) || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Computed Stats ─── */
  const stats = useMemo(() => {
    const totalCT = periods.reduce((s, p) => s + (p.connecteam_totals?.gross || 0), 0);
    const totalSF = periods.reduce((s, p) => s + (p.stafly_totals?.gross || 0), 0);
    const totalVariance = periods.reduce((s, p) => s + (p.total_variance || 0), 0);
    const avgVariancePct = totalCT > 0 ? (totalVariance / totalCT) * 100 : 0;

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    const byCategory: Record<string, number> = {};
    const byStatus = { open: 0, in_progress: 0, resolved: 0, ignored: 0 };
    let totalExplainedAmount = 0;

    for (const e of exceptions) {
      bySeverity[e.severity as keyof typeof bySeverity] = (bySeverity[e.severity as keyof typeof bySeverity] || 0) + 1;
      byCategory[e.exception_type] = (byCategory[e.exception_type] || 0) + 1;
      byStatus[e.status as keyof typeof byStatus] = (byStatus[e.status as keyof typeof byStatus] || 0) + 1;
      totalExplainedAmount += Math.abs(e.source_data?.amount || 0);
    }

    const reconciled = periods.filter(p => p.status === "reconciled" || p.status === "locked").length;

    return { totalCT, totalSF, totalVariance, avgVariancePct, bySeverity, byCategory, byStatus, totalExplainedAmount, reconciled };
  }, [periods, exceptions]);

  /* ─── Filtered Exceptions ─── */
  const filteredExceptions = useMemo(() => {
    return exceptions.filter(e => {
      if (filterSeverity !== "all" && e.severity !== filterSeverity) return false;
      if (filterCategory !== "all" && e.exception_type !== filterCategory) return false;
      if (filterStatus !== "all" && e.status !== filterStatus) return false;
      return true;
    });
  }, [exceptions, filterSeverity, filterCategory, filterStatus]);

  /* ─── Exceptions grouped by period ─── */
  const exceptionsByPeriod = useMemo(() => {
    const map: Record<string, Exception[]> = {};
    for (const e of filteredExceptions) {
      const key = e.period_reconciliation_id || "unlinked";
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [filteredExceptions]);

  /* ─── Top variance drivers across all periods ─── */
  const topDrivers = useMemo(() => {
    const drivers: { category: string; totalAmount: number; count: number; pct: number }[] = [];
    const grouped: Record<string, { amount: number; count: number }> = {};
    for (const e of exceptions) {
      const cat = e.exception_type;
      if (!grouped[cat]) grouped[cat] = { amount: 0, count: 0 };
      grouped[cat].amount += Math.abs(e.source_data?.amount || 0);
      grouped[cat].count += 1;
    }
    const total = Object.values(grouped).reduce((s, g) => s + g.amount, 0);
    for (const [cat, g] of Object.entries(grouped)) {
      drivers.push({ category: cat, totalAmount: g.amount, count: g.count, pct: total > 0 ? (g.amount / total) * 100 : 0 });
    }
    return drivers.sort((a, b) => b.totalAmount - a.totalAmount);
  }, [exceptions]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reconciliation Report" subtitle="Loading analysis..." />
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading data...
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation Report"
        subtitle={`Connecteam ↔ StaflyApps • ${periods.length} weeks analyzed • ${exceptions.length} findings`}
      />

      {/* ─── Executive Summary KPIs ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">CT Total</div>
          <div className="text-xl font-bold">{fmt(stats.totalCT)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Stafly Total</div>
          <div className="text-xl font-bold">{fmt(stats.totalSF)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Net Variance</div>
          <div className={cn("text-xl font-bold", stats.totalVariance > 0 ? "text-destructive" : "text-primary")}>
            {fmtSigned(stats.totalVariance)}
          </div>
          <div className="text-[10px] text-muted-foreground">{stats.avgVariancePct.toFixed(1)}% of CT</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Explained</div>
          <div className="text-xl font-bold">{fmt(stats.totalExplainedAmount)}</div>
          <div className="text-[10px] text-muted-foreground">{exceptions.length} findings</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Reconciled</div>
          <div className="text-xl font-bold">{stats.reconciled}/{periods.length}</div>
          <Progress value={periods.length > 0 ? (stats.reconciled / periods.length) * 100 : 0} className="mt-1 h-1.5" />
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="weekly" className="gap-1.5"><FileText className="h-4 w-4" /> By Week</TabsTrigger>
          <TabsTrigger value="findings" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Findings
            <Badge variant="destructive" className="ml-1 text-xs">{stats.byStatus.open}</Badge>
          </TabsTrigger>
          <TabsTrigger value="drivers" className="gap-1.5"><TrendingUp className="h-4 w-4" /> Variance Drivers</TabsTrigger>
        </TabsList>

        {/* ─── TAB: Overview ─── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Severity Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Exception Severity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(["critical", "high", "medium", "low"] as const).map(sev => {
                  const count = stats.bySeverity[sev];
                  const pct = exceptions.length > 0 ? (count / exceptions.length) * 100 : 0;
                  return (
                    <div key={sev} className="flex items-center gap-3">
                      <div className="w-16 text-xs capitalize">{sev}</div>
                      <div className="flex-1">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", {
                              "bg-red-500": sev === "critical",
                              "bg-orange-500": sev === "high",
                              "bg-amber-500": sev === "medium",
                              "bg-blue-500": sev === "low",
                            })}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-8 text-xs text-right font-medium">{count}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Resolution Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(["open", "in_progress", "resolved", "ignored"] as const).map(st => {
                  const count = stats.byStatus[st];
                  const pct = exceptions.length > 0 ? (count / exceptions.length) * 100 : 0;
                  return (
                    <div key={st} className="flex items-center gap-3">
                      <div className="w-20 text-xs capitalize">{st.replace(/_/g, " ")}</div>
                      <div className="flex-1">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", {
                              "bg-red-500": st === "open",
                              "bg-amber-500": st === "in_progress",
                              "bg-primary": st === "resolved",
                              "bg-muted-foreground": st === "ignored",
                            })}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-8 text-xs text-right font-medium">{count}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Week-by-week variance chart (horizontal bars) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Weekly Variance Waterfall</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {periods.map(p => {
                  const maxVar = Math.max(...periods.map(pp => Math.abs(pp.total_variance || 0)), 1);
                  const pct = Math.abs(p.total_variance || 0) / maxVar * 100;
                  const isPositive = (p.total_variance || 0) >= 0;
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <div className="w-28 text-muted-foreground whitespace-nowrap">{p.week_start}</div>
                      <div className="flex-1 flex items-center">
                        <div className="w-1/2 flex justify-end">
                          {!isPositive && (
                            <div className="h-4 bg-primary/70 rounded-l" style={{ width: `${pct}%` }} />
                          )}
                        </div>
                        <div className="w-px h-5 bg-border" />
                        <div className="w-1/2">
                          {isPositive && (
                            <div className="h-4 bg-destructive/70 rounded-r" style={{ width: `${pct}%` }} />
                          )}
                        </div>
                      </div>
                      <div className={cn("w-20 text-right font-medium", isPositive ? "text-destructive" : "text-primary")}>
                        {fmtSigned(p.total_variance)}
                      </div>
                      <Badge variant={STATUS_VARIANT[p.status] || "outline"} className="text-[10px] w-20 justify-center">
                        {p.status?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB: By Week ─── */}
        <TabsContent value="weekly" className="space-y-3">
          {periods.map(p => {
            const isExpanded = expandedPeriod === p.id;
            const periodExceptions = exceptionsByPeriod[p.id] || [];
            const ct = p.connecteam_totals || {};
            const sf = p.stafly_totals || {};

            return (
              <Collapsible key={p.id} open={isExpanded} onOpenChange={(o) => setExpandedPeriod(o ? p.id : null)}>
                <Card className={cn("transition-colors", isExpanded && "border-primary/30")}>
                  <CollapsibleTrigger asChild>
                    <CardContent className="py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <div className="flex-1 flex items-center gap-4 flex-wrap">
                          <span className="font-medium text-sm whitespace-nowrap">{p.week_start} → {p.week_end}</span>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>CT: {fmt(ct.gross)} ({fmtHrs(ct.hours)})</span>
                            <span>SF: {fmt(sf.gross)} ({fmtHrs(sf.hours)})</span>
                          </div>
                          <div className={cn("text-sm font-bold", (p.total_variance || 0) > 0 ? "text-destructive" : "text-primary")}>
                            {fmtSigned(p.total_variance)}
                          </div>
                        </div>
                        <Badge variant={STATUS_VARIANT[p.status] || "outline"} className="text-xs">
                          {p.status?.replace(/_/g, " ")}
                        </Badge>
                        {periodExceptions.length > 0 && (
                          <Badge variant="destructive" className="text-xs">{periodExceptions.length} findings</Badge>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t px-4 pb-4 pt-3 space-y-4">
                      {/* Side-by-side comparison */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1.5 p-3 rounded-lg bg-muted/30">
                          <div className="text-xs font-medium text-muted-foreground mb-2">Connecteam</div>
                          <div className="flex justify-between"><span>Gross Pay</span><span className="font-medium">{fmt(ct.gross)}</span></div>
                          <div className="flex justify-between"><span>Hours</span><span>{fmtHrs(ct.hours)}</span></div>
                          <div className="flex justify-between"><span>Employees</span><span>{ct.employees || 0}</span></div>
                          <div className="flex justify-between"><span>Entries</span><span>{ct.entries || 0}</span></div>
                        </div>
                        <div className="space-y-1.5 p-3 rounded-lg bg-muted/30">
                          <div className="text-xs font-medium text-muted-foreground mb-2">StaflyApps</div>
                          <div className="flex justify-between"><span>Gross Pay</span><span className="font-medium">{fmt(sf.gross)}</span></div>
                          <div className="flex justify-between"><span>Hours</span><span>{fmtHrs(sf.hours)}</span></div>
                          <div className="flex justify-between"><span>Employees</span><span>{sf.employees || 0}</span></div>
                        </div>
                      </div>

                      {/* Exception details */}
                      {periodExceptions.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-muted-foreground">Findings for this period</h4>
                          {periodExceptions.map(exc => {
                            const catInfo = CATEGORY_LABELS[exc.exception_type] || { label: exc.exception_type, icon: AlertTriangle, color: "text-muted-foreground" };
                            const Icon = catInfo.icon;
                            const sd = exc.source_data || {};
                            return (
                              <div key={exc.id} className={cn("rounded-lg border p-3 text-sm", SEVERITY_COLORS[exc.severity] || "")}>
                                <div className="flex items-start gap-2">
                                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", catInfo.color)} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">{catInfo.label}</span>
                                      <Badge variant="outline" className="text-[10px]">{exc.severity}</Badge>
                                      <Badge variant={exc.status === "resolved" ? "default" : "outline"} className="text-[10px]">
                                        {exc.status}
                                      </Badge>
                                      {sd.amount != null && sd.amount !== 0 && (
                                        <span className="text-xs font-medium ml-auto">{fmtSigned(sd.amount)}</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{sd.description || sd.title}</p>

                                    {/* Top jobs for orphan clocks */}
                                    {sd.top_jobs && sd.top_jobs.length > 0 && (
                                      <div className="mt-2 space-y-0.5">
                                        <div className="text-[10px] font-medium text-muted-foreground">Top jobs affected:</div>
                                        {sd.top_jobs.slice(0, 3).map((j: any, i: number) => (
                                          <div key={i} className="text-[10px] flex justify-between">
                                            <span>{j.job}</span>
                                            <span>{j.count} entries • {j.hours}h • {fmt(j.pay)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Rate difference samples */}
                                    {sd.samples && sd.samples.length > 0 && (
                                      <div className="mt-2 space-y-0.5">
                                        <div className="text-[10px] font-medium text-muted-foreground">Sample rate differences:</div>
                                        {sd.samples.slice(0, 3).map((s: any, i: number) => (
                                          <div key={i} className="text-[10px] flex justify-between">
                                            <span>{s.employee}</span>
                                            <span>CT ${s.ct_rate}/hr → SF ${s.sf_rate}/hr (Δ${s.diff})</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Unmapped employee names */}
                                    {sd.employee_names && sd.employee_names.length > 0 && (
                                      <div className="mt-1 text-[10px] text-muted-foreground">
                                        Employees: {sd.employee_names.slice(0, 5).join(", ")}
                                        {sd.employee_names.length > 5 && ` +${sd.employee_names.length - 5} more`}
                                      </div>
                                    )}

                                    {/* SF-only employees */}
                                    {sd.sample_employees && sd.sample_employees.length > 0 && (
                                      <div className="mt-1 text-[10px] text-muted-foreground">
                                        Employees: {sd.sample_employees.slice(0, 5).join(", ")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {p.notes && (
                        <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">{p.notes}</div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </TabsContent>

        {/* ─── TAB: Findings ─── */}
        <TabsContent value="findings" className="space-y-4">
          {/* Filters */}
          <Card className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="ignored">Ignored</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">{filteredExceptions.length} of {exceptions.length}</span>
            </div>
          </Card>

          {/* Findings table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Week</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20">Severity</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExceptions.map(exc => {
                  const sd = exc.source_data || {};
                  const catInfo = CATEGORY_LABELS[exc.exception_type] || { label: exc.exception_type, color: "" };
                  return (
                    <TableRow key={exc.id}>
                      <TableCell className="text-xs whitespace-nowrap">{sd.week_start || "—"}</TableCell>
                      <TableCell>
                        <span className={cn("text-xs font-medium", catInfo.color)}>{catInfo.label}</span>
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{sd.title || sd.description}</TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {sd.amount != null && sd.amount !== 0 ? fmtSigned(sd.amount) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", SEVERITY_COLORS[exc.severity]?.split(" ")[1])}>
                          {exc.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={exc.status === "resolved" ? "default" : exc.status === "open" ? "destructive" : "outline"} className="text-[10px]">
                          {exc.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredExceptions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No findings match the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ─── TAB: Variance Drivers ─── */}
        <TabsContent value="drivers" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Root Cause Analysis — Variance Drivers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topDrivers.map(d => {
                const catInfo = CATEGORY_LABELS[d.category] || { label: d.category, icon: AlertTriangle, color: "text-muted-foreground" };
                const Icon = catInfo.icon;
                return (
                  <div key={d.category} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", catInfo.color)} />
                        <span className="text-sm font-medium">{catInfo.label}</span>
                        <span className="text-xs text-muted-foreground">({d.count} findings)</span>
                      </div>
                      <div className="text-sm font-bold">{fmt(d.totalAmount)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", catInfo.color.replace("text-", "bg-"))}
                          style={{ width: `${d.pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-12 text-right">{d.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Key Insights */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" /> Key Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <span>
                  <strong>Orphan Clocks</strong> are the #1 driver of variance — {
                    topDrivers.find(d => d.category === "orphan_clocks")?.pct.toFixed(0) || 0
                  }% of total explained amount. These are Connecteam clock entries with no corresponding time entry in StaflyApps. Top affected jobs: Emminence Hall, ELY Produccion, New Customer.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                <span>
                  <strong>Rate Differences</strong> affect multiple employees consistently. Connecteam rates are often higher ($17-30/hr) vs StaflyApps ($15/hr). This suggests the SF system may be using a default rate instead of employee-specific rates.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <span>
                  <strong>SF-Only Employees</strong> contribute negative variance — employees with time entries in StaflyApps but no corresponding CT clock. This is expected for employees already fully migrated.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  <strong>Week Feb 11-17</strong> has the smallest variance (-$999, ~5%) and the most matched entries (40), making it the best candidate for the first "locked" period.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
