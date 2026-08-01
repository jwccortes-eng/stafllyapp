import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { notifyError, notifySuccess } from "@/lib/feedback/notify";
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, Loader2, Info, Lock, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MT, FOCUS_RING } from "@/lib/mobile/mobile-scale";
import { getShiftCloseout, type ShiftCloseout } from "@/lib/shifts/closeout";
import {
  closeShift, evaluateShiftClosure, isShiftClosed, type ClosureReadiness,
} from "@/lib/shifts/shift-closure";
import { ValidationDeepLink } from "@/components/validation/ValidationDeepLink";
import { TerminalCard } from "@/components/ocs";
import { shiftClosedTerminal } from "@/lib/ox/terminal-state";

interface ShiftClosureCardProps {
  companyId: string;
  shiftId: string;
  /** True once the shift end time has passed. */
  shiftEnded: boolean;
  assignedCount: number;
  /** Called after a successful terminal close. */
  onClosed?: () => void;
  className?: string;
}

/**
 * P0 OX — the terminal "Cerrar turno" action.
 * Explains exactly what is missing, lets the operator resolve it in context,
 * and records who closed the shift and when. Never touches payroll.
 */
export function ShiftClosureCard({
  companyId, shiftId, shiftEnded, assignedCount, onClosed, className,
}: ShiftClosureCardProps) {
  const navigate = useNavigate();
  const { user, canAccessAdminForCompany } = useAuth();
  const canClose = canAccessAdminForCompany(companyId);

  const [readiness, setReadiness] = useState<ClosureReadiness | null>(null);
  const [closeout, setCloseout] = useState<ShiftCloseout | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closedByName, setClosedByName] = useState<string | null>(null);
  /** Horas realmente fichadas (clock_in + clock_out). Nunca programadas. */
  const [realHours, setRealHours] = useState(0);
  const [closedWorkers, setClosedWorkers] = useState(0);

  const load = useCallback(async () => {
    if (!companyId || !shiftId) return;
    setLoadError(false);
    setReadiness(null);
    try {
      const [teRes, co] = await Promise.all([
        supabase
          .from("time_entries")
          .select("id, clock_in, clock_out, status")
          .eq("company_id", companyId)
          .eq("shift_id", shiftId),
        getShiftCloseout(shiftId),
      ]);
      if (teRes.error) throw teRes.error;
      const entries = (teRes.data ?? []) as { clock_in: string | null; clock_out: string | null }[];
      const completed = entries.filter((e) => e.clock_in && e.clock_out);
      setClosedWorkers(completed.length);
      setRealHours(
        completed.reduce((acc, e) => {
          const ms =
            new Date(e.clock_out as string).getTime() -
            new Date(e.clock_in as string).getTime();
          return acc + (ms > 0 ? ms / 3_600_000 : 0);
        }, 0),
      );
      setCloseout(co);
      setReadiness(
        evaluateShiftClosure({
          shiftId,
          timeEntries: (teRes.data ?? []) as any,
          assignedCount,
          incidentCount: co?.incident_count ?? 0,
          closeout: co,
          shiftEnded,
        }),
      );
      if (co?.reviewed_by) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", co.reviewed_by)
          .maybeSingle();
        setClosedByName((data as any)?.full_name ?? null);
      }
    } catch (e) {
      // El bloque de error en pantalla ya es visible; el log queda para soporte.
      console.error("[feedback:error] shift-closure-load", e);
      setLoadError(true);
    }
  }, [companyId, shiftId, assignedCount, shiftEnded]);

  useEffect(() => { void load(); }, [load]);

  // OX-1 — referencia estable para el CTA "Reintentar" del toast.
  const doCloseRef = useRef<(() => Promise<void>) | null>(null);

  const doClose = async () => {
    if (submitting || !user) return;
    setSubmitting(true);
    try {
      const row = await closeShift({
        companyId, shiftId, userId: user.id,
        staffCountReported: assignedCount,
      });
      setCloseout(row);
      notifySuccess({
        key: "shift-close",
        title: "Turno cerrado",
        fact: "El cierre quedó registrado con la evidencia del turno.",
        consequence: "Este turno ya no admite cambios operativos.",
      });
      setDialogOpen(false);
      await load();
      onClosed?.();
    } catch (e: any) {
      // Reintento seguro: `closeShift` es idempotente (si ya está cerrado
      // devuelve la fila existente en vez de volver a escribir).
      notifyError({
        key: "shift-close",
        title: "No pudimos cerrar el turno",
        fact: "No se registró ningún cambio.",
        consequence: "El turno sigue abierto y conservas lo que ya revisaste.",
        action: { label: "Reintentar", onClick: () => { void doCloseRef.current?.(); } },
        cause: e,
      });
    } finally {
      setSubmitting(false);
    }
  };

  doCloseRef.current = doClose;

  if (!canClose) return null;

  if (loadError) {
    return (
      <div className={cn("rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-4", className)}>
        <p className={cn(MT.bodyStrong, "text-destructive")}>No pudimos evaluar el cierre de este turno.</p>
        <Button variant="outline" onClick={load} className={cn("mt-2 min-h-[44px]", MT.body)}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Reintentar
        </Button>
      </div>
    );
  }

  if (!readiness) {
    return (
      <div
        className={cn("rounded-2xl border border-border/50 bg-card p-4 flex items-center gap-2", className)}
        aria-busy="true"
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className={cn(MT.body, "text-muted-foreground")}>Evaluando cierre del turno…</span>
      </div>
    );
  }

  // Estado terminal: la pantalla cambia y declara qué sigue.
  if (isShiftClosed(closeout)) {
    const when = closeout?.reviewed_at ? new Date(closeout.reviewed_at) : null;
    const terminal = shiftClosedTerminal({
      workers: closedWorkers,
      realHours,
      openIncidents: closeout?.incident_count ?? 0,
    });
    return (
      <TerminalCard
        className={className}
        terminal={terminal}
        subtitle={`Cerrado por ${closedByName ?? "un administrador"}${
          when
            ? ` · ${when.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })} del ${when.toLocaleDateString("es")}`
            : ""
        }`}
        action={{
          label: "Ver en Centro de Validación",
          icon: ClipboardCheck,
          onClick: () =>
            navigate(`/app/validation-center?shiftId=${encodeURIComponent(shiftId)}`),
        }}
      />
    );
  }

  return (
    <>
      <div className={cn("rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 space-y-3", className)}>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h2 className={MT.title}>Cierre del turno</h2>
        </div>

        <ul className="space-y-2">
          {readiness.items.map((item) => {
            const Icon = item.kind === "blocker" ? AlertTriangle : item.kind === "warning" ? Info : CheckCircle2;
            const tone =
              item.kind === "blocker" ? "text-destructive"
                : item.kind === "warning" ? "text-warning"
                  : "text-earning";
            return (
              <li key={item.id} className="flex items-start gap-2">
                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tone)} />
                <div className="min-w-0 flex-1">
                  <p className={cn(MT.bodyStrong, "leading-snug")}>{item.label}</p>
                  {item.detail && (
                    <p className={cn(MT.caption, "text-muted-foreground leading-snug mt-0.5")}>{item.detail}</p>
                  )}
                  {item.action && (
                    <Link
                      to={item.action.to}
                      className={cn(
                        "inline-flex items-center min-h-[44px] font-semibold text-primary rounded-lg",
                        MT.body,
                        FOCUS_RING,
                      )}
                    >
                      {item.action.label} →
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <Button
          onClick={() => setDialogOpen(true)}
          disabled={submitting || !readiness.canClose && readiness.blockers.some(b => b.id === "not-ended")}
          className={cn("w-full min-h-[48px]", MT.bodyStrong)}
        >
          {readiness.blockers.some(b => b.id === "not-ended") && <Lock className="h-4 w-4 mr-1.5" />}
          {readiness.ctaLabel}
        </Button>
        <p className={cn(MT.caption, "text-muted-foreground leading-relaxed")}>
          Cerrar el turno no calcula ni modifica payroll. Payroll sigue usando las horas reales de fichaje.
        </p>
      </div>


      <Dialog open={dialogOpen} onOpenChange={(o) => !submitting && setDialogOpen(o)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{readiness.canClose ? "Cerrar turno" : "Revisar y cerrar turno"}</DialogTitle>
            <DialogDescription>
              {readiness.canClose
                ? "Se registrará quién cerró el turno y a qué hora."
                : "Resuelve estos pendientes desde aquí antes de cerrar."}
            </DialogDescription>
          </DialogHeader>

          {readiness.blockers.length > 0 && (
            <div className="rounded-xl border border-warning/25 bg-warning/[0.05] p-3 space-y-1.5">
              {readiness.blockers.map((b) => (
                <div key={b.id} className="text-xs">
                  <span className="font-semibold">{b.label}</span>
                  {b.detail && <span className="text-muted-foreground"> — {b.detail}</span>}
                </div>
              ))}
            </div>
          )}

          {readiness.pendingHours > 0 || readiness.openClockOuts > 0 ? (
            <div>
              <p className="text-xs font-semibold mb-2">Horas reales de este turno</p>
              <ValidationDeepLink
                shiftId={shiftId}
                summary="Horas pendientes de aprobar"
                progress={`${readiness.pendingHours} por aprobar · ${readiness.openClockOuts} sin salida`}
                label="Aprobar en el Centro de Validación"
              />
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              onClick={doClose}
              disabled={submitting || !readiness.canClose}
              className="min-h-[44px] flex-1"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {readiness.canClose ? "Confirmar cierre" : "Resuelve los pendientes para cerrar"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
              className="min-h-[44px]"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
