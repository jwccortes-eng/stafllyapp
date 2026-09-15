/**
 * HistoricalCloseMatrix — vista READ-ONLY de continuidad y reconciliación
 * histórica de nómina. No escribe nada, no publica, no cierra.
 *
 * Reconciliación (solo lectura, sin fórmulas nuevas):
 *   STAFLY  = base_total_pay + extras aprobados − deducciones aprobadas
 *   FUENTE  = approved_total_override (cierre externo aprobado)
 *   DIFF    = FUENTE − STAFLY
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { StaflyStatusBadge, StaflyFilterBar } from "@/components/stafly-ui";
import { History, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

export type CloseStatus = "green" | "yellow" | "red" | "gray";

export interface MatrixPeriodInput {
  id: string;
  sequence_number: number | null;
  start_date: string;
  end_date: string;
  status: string;
}

export interface MatrixRow {
  period: MatrixPeriodInput;
  workers: number;
  hasSource: boolean;
  base: number;
  extras: number;
  deductions: number;
  staflyTotal: number;
  sourceTotal: number;
  difference: number;
  pendingMovements: number;
  movementOnlyWorkers: number;
  statements: number;
  published: number;
  status: CloseStatus;
  reason: string;
}

const CENT = 0.01;

/** Pura: clasifica un período sin tocar su estado de ciclo de vida. */
export function classifyClose(row: Omit<MatrixRow, "status" | "reason">): { status: CloseStatus; reason: string } {
  if (!row.hasSource && row.workers === 0 && row.extras === 0 && row.deductions === 0) {
    return { status: "gray", reason: "Período canónico sin datos de nómina ni importación." };
  }
  if (!row.hasSource) {
    return { status: "red", reason: "Faltan datos de cierre externo: solo existen ajustes sin base importada." };
  }
  if (Math.abs(row.difference) > CENT) {
    return { status: "yellow", reason: `Diferencia de ${row.difference.toFixed(2)} entre cierre externo y Stafly.` };
  }
  if (row.pendingMovements > 0) {
    return { status: "yellow", reason: `${row.pendingMovements} ajuste(s) pendientes de aprobación.` };
  }
  if (row.movementOnlyWorkers > 0) {
    return { status: "yellow", reason: `${row.movementOnlyWorkers} persona(s) con ajustes fuera del cierre importado.` };
  }
  return { status: "green", reason: "Totales comparables cuadran sin diferencias." };
}

const STATUS_META: Record<CloseStatus, { label: string; tone: "success" | "warning" | "critical" | "neutral" }> = {
  green: { label: "Reconciliado", tone: "success" },
  yellow: { label: "Revisión", tone: "warning" },
  red: { label: "Bloqueado", tone: "critical" },
  gray: { label: "Sin datos", tone: "neutral" },
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Prioridad de la cola de excepciones: bloqueados, luego mayor diferencia, luego más reciente. */
export function exceptionSort(a: MatrixRow, b: MatrixRow): number {
  const rank = (r: MatrixRow) => (r.status === "red" ? 0 : r.status === "yellow" ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const da = Math.abs(a.difference);
  const db = Math.abs(b.difference);
  if (Math.abs(da - db) > CENT) return db - da;
  return (b.period.sequence_number ?? 0) - (a.period.sequence_number ?? 0);
}

/** Etiqueta de acción para cada excepción, según la evidencia que falta. */
export function exceptionCta(row: MatrixRow): string {
  if (row.status === "red") return "Revisar cierre externo";
  if (row.status === "gray") return "Verificar sin actividad";
  return "Revisar diferencias";
}

export function exceptionPriority(row: MatrixRow): { label: string; tone: "critical" | "warning" | "neutral" } {
  if (row.status === "red") return { label: "Alta", tone: "critical" };
  if (row.status === "gray") return { label: "Baja", tone: "neutral" };
  return { label: Math.abs(row.difference) >= 500 ? "Alta" : "Media", tone: "warning" };
}

const shortRange = (start: string, end: string) => {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const f = (d: Date) => new Intl.DateTimeFormat("es-US", { month: "short", day: "numeric" }).format(d);
  return `${f(s)}–${f(e)}`;
};

interface Props {
  companyId: string | null;
  onOpenSummary?: (period: MatrixPeriodInput) => void;
}

export default function HistoricalCloseMatrix({ companyId, onOpenSummary }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: periodData } = await supabase
          .from("pay_periods")
          .select("id,sequence_number,start_date,end_date,status")
          .eq("company_id", companyId)
          .order("sequence_number", { ascending: false })
          .limit(30);
        const periods = (periodData ?? []) as MatrixPeriodInput[];
        const ids = periods.map((p) => p.id);
        if (!ids.length) {
          if (!cancelled) setRows([]);
          return;
        }
        const [bpRes, mvRes, stRes] = await Promise.all([
          supabase
            .from("period_base_pay")
            .select("period_id,employee_id,base_total_pay,approved_total_override")
            .eq("company_id", companyId)
            .in("period_id", ids),
          supabase
            .from("movements")
            .select("period_id,employee_id,total_value,approval_status,concepts(category)")
            .eq("company_id", companyId)
            .in("period_id", ids),
          supabase
            .from("pay_statements")
            .select("pay_period_id,status")
            .eq("company_id", companyId)
            .in("pay_period_id", ids),
        ]);
        if (cancelled) return;

        const built = periods.map<MatrixRow>((period) => {
          const bp = (bpRes.data ?? []).filter((r: any) => r.period_id === period.id);
          const mv = (mvRes.data ?? []).filter((r: any) => r.period_id === period.id);
          const st = (stRes.data ?? []).filter((r: any) => r.pay_period_id === period.id);

          const base = bp.reduce((s: number, r: any) => s + Number(r.base_total_pay || 0), 0);
          const sourceTotal = bp.reduce(
            (s: number, r: any) => s + Number(r.approved_total_override ?? r.base_total_pay ?? 0),
            0,
          );
          const hasSource = bp.some((r: any) => r.approved_total_override != null);
          const approved = mv.filter((r: any) => r.approval_status === "approved");
          const extras = approved
            .filter((r: any) => r.concepts?.category === "extra")
            .reduce((s: number, r: any) => s + Math.abs(Number(r.total_value || 0)), 0);
          const deductions = approved
            .filter((r: any) => r.concepts?.category !== "extra")
            .reduce((s: number, r: any) => s + Math.abs(Number(r.total_value || 0)), 0);
          const baseWorkers = new Set(bp.map((r: any) => r.employee_id));
          const movementOnlyWorkers = new Set(
            mv.map((r: any) => r.employee_id).filter((id: string) => !baseWorkers.has(id)),
          ).size;

          const staflyTotal = base + extras - deductions;
          const partial: Omit<MatrixRow, "status" | "reason"> = {
            period,
            workers: baseWorkers.size,
            hasSource,
            base,
            extras,
            deductions,
            staflyTotal,
            sourceTotal,
            difference: sourceTotal - staflyTotal,
            pendingMovements: mv.filter((r: any) => r.approval_status === "pending").length,
            movementOnlyWorkers,
            statements: st.length,
            published: st.filter((r: any) => r.status === "published").length,
          };
          return { ...partial, ...classifyClose(partial) };
        });
        setRows(built);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      green: rows.filter((r) => r.status === "green").length,
      yellow: rows.filter((r) => r.status === "yellow").length,
      red: rows.filter((r) => r.status === "red").length,
      gray: rows.filter((r) => r.status === "gray").length,
    }),
    [rows],
  );

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const exceptions = useMemo(
    () => rows.filter((r) => r.status !== "green").sort(exceptionSort),
    [rows],
  );

  return (
    <div id="historical-close-matrix" className="mb-4 scroll-mt-20">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-accent/30"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <History className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">Matriz de cierre histórico</span>
                  <StaflyStatusBadge tone="neutral">Solo lectura</StaflyStatusBadge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  Importado · reconciliado · cerrado · recibos publicados, por período.
                </p>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          <StaflyFilterBar
            options={[
              { value: "all", label: "Todos", count: counts.all },
              { value: "green", label: "Reconciliados", count: counts.green },
              { value: "yellow", label: "Revisión", count: counts.yellow },
              { value: "red", label: "Bloqueados", count: counts.red },
              { value: "gray", label: "Sin datos", count: counts.gray },
            ]}
            value={filter}
            onChange={setFilter}
          />

          {loading ? (
            <div className="rounded-xl border border-border/60 bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Cargando matriz...
            </div>
          ) : visible.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Sin períodos" description="No hay períodos para este filtro." compact />
          ) : (
            <>
              {/* Escritorio */}
              <div className="hidden md:block data-table-wrapper">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Período</TableHead>
                      <TableHead>Fechas</TableHead>
                      <TableHead>Importación</TableHead>
                      <TableHead className="text-right">Personas</TableHead>
                      <TableHead className="text-right">Total Stafly</TableHead>
                      <TableHead className="text-right">Total fuente</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                      <TableHead>Reconciliación</TableHead>
                      <TableHead>Recibos</TableHead>
                      <TableHead className="w-20">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => (
                      <TableRow key={r.period.id}>
                        <TableCell className="font-mono text-xs">#{r.period.sequence_number ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {shortRange(r.period.start_date, r.period.end_date)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.hasSource ? "Importado" : r.workers > 0 ? "Sin cierre externo" : "Sin datos"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{r.workers}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{money(r.staflyTotal)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{money(r.sourceTotal)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs font-semibold tabular-nums",
                            Math.abs(r.difference) > CENT ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {money(r.difference)}
                        </TableCell>
                        <TableCell>
                          <StaflyStatusBadge tone={STATUS_META[r.status].tone} title={r.reason}>
                            {STATUS_META[r.status].label}
                          </StaflyStatusBadge>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {r.published}/{r.workers}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => onOpenSummary?.(r.period)}>
                            {r.status === "green" || r.status === "gray" ? "Ver" : "Revisar"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Móvil */}
              <div className="space-y-2 md:hidden">
                {visible.map((r) => (
                  <div key={r.period.id} className="rounded-xl border border-border/60 bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Período #{r.period.sequence_number ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {shortRange(r.period.start_date, r.period.end_date)}
                        </p>
                      </div>
                      <StaflyStatusBadge tone={STATUS_META[r.status].tone}>
                        {STATUS_META[r.status].label}
                      </StaflyStatusBadge>
                    </div>
                    <p className="mt-2 font-mono text-base font-bold tabular-nums">{money(r.staflyTotal)}</p>
                    <p className="text-xs text-muted-foreground">
                      Diferencia {money(r.difference)} · {r.workers} personas · {r.published}/{r.workers} recibos
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => onOpenSummary?.(r.period)}
                    >
                      {r.status === "green" || r.status === "gray" ? "Ver período" : "Revisar diferencias"}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
