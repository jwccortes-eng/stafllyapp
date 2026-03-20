import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2, AlertTriangle, XCircle, Eye, Wrench, Search,
  ChevronDown, ChevronUp, Users, DollarSign, Clock, FileText,
  ChevronsRight, Filter, Car, Calendar, PenTool, Briefcase,
} from "lucide-react";
import QuickClassifyBar, { type ClassifyAction } from "./QuickClassifyBar";
import type { EmployeeFinalRecord, EmployeeVariance } from "@/hooks/useReconciliationPeriod";

interface Props {
  finalRecords: EmployeeFinalRecord[];
  variances: EmployeeVariance[];
  employeeMap: Map<string, string>;
  onNavigate: (tab: string) => void;
  onApproveRecord?: (recordId: string) => void;
  onBulkApprove?: (recordIds: string[]) => void;
  onClassifyRecords?: (recordIds: string[], classification: ClassifyAction) => Promise<void>;
  onMarkReviewed?: (recordIds: string[]) => Promise<void>;
}

type FilterMode = "all" | "critical" | "warnings" | "pending" | "resolved";

const FILTER_OPTIONS: { value: FilterMode; label: string; icon: any }[] = [
  { value: "all", label: "Todos", icon: Users },
  { value: "critical", label: "Críticos", icon: XCircle },
  { value: "warnings", label: "Advertencias", icon: AlertTriangle },
  { value: "pending", label: "Pendientes", icon: Clock },
  { value: "resolved", label: "Listos", icon: CheckCircle2 },
];

const VARIANCE_BADGE: Record<string, { label: string; variant: string; icon: any }> = {
  exact_match: { label: "✓ Exact", variant: "default", icon: CheckCircle2 },
  minor_variance: { label: "~ Menor", variant: "outline", icon: AlertTriangle },
  major_variance: { label: "⚠ Mayor", variant: "destructive", icon: XCircle },
  unresolved: { label: "✗ Sin resolver", variant: "destructive", icon: XCircle },
};

const PAY_ICONS: Record<string, any> = {
  hourly: Clock, daily: Calendar, pay_ride: Car, weekend_job: Briefcase, manual_adjustment: PenTool, mixed: DollarSign, unknown: AlertTriangle,
};

export default function EmployeeCloseCards({ finalRecords, variances, employeeMap, onNavigate, onApproveRecord, onBulkApprove, onClassifyRecords, onMarkReviewed }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const varianceMap = useMemo(() => {
    const map = new Map<string, EmployeeVariance>();
    variances.forEach(v => map.set(v.employee_id, v));
    return map;
  }, [variances]);

  const filtered = useMemo(() => {
    let items = finalRecords.map(r => ({
      record: r,
      name: employeeMap.get(r.employee_id) || "—",
      variance: varianceMap.get(r.employee_id),
    }));

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }

    if (filter === "critical") items = items.filter(i => i.variance?.variance_status === "major_variance" || i.variance?.variance_status === "unresolved");
    else if (filter === "warnings") items = items.filter(i => i.variance?.variance_status === "minor_variance");
    else if (filter === "pending") items = items.filter(i => !["approved", "resolved", "posted"].includes(i.record.reconciliation_status));
    else if (filter === "resolved") items = items.filter(i => ["approved", "resolved", "posted"].includes(i.record.reconciliation_status));

    const order: Record<string, number> = { unresolved: 0, major_variance: 1, minor_variance: 2, exact_match: 3 };
    items.sort((a, b) => (order[a.variance?.variance_status || "exact_match"] ?? 3) - (order[b.variance?.variance_status || "exact_match"] ?? 3));

    return items;
  }, [finalRecords, employeeMap, varianceMap, search, filter]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(i => i.record.id)));
  };

  const handleBulkApprove = async (ids: string[]) => {
    if (onBulkApprove) {
      onBulkApprove(ids);
      setSelectedIds(new Set());
    }
  };

  const handleClassify = async (ids: string[], classification: ClassifyAction) => {
    if (onClassifyRecords) {
      await onClassifyRecords(ids, classification);
      setSelectedIds(new Set());
    }
  };

  const handleMarkReviewed = async (ids: string[]) => {
    if (onMarkReviewed) {
      await onMarkReviewed(ids);
      setSelectedIds(new Set());
    }
  };

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Empleados ({filtered.length}/{finalRecords.length})
          </CardTitle>
        </div>
        {/* Toolbar */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar empleado..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-0.5">
            {FILTER_OPTIONS.map(f => {
              const Icon = f.icon;
              const active = filter === f.value;
              return (
                <Button
                  key={f.value}
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className="h-7 text-[11px] gap-1 px-2"
                  onClick={() => setFilter(f.value)}
                >
                  <Icon className="h-3 w-3" /> {f.label}
                </Button>
              );
            })}
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={selectAll}>
            {selectedIds.size === filtered.length && filtered.length > 0 ? "Deseleccionar" : "Seleccionar todos"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Quick action bar for selected */}
        {selectedIds.size > 0 && (
          <QuickClassifyBar
            selectedIds={Array.from(selectedIds)}
            onClassify={handleClassify}
            onBulkApprove={handleBulkApprove}
            onBulkMarkReviewed={handleMarkReviewed}
            onNavigateWorkbench={() => onNavigate("workbench")}
            compact
          />
        )}

        <ScrollArea className="max-h-[600px]">
          <div className="space-y-1.5">
            {filtered.map(({ record: r, name, variance: v }) => {
              const vBadge = VARIANCE_BADGE[v?.variance_status || "exact_match"] || VARIANCE_BADGE.exact_match;
              const isSelected = selectedIds.has(r.id);
              const isExpanded = expanded.has(r.id);
              const isPending = !["approved", "resolved", "posted"].includes(r.reconciliation_status);
              const StatusIcon = vBadge.icon;
              const PayIcon = PAY_ICONS[r.pay_classification] || DollarSign;
              const cleanHistorical = v?.source_payroll_total || r.source_payroll_total || 0;
              const grossHistorical = r.total_payroll_amount || 0;
              const excludedUnmappedAmount = Math.max(0, grossHistorical - cleanHistorical);
              const unmappedCount = (r.payroll_rows || []).filter((p: any) => p?.classified_type === "unmapped" || p?.type === "other" || p?.type === "unclassified").length;

              return (
                <div key={r.id} className={`rounded-lg border transition-colors ${isSelected ? "border-primary/50 bg-primary/3" : "border-border"}`}>
                  {/* Main row */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(r.id)}
                      className="shrink-0"
                    />
                    <button onClick={() => toggleExpand(r.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    <PayIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{name}</span>
                        <Badge variant={vBadge.variant as any} className="text-[10px] gap-0.5 shrink-0">
                          <StatusIcon className="h-2.5 w-2.5" /> {vBadge.label}
                        </Badge>
                        {r.pay_classification === "unknown" && (
                          <Badge variant="destructive" className="text-[10px] shrink-0">Sin clasificar</Badge>
                        )}
                        {Array.isArray(r.warnings) && r.warnings.some((w: any) => String(w).startsWith("CRITICAL_UNMAPPED_RATIO:")) && (
                          <Badge variant="destructive" className="text-[10px] shrink-0">Crítico unmapped</Badge>
                        )}
                        {isPending && <Badge variant="outline" className="text-[10px] shrink-0">Pendiente</Badge>}
                      </div>
                    </div>
                    {/* Compact metrics */}
                    <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                      <span title="Turnos">{(r.scheduled_shifts || []).length}S</span>
                      <span title="Fichajes">{(r.worked_shifts || []).length}F</span>
                      <span title="Nómina">{(r.payroll_rows || []).length}N</span>
                    </div>
                    <div className="text-right shrink-0 min-w-[100px]">
                      <div className="text-xs font-mono font-bold">{fmt(r.grand_total || r.final_total_pay || 0)}</div>
                      {v && v.variance_amount !== 0 && (
                        <div className={`text-[10px] font-mono ${Math.abs(v.variance_amount) > 10 ? "text-destructive" : "text-amber-600"}`}>
                          Δ {fmt(v.variance_amount)}
                        </div>
                      )}
                    </div>
                    {/* Quick actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {isPending && onApproveRecord && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Aprobar" onClick={() => onApproveRecord(r.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Workbench" onClick={() => onNavigate("workbench")}>
                        <Wrench className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-2 pt-0 border-t border-dashed">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 py-2 text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Programados:</span> <strong>{(r.scheduled_shifts || []).length}</strong> ({r.total_scheduled_hours?.toFixed(1)}h)
                        </div>
                        <div>
                          <span className="text-muted-foreground">Trabajados:</span> <strong>{(r.worked_shifts || []).length}</strong> ({r.total_worked_hours?.toFixed(1)}h)
                        </div>
                        <div>
                          <span className="text-muted-foreground">Nómina:</span> <strong>{(r.payroll_rows || []).length}</strong> filas ({r.total_payroll_hours?.toFixed(1)}h)
                        </div>
                        <div>
                          <span className="text-muted-foreground">Histórico limpio:</span> <strong className="font-mono">{fmt(cleanHistorical)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Histórico total:</span> <strong className="font-mono">{fmt(grossHistorical)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Excluido (unmapped):</span> <strong className={`font-mono ${excludedUnmappedAmount > 0 ? "text-destructive" : ""}`}>{fmt(excludedUnmappedAmount)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Registros unmapped:</span> <strong>{unmappedCount}</strong>
                        </div>
                      </div>
                      {/* Payment breakdown */}
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        {(r.hourly_pay_total || 0) > 0 && <Badge variant="secondary">Hourly: {fmt(r.hourly_pay_total)}</Badge>}
                        {(r.daily_pay_total || 0) > 0 && <Badge variant="secondary">Daily: {fmt(r.daily_pay_total)}</Badge>}
                        {(r.ride_pay_total || r.ride_amount || 0) > 0 && <Badge variant="secondary">Ride: {fmt(r.ride_pay_total || r.ride_amount || 0)}</Badge>}
                        {(r.weekend_pay_total || r.weekend_amount || 0) > 0 && <Badge variant="secondary">Weekend: {fmt(r.weekend_pay_total || r.weekend_amount || 0)}</Badge>}
                        {(r.manual_adjustment_total || r.manual_amount || 0) > 0 && <Badge variant="secondary">Manual: {fmt(r.manual_adjustment_total || r.manual_amount || 0)}</Badge>}
                        {excludedUnmappedAmount > 0 && <Badge variant="destructive">Otros (excluido): {fmt(excludedUnmappedAmount)}</Badge>}
                      </div>
                      {/* Variance explanation */}
                      {v && v.variance_amount !== 0 && (
                        <div className="mt-1.5 p-2 rounded bg-muted/30 space-y-0.5">
                          <div className="text-[10px] font-medium text-muted-foreground">¿Por qué hay varianza?</div>
                          <div className="text-[11px] font-mono">
                            Histórico limpio: {fmt(v.source_payroll_total)} → Reconciliado: {fmt(v.reconciled_total)} = Δ {fmt(v.variance_amount)}
                          </div>
                          {v.variance_reasons && v.variance_reasons.length > 0 && v.variance_reasons.map((reason, i) => (
                            <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Eye className="h-2.5 w-2.5" /> {reason}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Warnings */}
                      {r.warnings && r.warnings.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {r.warnings.map((w: string, i: number) => (
                            <div key={i} className="text-[10px] text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="h-2.5 w-2.5" /> {w}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Inline quick actions */}
                      {isPending && (
                        <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-dashed">
                          <span className="text-[10px] text-muted-foreground mr-1">Acciones:</span>
                          {onApproveRecord && (
                            <Button size="xs" variant="outline" className="gap-1 text-[10px]" onClick={() => onApproveRecord(r.id)}>
                              <CheckCircle2 className="h-2.5 w-2.5" /> Aprobar
                            </Button>
                          )}
                          <Button size="xs" variant="outline" className="gap-1 text-[10px]" onClick={() => onNavigate("workbench")}>
                            <Wrench className="h-2.5 w-2.5" /> Workbench
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {search ? "Sin resultados para esta búsqueda." : "Sin empleados en este filtro."}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
