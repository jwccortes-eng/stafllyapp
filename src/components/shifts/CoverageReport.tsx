import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Users, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoverageSummary, ShiftCoverageItem } from "@/hooks/useShiftCoverage";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  coverage: CoverageSummary;
  showAll?: boolean;
}

export function CoverageReport({ coverage, showAll = false }: Props) {
  const [viewAll, setViewAll] = useState(showAll);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const issues = coverage.items.filter(i => i.missingEmployees.length > 0 || i.extraEmployees.length > 0);
  const displayItems = viewAll ? coverage.items : issues;

  if (issues.length === 0 && !viewAll) {
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

  const statusBadge = (item: ShiftCoverageItem) => {
    if (item.totalClocked === 0 && item.totalAssigned > 0)
      return <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">Sin cobertura</Badge>;
    if (item.missingEmployees.length > 0)
      return <Badge className="bg-warning/10 text-warning border-0 text-[10px]">Parcial</Badge>;
    if (item.extraEmployees.length > 0)
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px]">Excedido</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-[10px]">Completo</Badge>;
  };

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
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="outline" className="text-xs tabular-nums">
                {coverage.overallPercent}% cobertura total
              </Badge>
              <button
                onClick={() => setViewAll(!viewAll)}
                className="text-xs text-primary hover:underline"
              >
                {viewAll ? "Solo discrepancias" : `Ver todos (${coverage.totalShifts})`}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {viewAll
              ? `${coverage.totalShifts} turnos totales`
              : `${issues.length} turno${issues.length !== 1 ? "s" : ""} con discrepancias`}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-8" />
                <TableHead className="text-xs">Turno</TableHead>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs text-center">Prog.</TableHead>
                <TableHead className="text-xs text-center">Ficharon</TableHead>
                <TableHead className="text-xs">Faltantes</TableHead>
                <TableHead className="text-xs">Extras</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayItems.map(item => {
                const isExpanded = expandedId === item.shiftId;
                return (
                  <>
                    <TableRow
                      key={item.shiftId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(isExpanded ? null : item.shiftId)}
                    >
                      <TableCell className="text-xs w-8 px-2">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </TableCell>
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
                            {item.missingEmployees.slice(0, 3).map(e => (
                              <Badge key={e.id} variant="outline" className="text-[9px] text-rose-600 border-rose-200 dark:border-rose-900">
                                <XCircle className="h-2.5 w-2.5 mr-0.5" /> {e.name.split(" ")[0]}
                              </Badge>
                            ))}
                            {item.missingEmployees.length > 3 && (
                              <Badge variant="outline" className="text-[9px]">+{item.missingEmployees.length - 3}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.extraEmployees.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.extraEmployees.slice(0, 3).map(e => (
                              <Badge key={e.id} variant="outline" className="text-[9px] text-amber-600 border-amber-200 dark:border-amber-900">
                                <Users className="h-2.5 w-2.5 mr-0.5" /> {e.name.split(" ")[0]}
                              </Badge>
                            ))}
                            {item.extraEmployees.length > 3 && (
                              <Badge variant="outline" className="text-[9px]">+{item.extraEmployees.length - 3}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(item)}</TableCell>
                    </TableRow>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <TableRow key={`${item.shiftId}-detail`} className="bg-muted/30">
                        <TableCell colSpan={8} className="p-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            {/* Assigned employees */}
                            <div>
                              <p className="font-semibold text-muted-foreground mb-1.5">Programados ({item.assignedEmployees.length})</p>
                              {item.assignedEmployees.length > 0 ? (
                                <div className="space-y-1">
                                  {item.assignedEmployees.map(e => {
                                    const clocked = item.clockedEmployees.find(c => c.id === e.id);
                                    const isMissing = item.missingEmployees.some(m => m.id === e.id);
                                    return (
                                      <div key={e.id} className="flex items-center justify-between px-2 py-1 rounded-lg bg-background">
                                        <span className={cn(isMissing && "text-destructive")}>{e.name}</span>
                                        {clocked ? (
                                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-[10px]">
                                            {clocked.hours}h
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                                            No fichó
                                          </Badge>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-muted-foreground/50">Sin asignaciones</p>
                              )}
                            </div>

                            {/* Extra employees (not assigned but clocked in) */}
                            <div>
                              <p className="font-semibold text-muted-foreground mb-1.5">Ficharon sin programar ({item.extraEmployees.length})</p>
                              {item.extraEmployees.length > 0 ? (
                                <div className="space-y-1">
                                  {item.extraEmployees.map(e => (
                                    <div key={e.id} className="flex items-center justify-between px-2 py-1 rounded-lg bg-background">
                                      <span>{e.name}</span>
                                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px]">
                                        {e.hours}h
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-muted-foreground/50">Ninguno</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
