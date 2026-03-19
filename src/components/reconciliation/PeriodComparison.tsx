import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowDown, ArrowUp, Minus, BarChart3 } from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  periods: PeriodStatus[];
  activePeriodId: string;
}

interface MetricRow {
  label: string;
  key: string;
  format: "number" | "currency";
}

const METRICS: MetricRow[] = [
  { label: "Empleados", key: "total_employees", format: "number" },
  { label: "Turnos", key: "total_schedules", format: "number" },
  { label: "Fichajes", key: "total_clocks", format: "number" },
  { label: "Filas Nómina", key: "total_payroll_rows", format: "number" },
  { label: "Matches", key: "total_matches", format: "number" },
  { label: "Excepciones", key: "total_exceptions", format: "number" },
  { label: "Exc. Resueltas", key: "resolved_exceptions", format: "number" },
  { label: "Reaperturas", key: "reopen_count", format: "number" },
];

function DeltaIndicator({ current, previous, inverse }: { current: number; previous: number; inverse?: boolean }) {
  if (previous === 0 && current === 0) return <Minus className="h-3 w-3 text-muted-foreground" />;
  const diff = current - previous;
  const isUp = diff > 0;
  const isNeutral = diff === 0;
  if (isNeutral) return <Minus className="h-3 w-3 text-muted-foreground" />;

  const good = inverse ? !isUp : isUp;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-medium ${good ? "text-primary" : "text-destructive"}`}>
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(diff)}
    </span>
  );
}

export default function PeriodComparison({ periods, activePeriodId }: Props) {
  const sorted = useMemo(() =>
    [...periods].sort((a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime()).slice(0, 6),
    [periods]
  );

  const activeIdx = sorted.findIndex(p => p.id === activePeriodId);

  if (sorted.length < 2) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState icon={BarChart3} title="Sin comparación" description="Se necesitan al menos 2 periodos para comparar." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Comparación entre Periodos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">Métrica</TableHead>
                {sorted.map((p, i) => (
                  <TableHead key={p.id} className={`text-center min-w-[100px] ${p.id === activePeriodId ? "bg-primary/5" : ""}`}>
                    <div className="text-xs">{p.period_label || "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{p.period_start}</div>
                    {p.id === activePeriodId && <Badge variant="outline" className="text-[9px] mt-0.5">Actual</Badge>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRICS.map(m => (
                <TableRow key={m.key}>
                  <TableCell className="text-xs font-medium">{m.label}</TableCell>
                  {sorted.map((p, i) => {
                    const val = (p as any)[m.key] || 0;
                    const prev = i < sorted.length - 1 ? ((sorted[i + 1] as any)[m.key] || 0) : val;
                    const inverse = m.key === "total_exceptions" || m.key === "reopen_count";
                    return (
                      <TableCell key={p.id} className={`text-center ${p.id === activePeriodId ? "bg-primary/5" : ""}`}>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-sm font-mono">{val}</span>
                          {i < sorted.length - 1 && <DeltaIndicator current={val} previous={prev} inverse={inverse} />}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {/* Status row */}
              <TableRow>
                <TableCell className="text-xs font-medium">Estado</TableCell>
                {sorted.map(p => (
                  <TableCell key={p.id} className={`text-center ${p.id === activePeriodId ? "bg-primary/5" : ""}`}>
                    <Badge variant="secondary" className="text-[10px]">{p.status}</Badge>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
