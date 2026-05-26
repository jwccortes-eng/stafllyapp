import { useState } from "react";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  type ShiftCloseout,
  type CloseoutReviewStatus,
  reviewShiftCloseout,
} from "@/lib/shifts/closeout";

interface Props {
  closeout: ShiftCloseout;
  onReviewed: (next: ShiftCloseout) => void;
}

export function AdminCloseoutReview({ closeout, onReviewed }: Props) {
  const [reviewStatus, setReviewStatus] = useState<CloseoutReviewStatus>(
    (closeout.review_status as CloseoutReviewStatus) ?? "approved",
  );
  const [notes, setNotes] = useState<string>(closeout.review_notes ?? "");
  const [busy, setBusy] = useState<"review" | "reject" | null>(null);

  const alreadyReviewed =
    closeout.status === "reviewed" || closeout.status === "rejected";

  async function submit(action: "review" | "reject") {
    setBusy(action);
    try {
      const next = await reviewShiftCloseout({
        closeout_id: closeout.id,
        status: action === "review" ? "reviewed" : "rejected",
        review_status:
          action === "reject" && reviewStatus === "approved"
            ? "rejected"
            : reviewStatus,
        review_notes: notes.trim() || null,
      });
      toast.success(
        action === "review"
          ? "Horas aprobadas"
          : "Cierre rechazado",
      );
      onReviewed(next);
    } catch (e: any) {
      const msg = e?.message ?? "No se pudo revisar el cierre";
      if (msg.includes("closeout_review_admin_only")) {
        toast.error("Solo administradores pueden revisar cierres.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div>
        <p className="text-sm font-semibold">Revisión de horas</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
          Aprobar este cierre no aprueba payroll ni confirma el pago.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Estado de revisión
        </Label>
        <Select
          value={reviewStatus}
          onValueChange={(v) => setReviewStatus(v as CloseoutReviewStatus)}
          disabled={alreadyReviewed}
        >
          <SelectTrigger className="h-10 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approved">Aprobado</SelectItem>
            <SelectItem value="needs_followup">Requiere seguimiento</SelectItem>
            <SelectItem value="escalated">Escalado</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Notas de revisión
        </Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={alreadyReviewed}
          placeholder="Contexto opcional para el equipo."
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={() => submit("reject")}
          disabled={busy !== null || alreadyReviewed}
        >
          {busy === "reject" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          Rechazar
        </Button>
        <Button
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={() => submit("review")}
          disabled={busy !== null || alreadyReviewed}
        >
          {busy === "review" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Aprobar por María
        </Button>
      </div>
    </div>
  );
}
