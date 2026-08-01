/**
 * P0 — "Retirar del turno" (móvil y desktop comparten este diálogo).
 *
 * Contrato único: toda la decisión la toma la RPC `remove_worker_from_shift`.
 * Aquí sólo se muestra la consecuencia, se pide el motivo y se evita el
 * doble envío. Nunca hay falso éxito: si el servidor dice que no, se explica.
 */

import { useEffect, useRef, useState } from "react";
import { UserMinus, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import {
  removeWorkerFromShift, removalBlockedCopy, removalSuccessCopy,
} from "@/lib/shifts/remove-worker";
import { MT, TAP } from "@/lib/mobile/mobile-scale";
import { cn } from "@/lib/utils";

export interface RemoveWorkerFromShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string | null;
  workerName: string;
  /** "Quality Staff · QK-001573" */
  contextLine?: string | null;
  /** Estado actual legible: "Asignada, aún no confirmó". */
  statusLine?: string | null;
  /** true cuando la superficie ya sabe que hay fichajes: se avisa antes. */
  hasRealActivity?: boolean;
  source?: string;
  onRemoved?: () => void;
}

export function RemoveWorkerFromShiftDialog({
  open, onOpenChange, assignmentId, workerName, contextLine, statusLine,
  hasRealActivity = false, source = "shift_team", onRemoved,
}: RemoveWorkerFromShiftDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lockRef = useRef(false);

  useEffect(() => {
    if (open) { setReason(""); lockRef.current = false; }
  }, [open, assignmentId]);

  const submit = async () => {
    if (!assignmentId || lockRef.current) return;
    lockRef.current = true;
    setSubmitting(true);
    try {
      const result = await removeWorkerFromShift({ assignmentId, reason, source });
      if (!result.removed) {
        const copy = removalBlockedCopy(result, workerName);
        notifyWarning({ ...copy, key: `remove-worker-${assignmentId}` });
        onOpenChange(false);
        onRemoved?.();
        return;
      }
      if (result.reason === "already_removed") {
        notifyWarning({
          title: "Ya estaba retirada",
          fact: `${workerName} no forma parte de este turno.`,
          consequence: "No se duplicó ninguna notificación ni auditoría.",
          key: `remove-worker-${assignmentId}`,
        });
      } else {
        notifySuccess({ ...removalSuccessCopy(result, workerName), key: `remove-worker-${assignmentId}` });
      }
      onOpenChange(false);
      onRemoved?.();
    } catch (e) {
      notifyError({
        title: "No se pudo retirar a la persona",
        fact: "El turno quedó exactamente como estaba.",
        consequence: "El cupo sigue ocupado y nadie fue notificado.",
        action: { label: "Reintentar", onClick: () => { lockRef.current = false; void submit(); } },
        key: `remove-worker-${assignmentId}`,
        cause: e,
      });
    } finally {
      setSubmitting(false);
      lockRef.current = false;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <AlertDialogContent className="max-w-[92vw] sm:max-w-md rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <UserMinus className="h-4 w-4 text-destructive" aria-hidden />
            Retirar a {workerName}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-1">
            {contextLine ? <span className="block">{contextLine}</span> : null}
            {hasRealActivity ? (
              <>
                <span className="block font-medium text-foreground">
                  Esta persona ya tiene actividad registrada.
                </span>
                <span className="block">
                  Gestiona su salida o reemplazo sin alterar las horas reales.
                </span>
              </>
            ) : (
              <>
                {statusLine ? <span className="block">{statusLine}</span> : null}
                <span className="block">La posición volverá a estar disponible.</span>
                <span className="block">
                  Se conservan su historial, mensajes, evidencia y horas reales.
                </span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!hasRealActivity && (
          <div className="space-y-1.5">
            <Label htmlFor="remove-worker-reason" className={cn(MT.caption, "font-semibold uppercase tracking-wider text-muted-foreground")}>
              Motivo (recomendado)
            </Label>
            <Textarea
              id="remove-worker-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cambio operativo, no disponible, reasignación…"
              rows={3}
              maxLength={500}
              disabled={submitting}
              className="text-sm"
            />
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className={cn(TAP, "rounded-full")} disabled={submitting}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void submit(); }}
            disabled={submitting || !assignmentId}
            className={cn(TAP, "rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Retirar del turno"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
