/**
 * PhotoReviewActions — Photo Review Status v2
 * --------------------------------------------
 * Admin-only Approve / Reject controls for a worker's professional photo.
 *
 * Writes to `employees.photo_review_status` + reviewer metadata.
 * The DB trigger `enforce_employee_photo_review_self_edit` prevents
 * workers from invoking these actions on themselves.
 *
 * Safety:
 *   - No payroll, time_entries, shifts, notifications, SSN/EIN, AI.
 *   - No automatic blocking — the worker can still log in and use the
 *     portal/update center/documents/support regardless of status.
 *   - Photo is never deleted; only the review verdict + reason are stored.
 */

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkerPhotoStatusChip, type WorkerPhotoStatus } from "@/components/employee/WorkerPhotoStatusChip";
import { cn } from "@/lib/utils";

export const REJECTION_REASONS = [
  "Foto borrosa",
  "No muestra el rostro",
  "Fondo no apropiado",
  "Foto grupal",
  "Logo / caricatura / mascota",
  "Contenido no apropiado",
  "Otro",
] as const;

type DbStatus = "pending" | "approved" | "rejected" | null;

export interface PhotoReviewActionsProps {
  employeeId: string;
  avatarUrl: string | null | undefined;
  reviewStatus: DbStatus;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  onChanged?: (next: { status: DbStatus; reason: string | null }) => void;
  size?: "sm" | "md";
  className?: string;
}

/** Derive the canonical chip status from the DB review fields + avatar presence. */
export function deriveWorkerPhotoStatus(
  avatarUrl: string | null | undefined,
  dbStatus: DbStatus,
): WorkerPhotoStatus {
  const has = !!avatarUrl && String(avatarUrl).trim().length > 0;
  if (!has) return "required";
  if (dbStatus === "approved") return "approved";
  if (dbStatus === "rejected") return "invalid";
  // null OR 'pending' both display as pending until reviewed.
  return "pending";
}

export function PhotoReviewActions({
  employeeId,
  avatarUrl,
  reviewStatus,
  rejectionReason,
  reviewedAt,
  onChanged,
  size = "sm",
  className,
}: PhotoReviewActionsProps) {
  const { user, role } = useAuth();
  const { canAny } = usePermissions();
  const { toast } = useToast();

  const isPrivileged =
    canAny(["time_entries.review", "time_entries.approve"]);

  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reasonPick, setReasonPick] = useState<string>(REJECTION_REASONS[0]);
  const [reasonNote, setReasonNote] = useState("");

  const hasPhoto = !!avatarUrl && String(avatarUrl).trim().length > 0;
  const status = deriveWorkerPhotoStatus(avatarUrl, reviewStatus);

  if (!isPrivileged) {
    // Non-admins see only the status chip + (if rejected) the reason.
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <WorkerPhotoStatusChip status={status} size={size === "md" ? "sm" : "xs"} />
        {status === "invalid" && rejectionReason && (
          <span className="text-[11px] text-destructive/85">{rejectionReason}</span>
        )}
      </div>
    );
  }

  const persist = async (
    next: "approved" | "rejected",
    reason: string | null,
  ) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("employees")
        .update({
          photo_review_status: next,
          photo_reviewed_at: new Date().toISOString(),
          photo_reviewed_by: user?.id ?? null,
          photo_rejection_reason: next === "rejected" ? reason : null,
        } as any)
        .eq("id", employeeId);
      if (error) throw error;
      toast({
        title:
          next === "approved"
            ? "Foto aprobada ✅"
            : "Foto marcada como no válida",
        description:
          next === "rejected" && reason ? reason : undefined,
      });
      onChanged?.({ status: next, reason: next === "rejected" ? reason : null });
      setRejectOpen(false);
    } catch (e: any) {
      toast({
        title: "No se pudo guardar",
        description: e?.message ?? "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <WorkerPhotoStatusChip status={status} size={size === "md" ? "sm" : "xs"} />
      {status === "invalid" && rejectionReason && (
        <span className="text-[11px] text-destructive/85">{rejectionReason}</span>
      )}

      {hasPhoto && (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px] border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
            disabled={busy || reviewStatus === "approved"}
            onClick={() => persist("approved", null)}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Aprobar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px] border-destructive/30 text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="h-3 w-3" />
            Rechazar
          </Button>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Rechazar foto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Motivo</Label>
              <div className="grid grid-cols-1 gap-1">
                {REJECTION_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReasonPick(r)}
                    className={cn(
                      "text-left text-[12px] rounded-md border px-2.5 py-1.5 transition",
                      reasonPick === r
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {reasonPick === "Otro" && (
              <div className="space-y-1.5">
                <Label className="text-[11px]">Detalle</Label>
                <Textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Explica brevemente el motivo…"
                  rows={3}
                />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground leading-snug">
              El trabajador podrá ver el motivo en su portal y subir una nueva
              foto. Esta acción no bloquea su acceso al portal, documentos ni
              soporte.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectOpen(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={
                busy || (reasonPick === "Otro" && reasonNote.trim().length === 0)
              }
              onClick={() => {
                const reason =
                  reasonPick === "Otro" ? reasonNote.trim() : reasonPick;
                persist("rejected", reason);
              }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Marcar como no válida"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TODO — audit: when a generic activity_log helper is available,
          log {employee_id, action: 'photo_review', verdict, reason, actor}.
          Out of scope for this sprint per Photo Review Status v2 brief. */}
    </div>
  );
}
