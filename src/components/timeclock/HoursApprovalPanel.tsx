import { useCallback, useEffect, useRef, useState } from "react";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { Loader2, CheckCircle2, Undo2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { MT, FOCUS_RING, THUMB_BAR } from "@/lib/mobile/mobile-scale";
import {
  approveHours,
  returnHoursForCorrection,
  hoursStateOf,
  realHoursOf,
  HOURS_STATE_LABEL,
  type HoursEntry,
} from "@/lib/timeclock/hours-approval";

interface Row extends HoursEntry {
  workerName: string;
}

interface HoursApprovalPanelProps {
  companyId: string;
  shiftId: string;
  onChanged?: () => void;
}

const STATE_TONE: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  needs_review: "bg-destructive/10 text-destructive border-destructive/20",
  approved: "bg-earning/10 text-earning border-earning/20",
  ready_for_payroll: "bg-earning/10 text-earning border-earning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

/**
 * P0 OX — terminal "Aprobar horas" surface, scoped to one shift.
 * Reads REAL hours from time_entries. Never writes hour values, rates,
 * overtime or payroll. Only the review status + audit trail.
 */
export function HoursApprovalPanel({ companyId, shiftId, onChanged }: HoursApprovalPanelProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    setRows(null);
    const { data, error } = await supabase
      .from("time_entries")
      .select("id, employee_id, clock_in, clock_out, break_minutes, status, employees(first_name, last_name)")
      .eq("company_id", companyId)
      .eq("shift_id", shiftId)
      .order("clock_in", { ascending: true });
    if (error) {
      // El bloque de error en pantalla ya comunica el fallo al usuario.
      console.error("[feedback:error] hours-approval-load", error);
      setLoadError(true);
      return;
    }
    setRows(
      (data ?? []).map((r: any) => ({
        id: r.id,
        employee_id: r.employee_id,
        clock_in: r.clock_in,
        clock_out: r.clock_out,
        break_minutes: r.break_minutes,
        status: r.status,
        workerName:
          [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(" ") ||
          "Worker",
      })),
    );
  }, [companyId, shiftId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // OX-1 — referencias estables para los CTA "Reintentar" de los toasts.
  const runApproveRef = useRef<(() => Promise<void>) | null>(null);
  const runReturnRef = useRef<(() => Promise<void>) | null>(null);

  const runApprove = async () => {
    if (busy || selected.size === 0 || !user) return;
    setBusy(true);
    try {
      const n = await approveHours([...selected], { companyId, userId: user.id, shiftId });
      notifySuccess({
        key: "hours-approve",
        title: "Horas aprobadas",
        fact: n === 1 ? "1 registro fue aprobado." : `${n} registros fueron aprobados.`,
        consequence: "Este turno ya puede avanzar hacia payroll.",
      });
      setSelected(new Set());
      await load();
      onChanged?.();
    } catch (e: any) {
      // Reintento seguro: la aprobación es un UPDATE por id, no crea filas.
      // La selección se conserva intacta para no perder el contexto.
      notifyError({
        key: "hours-approve",
        title: "No pudimos aprobar las horas",
        fact: "No se realizaron cambios.",
        consequence: "Tu selección sigue activa.",
        action: { label: "Reintentar", onClick: () => { void runApproveRef.current?.(); } },
        cause: e,
      });
    } finally {
      setBusy(false);
    }
  };

  const runReturn = async () => {
    if (busy || selected.size === 0 || !user) return;
    if (!reason.trim()) {
      notifyWarning({
        key: "hours-return-reason",
        title: "Falta el motivo",
        fact: "Devolver horas requiere explicar qué debe corregirse.",
        consequence: "El worker necesita saber qué revisar.",
      });
      return;
    }
    setBusy(true);
    try {
      const n = await returnHoursForCorrection([...selected], reason.trim(), {
        companyId, userId: user.id, shiftId,
      });
      notifySuccess({
        key: "hours-return",
        title: "Horas devueltas para corrección",
        fact: n === 1 ? "1 registro fue devuelto." : `${n} registros fueron devueltos.`,
        consequence: "Quedan fuera de payroll hasta que se corrijan.",
      });
      setSelected(new Set());
      setReason("");
      setShowReason(false);
      await load();
      onChanged?.();
    } catch (e: any) {
      notifyError({
        key: "hours-return",
        title: "No pudimos devolver las horas",
        fact: "No se realizaron cambios.",
        consequence: "Tu selección y el motivo escrito se conservan.",
        action: { label: "Reintentar", onClick: () => { void runReturnRef.current?.(); } },
        cause: e,
      });
    } finally {
      setBusy(false);
    }
  };

  runApproveRef.current = runApprove;
  runReturnRef.current = runReturn;

  if (loadError) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4">
        <p className="text-sm font-medium text-destructive">No pudimos cargar las horas de este turno.</p>
        <Button variant="outline" size="sm" onClick={load} className="mt-2 min-h-[44px]">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reintentar
        </Button>
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="space-y-2 p-1" aria-busy="true" aria-live="polite">
        <span className="sr-only">Cargando horas reales</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-card p-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-24 mt-2" />
            <Skeleton className="h-5 w-20 mt-2 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-4">
        <p className={cn(MT.bodyStrong, "text-foreground")}>Sin fichajes en este turno</p>
        <p className={cn(MT.body, "text-muted-foreground mt-1 leading-relaxed")}>
          Nadie registró entrada todavía. Stafly no crea horas automáticamente: cuando el equipo fiche, aparecerán aquí para aprobar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((r) => {
          const state = hoursStateOf(r);
          const hours = realHoursOf(r);
          const checked = selected.has(r.id);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                aria-pressed={checked}
                className={cn(
                  "w-full text-left flex items-start gap-3 rounded-xl border p-3 min-h-[64px] transition-colors",
                  FOCUS_RING,
                  checked ? "border-primary/50 bg-primary/[0.06]" : "border-border/50 bg-card",
                )}
              >
                <span className="flex items-center justify-center h-11 w-11 -m-1 shrink-0">
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn(MT.bodyStrong, "block truncate")}>{r.workerName}</span>
                  <span className={cn(MT.body, "block text-muted-foreground mt-0.5")}>
                    {hours === null ? "Sin salida registrada" : `${hours} horas reales`}
                  </span>
                  <span className="mt-1.5 block">
                    <StatusBadge status={state} label={HOURS_STATE_LABEL[state]} size="md" />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {showReason && (
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo de la devolución (obligatorio)"
          className={MT.body}
          rows={2}
        />
      )}

      <div className={THUMB_BAR}>
        <div className="flex items-center gap-2">
          <Button
            onClick={runApprove}
            disabled={busy || selected.size === 0}
            className={cn("min-h-[48px] flex-1", MT.bodyStrong)}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            Aprobar horas{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          <Button
            variant="outline"
            onClick={() => (showReason ? runReturn() : setShowReason(true))}
            disabled={busy || selected.size === 0}
            className="min-h-[48px] min-w-[48px] px-3"
            aria-label={showReason ? "Confirmar devolución" : "Devolver para corrección"}
            title={showReason ? "Confirmar devolución" : "Devolver para corrección"}
          >
            <Undo2 className="h-4 w-4" />
            <span className={cn(MT.body, "ml-1.5 hidden sm:inline")}>
              {showReason ? "Confirmar devolución" : "Devolver"}
            </span>
          </Button>
        </div>
        <p className={cn(MT.caption, "text-muted-foreground leading-relaxed mt-2")}>
          Payroll sigue usando únicamente las horas reales de fichaje. Aprobar no recalcula ni modifica pagos.
        </p>
      </div>
    </div>
  );
}

