import { useState } from "react";
import { BadgeCheck, Loader2, XCircle, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  type ShiftCloseout,
  type CloseoutFinalStatus,
  finalApproveCloseout,
  finalStatusLabel,
} from "@/lib/shifts/closeout";

interface Props {
  closeout: ShiftCloseout;
  onFinalized: (next: ShiftCloseout) => void;
}

/**
 * Operational final approval (Keury / Quebri).
 * "Listo para pago" is an operational readiness label, NOT a payment promise.
 * Backend enforces: only allowed final approvers, and only when María
 * already approved.
 */
export function FinalApprovalCard({ closeout, onFinalized }: Props) {
  const [notes, setNotes] = useState<string>(closeout.final_approval_notes ?? "");
  const [busy, setBusy] = useState<CloseoutFinalStatus | null>(null);

  const eligible =
    closeout.status === "reviewed" && closeout.review_status === "approved";
  const finalized = closeout.final_approval_status === "approved";

  async function submit(next: CloseoutFinalStatus) {
    if (!eligible && next === "approved") {
      toast.error("María debe aprobar el cierre antes de la aprobación final.");
      return;
    }
    setBusy(next);
    try {
      const updated = await finalApproveCloseout({
        closeout_id: closeout.id,
        final_approval_status: next,
        final_approval_notes: notes.trim() || null,
      });
      toast.success(`Aprobación final: ${finalStatusLabel(next)}`);
      onFinalized(updated);
    } catch (e: any) {
      const msg = e?.message ?? "No se pudo registrar la aprobación final";
      if (msg.includes("closeout_final_approver_only")) {
        toast.error("Solo aprobadores finales pueden firmar este cierre.");
      } else if (msg.includes("closeout_final_requires_review_approved")) {
        toast.error("María debe aprobar el cierre antes de la aprobación final.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
      <div className="flex items-start gap-2">
        <BadgeCheck className="h-4 w-4 mt-0.5 text-sky-700 dark:text-sky-300" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Aprobación final (Keury)</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
            Marca el cierre como operacionalmente listo para el flujo de pago.
            No paga ni cambia payroll.
          </p>
        </div>
      </div>

      {!eligible ? (
        <p className="text-[12px] text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
          Pendiente: María debe aprobar el cierre antes de habilitar esta firma.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Notas de aprobación final
        </Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          disabled={finalized}
          placeholder="Opcional"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={() => submit("on_hold")}
          disabled={busy !== null || finalized}
        >
          {busy === "on_hold" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PauseCircle className="h-4 w-4" />
          )}
          En pausa
        </Button>
        <Button
          variant="outline"
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={() => submit("rejected")}
          disabled={busy !== null || finalized}
        >
          {busy === "rejected" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          Rechazar
        </Button>
        <Button
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={() => submit("approved")}
          disabled={busy !== null || !eligible || finalized}
        >
          {busy === "approved" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <BadgeCheck className="h-4 w-4" />
          )}
          Listo para pago
        </Button>
      </div>
    </div>
  );
}
