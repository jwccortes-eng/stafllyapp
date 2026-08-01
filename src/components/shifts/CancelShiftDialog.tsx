/**
 * P0 — "Cancelar turno" (móvil y desktop comparten este diálogo).
 *
 * La decisión la toma siempre la RPC `cancel_shift`. Aquí sólo se muestra
 * el resumen operativo, se exige motivo, se pide confirmación reforzada
 * cuando el servidor lo indica y se verifica el resultado releyendo el turno.
 * Nunca hay falso éxito por HTTP 200.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarX2, Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import {
  cancelShift, cancelBlockedCopy, cancelSuccessCopy,
  needsReinforcedConfirmation, verifyShiftCancelled,
} from "@/lib/shifts/cancel-shift";
import { MT, TAP } from "@/lib/mobile/mobile-scale";
import { cn } from "@/lib/utils";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

export interface CancelShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: string | null;
  companyId?: string | null;
  /** Referencia operativa canónica: "QK-001573". */
  shiftRef: string;
  /** "Quality Staff" */
  companyName?: string | null;
  /** "Waiters Service · Prueba 2" */
  clientLine?: string | null;
  /** "3 ago · 12:00 – 23:30" */
  whenLine?: string | null;
  requiredWorkers?: number | null;
  assignedActive?: number | null;
  confirmed?: number | null;
  /** Estado actual, para detectar conflictos de concurrencia. */
  expectedStatus?: string | null;
  source?: string;
  onCancelled?: () => void;
}

export function CancelShiftDialog({
  open, onOpenChange, shiftId, companyId, shiftRef, companyName, clientLine,
  whenLine, requiredWorkers, assignedActive, confirmed, expectedStatus,
  source = "shift_detail", onCancelled,
}: CancelShiftDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const lockRef = useRef(false);
  const idemRef = useRef<string>("");

  useEffect(() => {
    if (open) {
      setReason(""); setAcknowledge(false); setWarning(null);
      lockRef.current = false;
      idemRef.current = `cancel-${shiftId ?? "none"}-${Date.now()}`;
    }
  }, [open, shiftId]);

  const reasonValid = reason.trim().length >= 3;

  const submit = async () => {
    if (!shiftId || lockRef.current || !reasonValid) return;
    lockRef.current = true;
    setSubmitting(true);
    try {
      const result = await cancelShift({
        shiftId, companyId, reason,
        expectedStatus: expectedStatus ?? null,
        acknowledgeActivity: acknowledge,
        idempotencyKey: idemRef.current,
        source,
      });

      if (!result.cancelled) {
        const copy = cancelBlockedCopy(result, shiftRef);
        if (needsReinforcedConfirmation(result.reason)) {
          // El turno NO cambió: pedimos confirmación reforzada en el mismo diálogo.
          setAcknowledge(true);
          setWarning(`${copy.title}. ${copy.consequence}`);
          notifyWarning({ ...copy, key: `cancel-shift-${shiftId}` });
          return;
        }
        notifyWarning({ ...copy, key: `cancel-shift-${shiftId}` });
        onOpenChange(false);
        onCancelled?.();
        return;
      }

      // FASE 8 — verificación real antes de declarar éxito.
      const check = await verifyShiftCancelled(shiftId);
      if (check.status !== "cancelled") {
        notifyError({
          title: "No pudimos cancelar el turno",
          fact: "No se guardaron cambios.",
          consequence: "El turno quedó exactamente como estaba.",
          action: { label: "Reintentar", onClick: () => { lockRef.current = false; void submit(); } },
          key: `cancel-shift-${shiftId}`,
        });
        return;
      }

      notifySuccess({ ...cancelSuccessCopy(result, shiftRef), key: `cancel-shift-${shiftId}` });
      onOpenChange(false);
      onCancelled?.();
    } catch (e) {
      notifyError({
        title: "No pudimos cancelar el turno",
        fact: "No se guardaron cambios.",
        consequence: "El turno quedó exactamente como estaba y nadie fue notificado.",
        action: { label: "Reintentar", onClick: () => { lockRef.current = false; void submit(); } },
        key: `cancel-shift-${shiftId}`,
        cause: e,
      });
    } finally {
      setSubmitting(false);
      lockRef.current = false;
    }
  };

  const people = [
    requiredWorkers != null ? `${requiredWorkers} ${requiredWorkers === 1 ? "posición" : "posiciones"}` : null,
    assignedActive != null ? `${assignedActive} ${assignedActive === 1 ? "persona asignada" : "personas asignadas"}` : null,
    confirmed != null ? `${confirmed} ${confirmed === 1 ? "confirmó" : "confirmaron"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <AlertDialogContent className="max-w-[92vw] sm:max-w-md rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <CalendarX2 className="h-4 w-4 text-destructive" aria-hidden />
            Cancelar {shiftRef}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-1">
            {companyName ? <span className="block font-medium text-foreground">{companyName}</span> : null}
            {clientLine ? <span className="block">{clientLine}</span> : null}
            {whenLine ? <span className="block">{whenLine}</span> : null}
            {people ? <span className="block">{people}</span> : null}
            <span className="block pt-1">
              Esta acción cancelará {ADMIN_LEX.theEntity} y notificará al equipo.
            </span>
            <span className="block">
              La historia y cualquier hora real se conservarán.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {warning && (
          <div className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-warning-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" aria-hidden />
            <p className={cn(MT.caption, "leading-snug")}>{warning}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label
            htmlFor="cancel-shift-reason"
            className={cn(MT.caption, "font-semibold uppercase tracking-wider text-muted-foreground")}
          >
            Motivo (obligatorio)
          </Label>
          <Textarea
            id="cancel-shift-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="El cliente canceló el servicio, cambio de fecha, sin operación…"
            rows={3}
            maxLength={500}
            disabled={submitting}
            className="text-sm"
          />
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className={cn(TAP, "rounded-full")} disabled={submitting}>
            Volver
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void submit(); }}
            disabled={submitting || !shiftId || !reasonValid}
            className={cn(TAP, "rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          >
            {submitting
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : acknowledge ? "Cancelar de todos modos" : ADMIN_LEX.cancel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
