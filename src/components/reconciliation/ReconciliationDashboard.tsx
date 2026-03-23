import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, GitCompareArrows, AlertTriangle, CheckCircle2, Lock, FileText, Eye, Clock, BarChart3, ArrowRight } from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  periods: PeriodStatus[];
  onSelectPeriod: (p: PeriodStatus) => void;
  onCreatePeriod: () => void;
  formatLabel?: (p: PeriodStatus) => string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  importing: { label: "Importando", color: "secondary", icon: Upload },
  normalizing: { label: "Normalizando", color: "secondary", icon: GitCompareArrows },
  matching: { label: "Emparejando", color: "secondary", icon: GitCompareArrows },
  reviewing: { label: "En Revisión", color: "outline", icon: Eye },
  approved: { label: "Aprobado", color: "default", icon: CheckCircle2 },
  posted: { label: "Publicado", color: "default", icon: FileText },
  locked: { label: "Cerrado", color: "destructive", icon: Lock },
};

export default function ReconciliationDashboard({ periods, onSelectPeriod, onCreatePeriod, formatLabel }: Props) {
  const getLabel = (p: PeriodStatus) => formatLabel ? formatLabel(p) : (p.period_label || "Sin nombre");
  const stats = useMemo(() => {
    const importing = periods.filter(p => ["importing", "normalizing", "matching"].includes(p.status)).length;
    const reviewing = periods.filter(p => p.status === "reviewing").length;
    const blocked = periods.filter(p => p.total_exceptions > p.resolved_exceptions && p.status === "reviewing").length;
    const approved = periods.filter(p => p.status === "approved").length;
    const posted = periods.filter(p => p.status === "posted" || p.status === "locked").length;
    const totalExceptions = periods.reduce((s, p) => s + (p.total_exceptions - p.resolved_exceptions), 0);
    return { importing, reviewing, blocked, approved, posted, totalExceptions };
  }, [periods]);

  // Next actions — what needs attention right now
  const nextActions = useMemo(() => {
    const actions: { label: string; severity: "critical" | "warning" | "info"; period: PeriodStatus }[] = [];
    periods.forEach(p => {
      const openExceptions = p.total_exceptions - p.resolved_exceptions;
      if (p.status === "reviewing" && openExceptions > 0) {
        actions.push({ label: `"${p.period_label || 'Periodo'}" tiene ${openExceptions} excepción(es) sin resolver`, severity: openExceptions > 5 ? "critical" : "warning", period: p });
      } else if (p.status === "reviewing" && openExceptions === 0) {
        actions.push({ label: `"${p.period_label || 'Periodo'}" listo para aprobar`, severity: "info", period: p });
      } else if (["importing", "normalizing", "matching"].includes(p.status)) {
        actions.push({ label: `"${p.period_label || 'Periodo'}" en proceso de importación`, severity: "info", period: p });
      }
    });
    return actions.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    }).slice(0, 5);
  }, [periods]);

  const severityStyles = {
    critical: "border-destructive/30 bg-destructive/[0.04] text-destructive",
    warning: "border-warning/30 bg-warning/[0.04] text-warning",
    info: "border-primary/30 bg-primary/[0.04] text-primary",
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Importando" value={stats.importing} icon={<Upload className="h-4 w-4" />} />
        <KpiCard label="En Revisión" value={stats.reviewing} icon={<Eye className="h-4 w-4" />} />
        <KpiCard label="Bloqueados" value={stats.blocked} icon={<AlertTriangle className="h-4 w-4" />} accent={stats.blocked > 0 ? "warning" : "muted"} />
        <KpiCard label="Aprobados" value={stats.approved} icon={<CheckCircle2 className="h-4 w-4" />} accent="primary" />
        <KpiCard label="Publicados" value={stats.posted} icon={<FileText className="h-4 w-4" />} accent="earning" />
        <KpiCard label="Excepciones" value={stats.totalExceptions} icon={<AlertTriangle className="h-4 w-4" />} accent={stats.totalExceptions > 0 ? "warning" : "muted"} />
      </div>

      {/* Next Actions — confidence layer */}
      {nextActions.length > 0 && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" /> Próximas acciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {nextActions.map((action, i) => (
              <button
                key={i}
                onClick={() => onSelectPeriod(action.period)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 transition-colors hover:opacity-80 ${severityStyles[action.severity]}`}
              >
                <span>{action.label}</span>
                <ArrowRight className="h-3 w-3 shrink-0 opacity-50" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Period List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Periodos de Reconciliación
          </CardTitle>
          <Button size="sm" onClick={onCreatePeriod}>
            <Upload className="h-4 w-4 mr-1" /> Nuevo Batch de Reconciliación
          </Button>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <EmptyState icon={Clock} title="Sin periodos" description="Crea un periodo de reconciliación para comenzar el cierre semanal." />
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Rango</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Emp.</TableHead>
                    <TableHead className="text-center">Excepciones</TableHead>
                    <TableHead className="text-center">Matches</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map(p => {
                    const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.importing;
                    const Icon = cfg.icon;
                    const openExceptions = p.total_exceptions - p.resolved_exceptions;
                    return (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectPeriod(p)}>
                        <TableCell className="font-medium">{p.period_label || "Sin nombre"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.period_start} → {p.period_end}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.color as any} className="gap-1 text-xs">
                            <Icon className="h-3 w-3" /> {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{p.total_employees}</TableCell>
                        <TableCell className="text-center">
                          {openExceptions > 0 ? (
                            <Badge variant="warning" className="text-xs">{openExceptions}</Badge>
                          ) : p.total_exceptions > 0 ? (
                            <Badge variant="default" className="text-xs">✓ {p.total_exceptions}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.approved_matches}/{p.total_matches}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
