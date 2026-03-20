import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2, AlertTriangle, XCircle, HandMetal, Zap, Shield,
  Search, ChevronDown, ChevronUp, Settings2, Users, Eye,
  Percent, DollarSign, Calendar, Clock, Wrench, Car, PenTool,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  runAutoApproval, DEFAULT_TOLERANCES,
  type ApprovalStatus, type ApprovalDecision, type ApprovalTolerances,
} from "@/lib/auto-approval-engine";
import type { EmployeeFinalRecord } from "@/hooks/useReconciliationPeriod";

interface Props {
  finalRecords: EmployeeFinalRecord[];
  employeeMap: Map<string, string>;
  onApproveRecord?: (recordId: string) => void;
  onBulkApprove?: (recordIds: string[]) => void;
  onNavigate: (tab: string) => void;
}

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; icon: any; color: string; badgeVariant: string }> = {
  auto_approved: { label: "Auto Aprobado", icon: CheckCircle2, color: "text-earning", badgeVariant: "success" },
  needs_review: { label: "Requiere Revisión", icon: AlertTriangle, color: "text-warning", badgeVariant: "warning" },
  blocked: { label: "Bloqueado", icon: XCircle, color: "text-destructive", badgeVariant: "destructive" },
  manual_action: { label: "Acción Manual", icon: HandMetal, color: "text-primary", badgeVariant: "info" },
};

type FilterStatus = "all" | ApprovalStatus;

const PAY_ICONS: Record<string, any> = {
  hourly: Clock, full_day: Calendar, half_day: Calendar, mixed_daily: Calendar, daily: Calendar,
  pay_ride: Car, manual_adjustment: PenTool, mixed: DollarSign, unknown: AlertTriangle,
};

export default function AutoApprovalPanel({ finalRecords, employeeMap, onApproveRecord, onBulkApprove, onNavigate }: Props) {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tolerances, setTolerances] = useState<ApprovalTolerances>(DEFAULT_TOLERANCES);

  const summary = useMemo(() => runAutoApproval(finalRecords, tolerances), [finalRecords, tolerances]);

  const items = useMemo(() => {
    let list = finalRecords.map(r => ({
      record: r,
      name: employeeMap.get(r.employee_id) || "—",
      decision: summary.decisions.get(r.employee_id)!,
    })).filter(i => i.decision);

    if (filter !== "all") list = list.filter(i => i.decision.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }

    // Sort: blocked → needs_review → manual → auto_approved
    const order: Record<ApprovalStatus, number> = { blocked: 0, needs_review: 1, manual_action: 2, auto_approved: 3 };
    list.sort((a, b) => (order[a.decision.status] ?? 3) - (order[b.decision.status] ?? 3));
    return list;
  }, [finalRecords, employeeMap, summary, filter, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.record.id)));
  };

  const handleBulkAutoApprove = () => {
    const autoApprovedIds = items
      .filter(i => i.decision.status === "auto_approved" && selectedIds.has(i.record.id))
      .map(i => i.record.id);
    if (autoApprovedIds.length > 0 && onBulkApprove) {
      onBulkApprove(autoApprovedIds);
      setSelectedIds(new Set());
    }
  };

  const handleApproveAllAuto = () => {
    const autoIds = finalRecords
      .filter(r => summary.decisions.get(r.employee_id)?.status === "auto_approved")
      .map(r => r.id);
    if (autoIds.length > 0 && onBulkApprove) {
      onBulkApprove(autoIds);
    }
  };

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KpiCard
          value={`${summary.auto_approval_rate}%`}
          label="Tasa Auto-Aprobación"
          icon={<Zap className="h-4 w-4 text-earning" />}
          accent={summary.auto_approval_rate >= 70 ? "earning" : summary.auto_approval_rate >= 40 ? "warning" : "deduction"}
        />
        <KpiCard
          value={summary.auto_approved}
          label="Auto Aprobados"
          icon={<CheckCircle2 className="h-4 w-4 text-earning" />}
          accent="earning"
          onClick={() => setFilter("auto_approved")}
        />
        <KpiCard
          value={summary.needs_review}
          label="Requieren Revisión"
          icon={<AlertTriangle className="h-4 w-4 text-warning" />}
          accent={summary.needs_review > 0 ? "warning" : "muted"}
          onClick={() => setFilter("needs_review")}
        />
        <KpiCard
          value={summary.blocked}
          label="Bloqueados"
          icon={<XCircle className="h-4 w-4 text-destructive" />}
          accent={summary.blocked > 0 ? "deduction" : "muted"}
          onClick={() => setFilter("blocked")}
        />
        <KpiCard
          value={summary.manual_action}
          label="Acción Manual"
          icon={<HandMetal className="h-4 w-4 text-primary" />}
          accent={summary.manual_action > 0 ? "primary" : "muted"}
          onClick={() => setFilter("manual_action")}
        />
      </div>

      {/* Quick action: Approve all auto */}
      {summary.auto_approved > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-earning/30 bg-earning/5">
          <Zap className="h-5 w-5 text-earning shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-earning">{summary.auto_approved} empleados listos para auto-aprobación</p>
            <p className="text-xs text-muted-foreground">Dentro de tolerancia, sin conflictos ni bloqueos</p>
          </div>
          <Button size="sm" variant="success" className="gap-1" onClick={handleApproveAllAuto}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar {summary.auto_approved}
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Motor de Auto-Aprobación
              <Badge variant="outline" className="text-[10px]">{items.length}/{finalRecords.length}</Badge>
            </CardTitle>
            <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setShowSettings(!showSettings)}>
              <Settings2 className="h-3.5 w-3.5" /> Tolerancias
            </Button>
          </div>

          {/* Tolerance settings */}
          {showSettings && (
            <div className="mt-2 p-3 rounded-lg bg-muted/40 border space-y-2">
              <div className="text-xs font-medium">Tolerancias de Auto-Aprobación</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Tolerancia absoluta ($)</label>
                  <Input
                    type="number"
                    value={tolerances.absolute_tolerance}
                    onChange={e => setTolerances(t => ({ ...t, absolute_tolerance: Number(e.target.value) || 0 }))}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Tolerancia porcentual (%)</label>
                  <Input
                    type="number"
                    value={tolerances.percentage_tolerance}
                    onChange={e => setTolerances(t => ({ ...t, percentage_tolerance: Number(e.target.value) || 0 }))}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Overrides por tipo: full_day ($1/1%), hourly ($10/5%), manual (siempre revisión)
              </div>
            </div>
          )}

          {/* Filter pills + search */}
          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            {(["all", "auto_approved", "needs_review", "blocked", "manual_action"] as FilterStatus[]).map(s => {
              const active = filter === s;
              const cfg = s === "all" ? { label: "Todos", icon: Users } : STATUS_CONFIG[s];
              const Icon = cfg.icon;
              return (
                <Button key={s} size="sm" variant={active ? "default" : "ghost"} className="h-7 text-[11px] gap-1 px-2" onClick={() => setFilter(s)}>
                  <Icon className="h-3 w-3" /> {cfg.label}
                </Button>
              );
            })}
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={selectAll}>
              {selectedIds.size === items.length && items.length > 0 ? "Deseleccionar" : "Seleccionar"}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-muted/40 border">
              <span className="text-xs text-muted-foreground">{selectedIds.size} seleccionados</span>
              <Button size="xs" variant="success" className="gap-1" onClick={handleBulkAutoApprove}>
                <CheckCircle2 className="h-3 w-3" /> Aprobar seleccionados
              </Button>
              <Button size="xs" variant="outline" className="gap-1" onClick={() => onNavigate("workbench")}>
                <Wrench className="h-3 w-3" /> Workbench
              </Button>
            </div>
          )}

          <ScrollArea className="max-h-[600px]">
            <div className="space-y-1">
              {items.map(({ record: r, name, decision: d }) => {
                const cfg = STATUS_CONFIG[d.status];
                const Icon = cfg.icon;
                const PayIcon = PAY_ICONS[r.pay_classification] || DollarSign;
                const isSelected = selectedIds.has(r.id);
                const isExpanded = expandedId === r.id;
                const displayTotal = r.grand_total || r.final_total_pay || 0;

                return (
                  <div key={r.id} className={`rounded-lg border transition-colors ${isSelected ? "border-primary/50 bg-primary/3" : "border-border"}`}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(r.id)} className="shrink-0" />
                      <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{name}</span>
                          <Badge variant={cfg.badgeVariant as any} className="text-[10px]">{cfg.label}</Badge>
                          <PayIcon className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{r.pay_classification}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{d.primary_reason}</p>
                      </div>
                      <div className="text-right shrink-0 min-w-[90px]">
                        <div className="text-xs font-mono font-bold">{fmt(displayTotal)}</div>
                        {d.computed.absolute_diff > 0 && (
                          <div className={`text-[10px] font-mono ${d.computed.absolute_diff > d.computed.tolerance_used_absolute ? "text-destructive" : "text-muted-foreground"}`}>
                            Δ {fmt(d.computed.absolute_diff)} ({d.computed.percentage_diff.toFixed(1)}%)
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {d.status === "auto_approved" && onApproveRecord && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Aprobar" onClick={() => onApproveRecord(r.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-earning" />
                          </Button>
                        )}
                        {d.status !== "auto_approved" && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Workbench" onClick={() => onNavigate("workbench")}>
                            <Wrench className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-3 pb-2 border-t border-dashed space-y-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 py-2 text-[11px]">
                          <div><span className="text-muted-foreground">Shift-Calc:</span> <strong className="font-mono">{fmt(d.computed.shift_calculated_total)}</strong></div>
                          <div><span className="text-muted-foreground">Payroll Ref:</span> <strong className="font-mono">{fmt(d.computed.payroll_reference_total)}</strong></div>
                          <div><span className="text-muted-foreground">Δ Absoluta:</span> <strong className="font-mono">{fmt(d.computed.absolute_diff)}</strong></div>
                          <div><span className="text-muted-foreground">Δ Porcentual:</span> <strong>{d.computed.percentage_diff.toFixed(1)}%</strong></div>
                          <div><span className="text-muted-foreground">Tolerancia $:</span> {fmt(d.computed.tolerance_used_absolute)}</div>
                          <div><span className="text-muted-foreground">Tolerancia %:</span> {d.computed.tolerance_used_percentage}%</div>
                          <div><span className="text-muted-foreground">Tarifa:</span> {d.computed.has_rate ? "✓" : "✗ Faltante"}</div>
                          <div><span className="text-muted-foreground">Confianza:</span> <strong>{d.confidence}%</strong></div>
                        </div>

                        {/* All reasons */}
                        <div className="space-y-0.5">
                          <div className="text-[10px] font-medium text-muted-foreground">Razones de decisión</div>
                          {d.reasons.map((reason, i) => {
                            const rIcon = reason.severity === "critical" ? XCircle : reason.severity === "warning" ? AlertTriangle : CheckCircle2;
                            const RIcon = rIcon;
                            const rColor = reason.severity === "critical" ? "text-destructive" : reason.severity === "warning" ? "text-warning" : "text-earning";
                            return (
                              <div key={i} className={`text-[10px] flex items-center gap-1 ${rColor}`}>
                                <RIcon className="h-2.5 w-2.5 shrink-0" /> {reason.label}
                              </div>
                            );
                          })}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 pt-1.5 border-t border-dashed">
                          <span className="text-[10px] text-muted-foreground mr-1">Acciones:</span>
                          {d.status !== "blocked" && onApproveRecord && (
                            <Button size="xs" variant="outline" className="gap-1 text-[10px]" onClick={() => onApproveRecord(r.id)}>
                              <CheckCircle2 className="h-2.5 w-2.5" /> {d.status === "auto_approved" ? "Confirmar" : "Forzar Aprobación"}
                            </Button>
                          )}
                          <Button size="xs" variant="outline" className="gap-1 text-[10px]" onClick={() => onNavigate("workbench")}>
                            <Wrench className="h-2.5 w-2.5" /> Workbench
                          </Button>
                          <Button size="xs" variant="outline" className="gap-1 text-[10px]" onClick={() => onNavigate("employees")}>
                            <Eye className="h-2.5 w-2.5" /> Ver detalle
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {search ? "Sin resultados." : "No hay empleados en este filtro."}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
