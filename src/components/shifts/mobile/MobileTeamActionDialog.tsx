/**
 * MobileTeamActionDialog — confirmation dialog for Phase 2 safe team actions.
 *
 * One dialog, two flows:
 *   - "assignment_state"   → calls setShiftAssignmentState
 *   - "claim_decision"     → calls resolveShiftRequest
 *
 * Always includes the safety copy ("does not affect payroll or worked time").
 * No destructive deletes. No hard removals.
 */

import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  setShiftAssignmentState, resolveShiftRequest, assignWorkerToShift,
  type AssignmentNextStatus, type ClaimDecision,
} from "@/lib/shifts/team-actions";

const SAFETY_COPY =
  "This action updates the worker's assignment status and is logged. It does not affect payroll or worked time. Attendance and payroll review remain separate.";

const ASSIGN_SAFETY_COPY =
  "This assigns the worker to this shift as a pending invitation and is logged. The worker still needs to accept. It does not affect payroll or worked time.";

type Mode =
  | { kind: "assignment_state"; assignmentId: string; nextStatus: AssignmentNextStatus }
  | { kind: "claim_decision"; requestId: string; decision: ClaimDecision }
  | { kind: "assign_worker"; shiftId: string; employeeId: string; graceWarning?: string | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workerName: string;
  mode: Mode | null;
  onSuccess?: () => void;
}

const ASSIGNMENT_VERB: Record<AssignmentNextStatus, string> = {
  confirmed: "Confirm",
  rejected: "Mark as rejected",
  removed: "Remove from shift",
};

const CLAIM_VERB: Record<ClaimDecision, string> = {
  approved: "Approve claim",
  rejected: "Reject claim",
};

export function MobileTeamActionDialog({
  open, onOpenChange, workerName, mode, onSuccess,
}: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const title = !mode
    ? ""
    : mode.kind === "assignment_state"
      ? `${ASSIGNMENT_VERB[mode.nextStatus]} ${workerName}?`
      : `${CLAIM_VERB[mode.decision]} from ${workerName}?`;

  const isDestructiveTone =
    !!mode &&
    ((mode.kind === "assignment_state" && (mode.nextStatus === "removed" || mode.nextStatus === "rejected")) ||
      (mode.kind === "claim_decision" && mode.decision === "rejected"));

  const handleConfirm = async () => {
    if (!mode || submitting) return;
    setSubmitting(true);
    try {
      if (mode.kind === "assignment_state") {
        await setShiftAssignmentState({
          assignmentId: mode.assignmentId,
          nextStatus: mode.nextStatus,
          reason: reason.trim() || null,
        });
        toast({ title: `${ASSIGNMENT_VERB[mode.nextStatus]} · ${workerName}` });
      } else {
        await resolveShiftRequest({
          requestId: mode.requestId,
          decision: mode.decision,
          reason: reason.trim() || null,
        });
        toast({ title: `${CLAIM_VERB[mode.decision]} · ${workerName}` });
      }
      setReason("");
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      const msg = e?.message || "Action failed";
      const friendly =
        /forbidden/i.test(msg) ? "You don't have permission for this action." :
        /invalid_transition/i.test(msg) ? "That status change isn't allowed." :
        /request_not_pending/i.test(msg) ? "This claim was already reviewed." :
        /EMPLOYEE_NOT_READY/i.test(msg) ? "This worker needs to complete their profile before approval." :
        msg;
      toast({ title: "Action failed", description: friendly, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <AlertDialogContent className="max-w-[92vw] sm:max-w-md rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[12px] leading-snug">
            {SAFETY_COPY}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reason (optional)
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Add context for the audit log…"
            rows={3}
            maxLength={500}
            disabled={submitting}
            className="text-sm"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={submitting || !mode}
            className={isDestructiveTone ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
