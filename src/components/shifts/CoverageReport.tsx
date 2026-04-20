import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, ChevronDown, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoverageSummary, ShiftCoverageItem, AttendanceLine } from "@/hooks/useShiftCoverage";
import { ATTENDANCE_LABELS, COVERAGE_STATUS_LABELS } from "@/lib/attendance-resolver";
import type { ResolvedAttendanceStatus, CoverageStatus } from "@/lib/attendance-resolver";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  coverage: CoverageSummary;
  showAll?: boolean;
}

const STATUS_BADGE_CLASS: Record<ResolvedAttendanceStatus, string> = {
  worked_clock: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  worked_manual: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  worked_daypay: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  worked_mixed: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  no_show: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  pending_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const COVERAGE_BADGE_CLASS: Record<CoverageStatus, string> = {
  covered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  covered_with_incidents: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  uncovered: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  pending_review: "bg-muted text-muted-foreground",
};

function AttendanceBadge({ line }: { line: AttendanceLine }) {
  const cls = STATUS_BADGE_CLASS[line.resolution.resolved_status];
  const label = ATTENDANCE_LABELS[line.resolution.resolved_status];
  const hours = line.resolution.worked_hours;
  return (
    <Badge className={cn("border-0 text-[10px] tabular-nums", cls)}>
      {label}{hours > 0 ? ` · ${hours}h` : ""}
    </Badge>
  );
}

export function CoverageReport({ coverage, showAll = false }: Props) {
  const [viewAll, setViewAll] = useState(showAll);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // "Issues" worth surfacing first: anything not fully covered or with extras
  const issues = coverage.items.filter(
    i => i.coverageStatus !== "covered" || i.extraEmployees.length > 0,
  );
  const displayItems = viewAll ? coverage.items : issues;

  if (issues.length === 0 && !viewAll) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Cobertura completa</p>
            <p className="text-xs text-muted-foreground">
              Los {coverage.totalShifts} turnos están operativamente cubiertos (incluyendo resoluciones manuales y day-pay).
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
          <div className="flex items-center gap-5 flex-wrap">
            <SummaryDot color="bg-emerald-500" label={`${coverage.fullyCovered} cubiertos`} />
            <SummaryDot color="bg-sky-500" label={`${coverage.coveredWithIncidents} con incidencia`} />
            <SummaryDot color="bg-amber-500" label={`${coverage.partiallyCovered} parciales`} />
            <SummaryDot color="bg-rose-500" label={`${coverage.uncovered} sin cobertura`} />
            <SummaryDot color="bg-muted-foreground/40" label={`${coverage.pendingReview} pendientes`} />
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="outline" className="text-xs tabular-nums">
                {coverage.overallPercent}% cobertura total
              </Badge>
              <button
                onClick={() => setViewAll(!viewAll)}
                className="text-xs text-primary hover:underline"
              >
                {viewAll ? "Solo con incidencias" : `Ver todos (${coverage.totalShifts})`}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {viewAll
              ? `${coverage.totalShifts} turnos totales`
              : `${issues.length} turno${issues.length !== 1 ? "s" : ""} a revisar`}
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
                <TableHead className="text-xs text-center">Cubiertos</TableHead>
                <TableHead className="text-xs text-center">No-show</TableHead>
                <TableHead className="text-xs text-center">Pend.</TableHead>
                <TableHead className="text-xs text-center">Extras</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayItems.map(item => {
                const isExpanded = expandedId === item.shiftId;
                return (
                  <RowFragment
                    key={item.shiftId}
                    item={item}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : item.shiftId)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("h-3 w-3 rounded-full", color)} />
      <span className="text-xs">{label}</span>
    </div>
  );
}

function RowFragment({
  item, isExpanded, onToggle,
}: { item: ShiftCoverageItem; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell className="text-xs w-8 px-2">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </TableCell>
        <TableCell className="text-xs font-medium">
          {item.shiftCode && (
            <span className="font-mono text-primary/60 mr-1">#{item.shiftCode.padStart(4, "0")}</span>
          )}
          {item.shiftTitle}
          {item.payType === "daily" && (
            <Badge variant="outline" className="ml-2 text-[9px] py-0 px-1.5">day pay</Badge>
          )}
        </TableCell>
        <TableCell className="text-xs capitalize">
          {format(parseISO(item.date), "EEE d MMM", { locale: es })}
        </TableCell>
        <TableCell className="text-xs text-center tabular-nums">{item.scheduledCount}</TableCell>
        <TableCell className="text-xs text-center tabular-nums text-emerald-600 font-medium">
          {item.coveredCount}
        </TableCell>
        <TableCell className="text-xs text-center tabular-nums">
          {item.noShowCount > 0
            ? <span className="text-rose-600 font-medium">{item.noShowCount}</span>
            : <span className="text-muted-foreground/40">—</span>}
        </TableCell>
        <TableCell className="text-xs text-center tabular-nums">
          {item.pendingReviewCount > 0
            ? <span className="text-amber-600 font-medium">{item.pendingReviewCount}</span>
            : <span className="text-muted-foreground/40">—</span>}
        </TableCell>
        <TableCell className="text-xs text-center tabular-nums">
          {item.extraEmployees.length > 0
            ? <span className="text-sky-600 font-medium">{item.extraEmployees.length}</span>
            : <span className="text-muted-foreground/40">—</span>}
        </TableCell>
        <TableCell>
          <Badge className={cn("border-0 text-[10px]", COVERAGE_BADGE_CLASS[item.coverageStatus])}>
            {COVERAGE_STATUS_LABELS[item.coverageStatus]}
          </Badge>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={9} className="p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Programados */}
              <div>
                <p className="font-semibold text-muted-foreground mb-1.5">
                  Programados ({item.attendanceLines.length})
                </p>
                {item.attendanceLines.length > 0 ? (
                  <div className="space-y-1">
                    {item.attendanceLines.map(line => (
                      <div key={line.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-background">
                        <span className="truncate">{line.name}</span>
                        <AttendanceBadge line={line} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground/50">Sin asignaciones</p>
                )}
              </div>

              {/* Extras */}
              <div>
                <p className="font-semibold text-muted-foreground mb-1.5">
                  Ficharon sin programar ({item.extraEmployees.length})
                </p>
                {item.extraEmployees.length > 0 ? (
                  <div className="space-y-1">
                    {item.extraEmployees.map(e => (
                      <div key={e.id} className="flex items-center justify-between px-2 py-1 rounded-lg bg-background">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {e.name}
                        </span>
                        <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-0 text-[10px]">
                          {e.hours}h · {e.source}
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
}
