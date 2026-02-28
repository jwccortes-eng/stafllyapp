import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Users, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoverageSummary, ShiftCoverageItem } from "@/hooks/useShiftCoverage";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  coverage: CoverageSummary;
}

export function CoverageReport({ coverage }: Props) {
  const issues = coverage.items.filter(i => i.missingEmployees.length > 0 || i.extraEmployees.length > 0);

  if (issues.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Cobertura completa</p>
            <p className="text-xs text-muted-foreground">
              Todos los {coverage.totalShifts} turnos tienen registros de reloj que coinciden con los empleados programados.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="text-xs">{coverage.fullyCovered} completos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-amber-500" />
              <span className="text-xs">{coverage.partiallyCovered} parciales</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-rose-500" />
              <span className="text-xs">{coverage.uncovered} sin cobertura</span>
            </div>
            <Badge variant="outline" className="ml-auto text-xs tabular-nums">
              {coverage.overallPercent}% cobertura total
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Discrepancy details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {issues.length} turno{issues.length !== 1 ? "s" : ""} con discrepancias
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Turno</TableHead>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs text-center">Programados</TableHead>
                <TableHead className="text-xs text-center">Ficharon</TableHead>
                <TableHead className="text-xs">Faltantes</TableHead>
                <TableHead className="text-xs">Extras</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map(item => (
                <TableRow key={item.shiftId}>
                  <TableCell className="text-xs font-medium">
                    {item.shiftCode && (
                      <span className="font-mono text-primary/60 mr-1">#{item.shiftCode.padStart(4, "0")}</span>
                    )}
                    {item.shiftTitle}
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {format(parseISO(item.date), "EEE d MMM", { locale: es })}
                  </TableCell>
                  <TableCell className="text-xs text-center tabular-nums">{item.totalAssigned}</TableCell>
                  <TableCell className="text-xs text-center tabular-nums">
                    <span className={cn(
                      item.totalClocked < item.totalAssigned ? "text-warning font-medium" : "text-emerald-600",
                    )}>
                      {item.totalClocked}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.missingEmployees.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.missingEmployees.map(e => (
                          <Badge key={e.id} variant="outline" className="text-[9px] text-rose-600 border-rose-200 dark:border-rose-900">
                            <XCircle className="h-2.5 w-2.5 mr-0.5" /> {e.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.extraEmployees.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.extraEmployees.map(e => (
                          <Badge key={e.id} variant="outline" className="text-[9px] text-amber-600 border-amber-200 dark:border-amber-900">
                            <Users className="h-2.5 w-2.5 mr-0.5" /> {e.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
