import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Repeat2, Loader2 } from "lucide-react";

export type DocumentReasonAction = "reject" | "replacement";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: DocumentReasonAction;
  documentName: string;
  initialReason?: string;
  onConfirm: (reason: string) => Promise<void> | void;
}

/**
 * Premium reason dialog for document Reject / Request Replacement.
 * Reason is required; the worker sees this text in their portal/onboarding.
 */
export function DocumentReasonDialog({
  open, onOpenChange, action, documentName, initialReason = "", onConfirm,
}: Props) {
  const [reason, setReason] = useState(initialReason);
  const [submitting, setSubmitting] = useState(false);

  const isReject = action === "reject";
  const Icon = isReject ? AlertTriangle : Repeat2;
  const title = isReject ? "Reject document" : "Request replacement";
  const description = isReject
    ? "The worker will see this reason and will need to upload a new version."
    : "The document will be marked as needing a fresh upload from the worker.";
  const confirmLabel = isReject ? "Reject" : "Request replacement";
  const tone = isReject
    ? "bg-destructive/10 text-destructive"
    : "bg-amber-500/10 text-amber-600";

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try { await onConfirm(reason.trim()); } finally { setSubmitting(false); }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submitting) return;
        if (!o) setReason(initialReason);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5 truncate max-w-[260px]">
                {documentName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reason" className="text-xs font-medium">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isReject
              ? "e.g. Image is blurry, please upload a clearer photo."
              : "e.g. Document expired on 2026-01-01. Please upload current version."}
            rows={4}
            disabled={submitting}
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground">
            {description}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={isReject ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={!reason.trim() || submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
