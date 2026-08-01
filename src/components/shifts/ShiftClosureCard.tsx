import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
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
import { getShiftCloseout, type ShiftCloseout } from "@/lib/shifts/closeout";
import {
  closeShift, evaluateShiftClosure, isShiftClosed, type ClosureReadiness,
} from "@/lib/shifts/shift-closure";
import { HoursApprovalPanel } from "@/components/timeclock/HoursApprovalPanel";

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
  const { user, canAccessAdminForCompany } = useAuth();
  const canClose = canAccessAdminForCompany(companyId);

  const [readiness, setReadiness] = useState<ClosureReadiness | null>(null);
  const [closeout, setCloseout] = useState<ShiftCloseout | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closedByName, setClosedByName] = useState<string | null>(null);

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
      console.warn("[shift-closure] load failed", e);
      setLoadError(true);
    }
  }, [companyId, shiftId, assignedCount, shiftEnded]);

  useEffect(() => { void load(); }, [load]);

  const doClose = async () => {
    if (submitting || !user) return;
    setSubmitting(true);
    try {
      const row = await closeShift({
        companyId, shiftId, userId: user.id,
        staffCountReported: assignedCount,
      });
      setCloseout(row);
      toast.success("Turno cerrado correctamente.");
      setDialogOpen(false);
      await load();
      onClosed?.();
    } catch (e: any) {
      toast.error("No pudimos cerrar el turno. Revisa los pendientes e intenta de nuevo.");
      console.warn("[shift-closure] close failed", e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canClose) return null;

  if (loadError) {
    return (
      <div className={cn("rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-4", className)}>
        <p className="text-sm font-medium text-destructive">No pudimos evaluar el cierre de este turno.</p>
        <Button variant="outline" size="sm" onClick={load} className="mt-2 min-h-[44px]">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reintentar
        </Button>
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className={cn("rounded-2xl border border-border/50 bg-card p-4 flex items-center gap-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Evaluando cierre del turno…</span>
      </div>
    );
  }

  // Terminal state
  if (isShiftClosed(closeout)) {
    const when = closeout?.reviewed_at ? new Date(closeout.reviewed_at) : null;
    return (
      <div className={cn("rounded-2xl border border-earning/25 bg-earning/[0.05] p-4", className)}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-earning" />
          <h2 className="text-sm font-bold">Turno cerrado</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Turno cerrado por {closedByName ?? "un administrador"}
          {when ? ` a las ${when.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })} del ${when.toLocaleDateString("es")}` : ""}.
        </p>
        <Link
          to={`/app/payroll-review-queue?shiftId=${encodeURIComponent(shiftId)}`}
          className="inline-flex items-center gap-1.5 mt-2.5 min-h-[44px] text-xs font-semibold text-primary"
        >
          <ClipboardCheck className="h-3.5 w-3.5" /> Ver en Centro de Validación
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={cn("rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 space-y-3", className)}>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold">Cierre del turno</h2>
        </div>

        <ul className="space-y-1.5">
          {readiness.items.map((item) => {
            const Icon = item.kind === "blocker" ? AlertTriangle : item.kind === "warning" ? Info : CheckCircle2;
            const tone =
              item.kind === "blocker" ? "text-destructive"
                : item.kind === "warning" ? "text-warning"
                  : "text-earning";
            return (
              <li key={item.id} className="flex items-start gap-2">
                <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", tone)} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-snug">{item.label}</p>
                  {item.detail && (
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{item.detail}</p>
                  )}
                  {item.action && (
                    <Link
                      to={item.action.to}
                      className="inline-flex items-center min-h-[44px] text-[11px] font-semibold text-primary"
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
          className="w-full min-h-[44px]"
        >
          {readiness.blockers.some(b => b.id === "not-ended") && <Lock className="h-4 w-4 mr-1.5" />}
          {readiness.ctaLabel}
        </Button>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
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
              <HoursApprovalPanel companyId={companyId} shiftId={shiftId} onChanged={load} />
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
