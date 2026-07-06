/**
 * DocumentReviewActions — Fase 2A approve/reject footer for admin document
 * previews (employee_documents only). Uses the existing `approveDocument` /
 * `rejectDocument` helpers, which write to `employee_documents` with the
 * user's session. The BEFORE UPDATE trigger `enforce_employee_document_review`
 * forces reviewed_by = auth.uid(), reviewed_at = now(), requires a rejection
 * reason, and blocks approving expired documents. Every state change is
 * recorded in `document_review_events` by the AFTER UPDATE trigger.
 *
 * This component NEVER promotes a worker, changes `onboarding_status`, or
 * writes to payroll / time_entries / shifts / W-9.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  approveDocument, rejectDocument,
  type UnifiedDocument,
} from "@/lib/document-actions";
import { DocumentReasonDialog } from "./DocumentReasonDialog";
import { isSentinelExpiration } from "@/lib/documents/expiration-display";

interface Props {
  doc: UnifiedDocument | null;
  /** Effective required categories for this worker (lower-case). */
  requiredCategories?: string[];
  /** True when caller has admin rights over this document's company. */
  canReview: boolean;
  /** Refresh callback (invalidates document lists, readiness, etc.). */
  onChanged: () => void;
}

export default function DocumentReviewActions({
  doc, requiredCategories = [], canReview, onChanged,
}: Props) {
  const { toast } = useToast();
  const [approving, setApproving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const category = (doc?.category ?? "").toLowerCase();
  const isRequired = requiredCategories.map((c) => c.toLowerCase()).includes(category);
  const isSentinel = isSentinelExpiration(doc?.expires_at ?? null);
  const isExpired =
    !!doc?.expires_at && !isSentinel && new Date(doc.expires_at) < new Date(new Date().toDateString());

  const canApprove = useMemo(
    () => !!doc && doc.source === "employee_documents" && canReview && doc.state !== "approved" && !isExpired,
    [doc, canReview, isExpired],
  );
  const canReject = useMemo(
    () => !!doc && doc.source === "employee_documents" && canReview && doc.state !== "rejected",
    [doc, canReview],
  );

  if (!doc || doc.source !== "employee_documents" || !canReview) return null;

  const handleApprove = async () => {
    setConfirmOpen(false);
    setApproving(true);
    const { error } = await approveDocument(doc);
    setApproving(false);
    if (error) {
      toast({
        title: "No se pudo aprobar",
        description: error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Documento aprobado",
      description: isRequired
        ? `Cumple el requisito "${category}".`
        : "Aprobado. La categoría no forma parte de los requisitos.",
    });
    onChanged();
  };

  const handleReject = async (reason: string) => {
    const { error } = await rejectDocument(doc, reason);
    if (error) {
      toast({ title: "No se pudo rechazar", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Documento rechazado", description: "El worker verá el motivo en su portal." });
    setRejectOpen(false);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-muted-foreground leading-snug">
          {isRequired ? (
            <span className="text-emerald-700">
              <strong>Cumple requisito:</strong> {category}
            </span>
          ) : (
            <span>
              <strong>Categoría no requerida.</strong> Aprobar no reducirá el conteo de requisitos faltantes.
            </span>
          )}
          {isExpired && (
            <div className="mt-1 flex items-start gap-1 text-rose-700">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                No se puede aprobar un documento vencido. Actualiza la fecha o recházalo.
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={!canReject || approving}
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Rechazar
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={!canApprove || approving}
          >
            {approving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Aprobar documento
          </Button>
        </div>
      </div>

      {(doc.reviewed_at || doc.reason) && (
        <div className="text-[10.5px] text-muted-foreground border-t pt-2 space-y-0.5">
          {doc.reviewed_at && (
            <div>Última revisión: {new Date(doc.reviewed_at).toLocaleString()}</div>
          )}
          {doc.state === "rejected" && doc.reason && (
            <div className="text-rose-700">
              <strong>Motivo:</strong> {doc.reason}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent aria-describedby="approve-doc-desc">
          <AlertDialogHeader>
            <AlertDialogTitle>Aprobar documento</AlertDialogTitle>
            <AlertDialogDescription id="approve-doc-desc">
              {isRequired
                ? `Este documento contará como aprobado para el requisito "${category}".`
                : "Este documento quedará aprobado, pero la categoría no forma parte de los requisitos del worker."}
              {" "}
              <strong>No desbloqueará automáticamente al worker</strong> ni cambiará su onboarding status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove}>Aprobar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        action="reject"
        documentName={doc.name}
        onConfirm={handleReject}
      />
    </div>
  );
}
