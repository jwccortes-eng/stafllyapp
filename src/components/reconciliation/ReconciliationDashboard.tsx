import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, GitCompareArrows, AlertTriangle, CheckCircle2, Lock, FileText, Eye, Clock, BarChart3 } from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  periods: PeriodStatus[];
  onSelectPeriod: (p: PeriodStatus) => void;
  onCreatePeriod: () => void;
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

export default function ReconciliationDashboard({ periods, onSelectPeriod, onCreatePeriod }: Props) {
  const stats = useMemo(() => {
    const importing = periods.filter(p => ["importing", "normalizing", "matching"].includes(p.status)).length;
    const reviewing = periods.filter(p => p.status === "reviewing").length;
    const blocked = periods.filter(p => p.total_exceptions > p.resolved_exceptions && p.status === "reviewing").length;
    const approved = periods.filter(p => p.status === "approved").length;
    const posted = periods.filter(p => p.status === "posted" || p.status === "locked").length;
    const totalExceptions = periods.reduce((s, p) => s + (p.total_exceptions - p.resolved_exceptions), 0);
    return { importing, reviewing, blocked, approved, posted, totalExceptions };
  }, [periods]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Importando" value={stats.importing} icon={Upload} />
        <KpiCard title="En Revisión" value={stats.reviewing} icon={Eye} />
        <KpiCard title="Bloqueados" value={stats.blocked} icon={AlertTriangle} trend={stats.blocked > 0 ? "down" : undefined} />
        <KpiCard title="Aprobados" value={stats.approved} icon={CheckCircle2} />
        <KpiCard title="Publicados" value={stats.posted} icon={FileText} />
        <KpiCard title="Excepciones Abiertas" value={stats.totalExceptions} icon={AlertTriangle} trend={stats.totalExceptions > 0 ? "down" : undefined} />
      </div>

      {/* Period List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Periodos de Reconciliación
          </CardTitle>
          <Button size="sm" onClick={onCreatePeriod}>
            <Upload className="h-4 w-4 mr-1" /> Nuevo Periodo
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
                    <TableHead className="text-center">Turnos</TableHead>
                    <TableHead className="text-center">Fichajes</TableHead>
                    <TableHead className="text-center">Nómina</TableHead>
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
                        <TableCell className="text-center">{p.total_schedules}</TableCell>
                        <TableCell className="text-center">{p.total_clocks}</TableCell>
                        <TableCell className="text-center">{p.total_payroll_rows}</TableCell>
                        <TableCell className="text-center">
                          {openExceptions > 0 ? (
                            <Badge variant="destructive" className="text-xs">{openExceptions}</Badge>
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
