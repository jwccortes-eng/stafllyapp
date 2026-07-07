/**
 * RootCauseExplorer — READ-ONLY diagnostic drawer for /app/payroll-native-dry-run.
 *
 * Given a worker + period + already-loaded `time_entries` (native, RLS-scoped),
 * renders:
 *   - Compact header with reference (Connecteam / reconciliación) vs native hours,
 *     delta, status and reasons.
 *   - A per-day timeline of the worker's native time_entries with visual flags:
 *     abierta / sin shift / overlap / anormal / cruza medianoche.
 *   - A "Causa probable" block built from simple heuristics.
 *   - Safe navigation CTAs into normal admin flows (Time Clock, Attendance,
 *     Shifts, Payroll Review Queue). Never a fix/repair/approve/write action.
 *
 * HARD RULES:
 *   - No writes anywhere. No mutations. No RPC. No storage. No email.
 *   - Never edits, closes, or corrects time_entries, shift_assignments,
 *     scheduled_shifts, period_base_pay, pay_periods, reconciliation_*,
 *     payroll_adjustments, movements, compensation_profiles or rates.
 *   - No money, no rates, no payroll calculation.
 *   - Corrections must be done from the normal admin flows — this drawer
 *     only diagnoses.
 */
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldAlert, ExternalLink, Info, Clock, AlertTriangle, ClipboardList, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildAttendanceUrl,
  buildChecklist,
  buildReviewQueueUrl,
  buildShiftsUrl,
  buildTimeClockUrl,
  bestReviewPoint,
  deriveRootCauseAnchors,
  detectCauses,
  HIGHLIGHTABLE_REASONS,
  type CauseKey,
  type ChecklistItem,
  type Severity,
} from "@/utils/payrollDryRunReviewRouter";

export interface RCEEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number | null;
}

export interface RootCauseExplorerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker: { id: string; name: string } | null;
  period: {
    id: string;
    start_date: string;
    end_date: string;
    sequence_number: number | null;
  } | null;
  referenceHours: number | null;
  nativeHours: number | null;
  deltaHours: number | null;
  status: "match" | "minor" | "critical" | "not_comparable" | null;
  reasons: string[];
  entries: RCEEntry[]; // ALL native entries for the period; will filter to worker
  /** Optional dominant reason key to highlight (from BatchTrendPanel deep-link). Ignored if unknown. */
  focusReason?: string | null;
}

const ABNORMAL_MAX_HOURS = 16;

interface EntryFlags {
  open: boolean;
  noShift: boolean;
  overlap: boolean;
  abnormal: boolean;
  midnight: boolean;
  durationHours: number | null;
}

interface EnrichedEntry extends RCEEntry {
  flags: EntryFlags;
  day: string;
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function RootCauseExplorer(props: RootCauseExplorerProps) {
  const { open, onOpenChange, worker, period, referenceHours, nativeHours, deltaHours, status, reasons, entries, focusReason } = props;

  const workerEntries = useMemo<EnrichedEntry[]>(() => {
    if (!worker) return [];
    const mine = entries
      .filter((e) => e.employee_id === worker.id)
      .slice()
      .sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());
    let lastEnd = -Infinity;
    return mine.map((e) => {
      const start = new Date(e.clock_in).getTime();
      const end = e.clock_out ? new Date(e.clock_out).getTime() : null;
      let durationHours: number | null = null;
      let abnormal = false;
      let midnight = false;
      if (end != null) {
        const rawMin = Math.round((end - start) / 60000) - (e.break_minutes ?? 0);
        durationHours = rawMin / 60;
        abnormal = durationHours <= 0 || durationHours > ABNORMAL_MAX_HOURS;
        midnight = localDay(e.clock_in) !== localDay(e.clock_out as string);
      }
      const overlap = end != null && start < lastEnd;
      if (end != null && end > lastEnd) lastEnd = end;
      return {
        ...e,
        day: localDay(e.clock_in),
        flags: {
          open: !e.clock_out,
          noShift: !e.shift_id,
          overlap,
          abnormal,
          midnight,
          durationHours,
        },
      };
    });
  }, [entries, worker]);

  const byDay = useMemo(() => {
    const map = new Map<string, EnrichedEntry[]>();
    for (const e of workerEntries) {
      const arr = map.get(e.day) ?? [];
      arr.push(e);
      map.set(e.day, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [workerEntries]);

  const counts = useMemo(() => {
    let open = 0, noShift = 0, overlap = 0, abnormal = 0, midnight = 0, closed = 0;
    for (const e of workerEntries) {
      if (e.flags.open) open += 1; else closed += 1;
      if (e.flags.noShift) noShift += 1;
      if (e.flags.overlap) overlap += 1;
      if (e.flags.abnormal) abnormal += 1;
      if (e.flags.midnight) midnight += 1;
    }
    return { open, noShift, overlap, abnormal, midnight, closed, total: workerEntries.length };
  }, [workerEntries]);

  const probableCauses = useMemo<string[]>(() => {
    const out: string[] = [];
    if (referenceHours == null && nativeHours == null) {
      out.push("No hay ni fila de reconciliación ni fichajes nativos cerrados para este worker en el período.");
      return out;
    }
    if (referenceHours == null) {
      out.push("Falta la referencia consolidada de reconciliación (period_base_pay) para este worker.");
    }
    if (nativeHours == null || counts.total === 0) {
      out.push("No hay fichajes nativos cerrados para este período; nada que comparar del lado nativo.");
    }
    if (counts.open > 0) {
      out.push(`Hay ${counts.open} fichaje${counts.open === 1 ? "" : "s"} abierto${counts.open === 1 ? "" : "s"}: excluidos del cálculo nativo y no aparecen en las horas nativas.`);
    }
    if (counts.overlap > 0) {
      out.push(`Se detectan ${counts.overlap} entrada${counts.overlap === 1 ? "" : "s"} solapada${counts.overlap === 1 ? "" : "s"}: pueden inflar las horas nativas si no se resuelven en Time Clock.`);
    }
    if (counts.abnormal > 0) {
      out.push(`Hay ${counts.abnormal} entrada${counts.abnormal === 1 ? "" : "s"} con duración anormal (≤ 0h o > ${ABNORMAL_MAX_HOURS}h): revisar clock out o posibles duplicados.`);
    }
    if (counts.midnight > 0) {
      out.push(`Hay ${counts.midnight} entrada${counts.midnight === 1 ? "" : "s"} que cruza${counts.midnight === 1 ? "" : "n"} medianoche: revisar corte diario/período.`);
    }
    if (counts.noShift > 0 && counts.noShift >= Math.max(1, Math.floor(counts.total / 2))) {
      out.push(`Muchas entradas (${counts.noShift} de ${counts.total}) no tienen shift link: revisar Time Clock / Attendance para alinear shift↔entry.`);
    } else if (counts.noShift > 0) {
      out.push(`${counts.noShift} entrada${counts.noShift === 1 ? "" : "s"} sin shift link: revisar Time Clock / Attendance para diagnosticar.`);
    }
    if (out.length === 0 && deltaHours != null && Math.abs(deltaHours) >= 2) {
      out.push("Delta crítico sin señal obvia en fichajes nativos: revisar si la reconciliación externa incluye ajustes que aún no llegan a Stafly.");
    }
    if (out.length === 0) {
      out.push("Sin causas evidentes desde este dry-run. Comparación dentro de umbrales operativos.");
    }
    return out;
  }, [counts, referenceHours, nativeHours, deltaHours]);

  const anchorDate = period?.start_date ?? "";

  const causes = useMemo<CauseKey[]>(
    () => detectCauses({ counts, referenceHours, nativeHours, deltaHours }),
    [counts, referenceHours, nativeHours, deltaHours],
  );

  // Per-cause anchors (day / entry / shift) derived from the already-loaded entries.
  const anchors = useMemo(
    () =>
      deriveRootCauseAnchors(
        workerEntries.map((e) => ({
          id: e.id,
          clock_in: e.clock_in,
          clock_out: e.clock_out,
          shift_id: e.shift_id,
          day: e.day,
          durationHours: e.flags.durationHours,
          flags: {
            open: e.flags.open,
            noShift: e.flags.noShift,
            overlap: e.flags.overlap,
            abnormal: e.flags.abnormal,
            midnight: e.flags.midnight,
          },
        })),
      ),
    [workerEntries],
  );

  const routerCtx = useMemo(
    () => ({
      employeeId: worker?.id ?? null,
      periodId: period?.id ?? null,
      anchorDate: anchorDate || null,
      problematicDate: null,
      timeEntryId: null,
      shiftId: null,
    }),
    [worker?.id, period?.id, anchorDate],
  );

  const checklist = useMemo<ChecklistItem[]>(
    () =>
      buildChecklist(
        { counts, referenceHours, nativeHours, deltaHours },
        routerCtx,
        anchors,
      ),
    [counts, referenceHours, nativeHours, deltaHours, routerCtx, anchors],
  );

  const bestPoint = useMemo(
    () => bestReviewPoint(causes, anchors, routerCtx),
    [causes, anchors, routerCtx],
  );

  const highlightKey: CauseKey | null =
    focusReason && HIGHLIGHTABLE_REASONS.has(focusReason as CauseKey)
      ? (focusReason as CauseKey)
      : null;

  /** Day (YYYY-MM-DD) to visually highlight in the timeline based on focusReason. */
  const highlightDay: string | null =
    (highlightKey && anchors[highlightKey]?.date) ?? null;

  // When the drawer opens with a focus reason that has a day anchor, scroll to it.
  useEffect(() => {
    if (!open || !highlightDay) return;
    const t = setTimeout(() => {
      const el = typeof document !== "undefined"
        ? document.getElementById(`rce-day-${highlightDay}`)
        : null;
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(t);
  }, [open, highlightDay]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <SheetTitle className="text-base">
            Root-cause explorer
            {worker && <span className="text-muted-foreground font-normal"> · {worker.name}</span>}
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            {period ? (
              <>
                Período{" "}
                {period.sequence_number ? `#${period.sequence_number} · ` : ""}
                {period.start_date} → {period.end_date}
              </>
            ) : "—"}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-4">
            {/* Compact guardrail */}
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-destructive">
                  Root-cause read-only.
                </span>{" "}
                No corrige fichajes, no ajusta payroll y no escribe cambios. Las
                correcciones deben realizarse desde los flujos normales de
                administración.
              </p>
            </div>

            {/* Reference vs native */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Horas ref." value={referenceHours != null ? referenceHours.toFixed(2) : "—"} />
              <Metric label="Horas nativas" value={nativeHours != null ? nativeHours.toFixed(2) : "—"} />
              <Metric
                label="Δ horas"
                value={deltaHours != null ? `${deltaHours >= 0 ? "+" : ""}${deltaHours.toFixed(2)}` : "—"}
                tone={
                  deltaHours == null ? "muted"
                  : Math.abs(deltaHours) >= 2 ? "danger"
                  : Math.abs(deltaHours) >= 0.5 ? "warn"
                  : "ok"
                }
              />
              <Metric
                label="Estado"
                value={
                  status === "critical" ? "Crítico"
                  : status === "minor" ? "Menor"
                  : status === "not_comparable" ? "No cmp."
                  : status === "match" ? "Match"
                  : "—"
                }
                tone={
                  status === "critical" ? "danger"
                  : status === "minor" ? "warn"
                  : status === "match" ? "ok"
                  : "muted"
                }
              />
            </div>

            {reasons.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {reasons.map((r) => (
                  <Badge key={r} variant="outline" className="text-[9px]">
                    {r}
                  </Badge>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Referencia: <code>period_base_pay.total_work_hours</code>
              {" · "}Nativo: <code>time_entries</code> cerradas.
              {" "}No usa <code>scheduled_shifts</code> como fuente de pago.
            </p>

            {/* Probable cause */}
            <section className="space-y-1.5">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Causa probable
              </div>
              <ul className="space-y-1">
                {probableCauses.map((c, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground leading-relaxed pl-3 border-l-2 border-border/60">
                    {c}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground/80 italic">
                Diagnóstico explicativo. No corrige, no ajusta y no aprueba.
              </p>
            </section>

            {/* Timeline */}
            <section className="space-y-2">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Timeline · time_entries por día
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({counts.total} total · {counts.closed} cerradas · {counts.open} abiertas)
                </span>
              </div>
              {byDay.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-3">
                  Sin fichajes nativos para este worker en el período.
                </p>
              ) : (
                <div className="space-y-2">
                  {byDay.map(([day, list]) => {
                    const isHighlighted = highlightDay === day;
                    return (
                    <div
                      key={day}
                      id={`rce-day-${day}`}
                      className={cn(
                        "rounded-lg border bg-card overflow-hidden transition-colors",
                        isHighlighted
                          ? "border-primary/60 ring-1 ring-primary/40"
                          : "border-border/60",
                      )}
                    >
                      <div className={cn(
                        "px-3 py-1.5 text-[11px] font-semibold flex items-center justify-between",
                        isHighlighted ? "bg-primary/10" : "bg-muted/40",
                      )}>
                        <span className="flex items-center gap-1.5">
                          {day}
                          {isHighlighted && (
                            <Badge variant="outline" className="text-[9px] border-primary/50 text-primary bg-primary/5">
                              foco
                            </Badge>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {list.length} entrada{list.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <ul className="divide-y divide-border/50">
                        {list.map((e) => (
                          <li key={e.id} className="px-3 py-2 text-[11px] space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="tabular-nums font-medium">
                                {localTime(e.clock_in)} → {e.clock_out ? localTime(e.clock_out) : <span className="text-amber-700">abierta</span>}
                              </div>
                              <div className="tabular-nums text-muted-foreground">
                                {e.flags.durationHours != null ? `${e.flags.durationHours.toFixed(2)}h` : "—"}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 items-center">
                              <code className="text-[9px] text-muted-foreground">
                                te:{e.id.slice(0, 8)}
                              </code>
                              {e.shift_id ? (
                                <code className="text-[9px] text-muted-foreground">
                                  shift:{e.shift_id.slice(0, 8)}
                                </code>
                              ) : (
                                <Badge variant="outline" className="text-[9px] border-amber-400/40 text-amber-800 dark:text-amber-200 bg-amber-500/5">
                                  sin shift
                                </Badge>
                              )}
                              {e.flags.open && (
                                <Badge variant="outline" className="text-[9px] border-amber-400/40 text-amber-800 dark:text-amber-200 bg-amber-500/5">
                                  abierta
                                </Badge>
                              )}
                              {e.flags.overlap && (
                                <Badge variant="outline" className="text-[9px] border-destructive/40 text-destructive bg-destructive/5">
                                  overlap
                                </Badge>
                              )}
                              {e.flags.abnormal && (
                                <Badge variant="outline" className="text-[9px] border-destructive/40 text-destructive bg-destructive/5">
                                  anormal
                                </Badge>
                              )}
                              {e.flags.midnight && (
                                <Badge variant="outline" className="text-[9px]">
                                  medianoche
                                </Badge>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                Vista de solo lectura. No cierra, no modifica y no reasigna entries.
              </p>
            </section>

            {/* Best review point */}
            {bestPoint && (
              <section className="space-y-1.5">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-primary" />
                  Mejor punto de revisión
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold">{bestPoint.label}</div>
                      <div className="text-[11px] text-muted-foreground">{bestPoint.hint}</div>
                    </div>
                    <Button asChild variant="outline" size="sm" className="h-7 text-[11px] gap-1.5 shrink-0">
                      <Link to={bestPoint.ctaHref}>
                        <ExternalLink className="h-3 w-3" />
                        {bestPoint.ctaLabel}
                      </Link>
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/80 italic">
                  Recomendación visual. No ejecuta acción automática.
                </p>
              </section>
            )}

            {/* Manual review checklist */}
            <section className="space-y-2">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                Checklist de revisión manual
              </div>
              <p className="text-[10px] text-muted-foreground">
                Checklist manual. Las correcciones deben realizarse desde los flujos
                normales de administración. Esta vista no marca completado, no guarda
                notas y no corrige datos.
              </p>
              {checklist.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-2">
                  Sin acciones sugeridas: no se detectan causas operativas evidentes en este dry-run.
                </p>
              ) : (
                <ul className="space-y-2">
                  {checklist.map((item) => (
                    <li
                      key={item.key}
                      className={cn(
                        "rounded-lg border bg-card px-3 py-2 space-y-1.5",
                        highlightKey === item.key
                          ? "border-primary/60 ring-1 ring-primary/40"
                          : "border-border/60",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[12px] font-semibold leading-tight">{item.title}</div>
                        <SeverityBadge severity={item.severity} />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {item.reason}
                      </p>
                      {item.evidence && (
                        <div className="rounded-md bg-muted/40 border border-border/50 px-2 py-1 text-[10.5px] text-foreground/80 flex items-start gap-1.5">
                          <Info className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                          <span>{item.evidence}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Button asChild variant="outline" size="sm" className="h-7 text-[11px] gap-1.5">
                          <Link to={item.ctaHref}>
                            <ExternalLink className="h-3 w-3" />
                            {item.ctaLabel}
                          </Link>
                        </Button>
                        {item.anchorDate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] gap-1.5 text-muted-foreground"
                            onClick={() => {
                              const el = typeof document !== "undefined"
                                ? document.getElementById(`rce-day-${item.anchorDate}`)
                                : null;
                              el?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                          >
                            Ver día
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-muted-foreground italic">
                Resolver desde el flujo normal. Esta vista no corrige datos.
              </p>
            </section>

            {/* Safe generic CTAs (always available) */}
            <section className="space-y-2">
              <div className="text-xs font-semibold">Revisar en flujos normales</div>
              <p className="text-[10px] text-muted-foreground">
                Solo navegación. Ninguna acción de corrección, ajuste, aprobación,
                recálculo o exportación de payroll ocurre desde este explorer.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <CTA
                  to={buildTimeClockUrl({ date: anchorDate || null })}
                  label="Abrir Time Clock"
                  hint={anchorDate ? `Contexto: ${anchorDate}` : "Contexto: hoy"}
                />
                <CTA
                  to={buildAttendanceUrl({ date: anchorDate || null, employeeId: worker?.id ?? null })}
                  label="Abrir Attendance"
                  hint={anchorDate ? `Contexto: ${anchorDate}` : "Contexto: hoy"}
                />
                <CTA
                  to={buildShiftsUrl({ date: anchorDate || null })}
                  label="Abrir Shifts"
                  hint={anchorDate ? `Contexto: ${anchorDate}` : "Contexto: hoy"}
                />
                <CTA
                  to={buildReviewQueueUrl({ periodId: period?.id ?? null, employeeId: worker?.id ?? null })}
                  label="Abrir Payroll Review Queue"
                  hint="Cola de revisión existente"
                />
              </div>
            </section>

            <div className="pt-2 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => onOpenChange(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value, tone = "muted" }: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "text-amber-700 dark:text-amber-200"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-card px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight">
        {label}
      </div>
      <div className={cn("text-sm font-bold tabular-nums leading-tight", toneCls)}>
        {value}
      </div>
    </div>
  );
}

function CTA({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="h-auto py-2 justify-start text-left">
      <Link to={to} className="flex items-start gap-2 w-full">
        <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <span className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium truncate">{label}</span>
          <span className="text-[10px] text-muted-foreground truncate">{hint}</span>
        </span>
      </Link>
    </Button>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const cls =
    severity === "alta"
      ? "border-destructive/40 text-destructive bg-destructive/5"
      : severity === "media"
      ? "border-amber-400/40 text-amber-800 dark:text-amber-200 bg-amber-500/5"
      : "border-border/60 text-muted-foreground bg-muted/40";
  const label = severity === "alta" ? "Alta" : severity === "media" ? "Media" : "Baja";
  return (
    <Badge variant="outline" className={cn("text-[9px] shrink-0", cls)}>
      {label}
    </Badge>
  );
}
