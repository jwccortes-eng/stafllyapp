import { useEffect, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  type ShiftCloseout,
  type CloseoutRole,
  type EvidencePacket,
  getShiftCloseout,
  getShiftEvidencePacket,
} from "@/lib/shifts/closeout";
import { CloseoutSummaryCard } from "./CloseoutSummaryCard";
import { CaptainCloseoutForm } from "./CaptainCloseoutForm";
import { AdminCloseoutReview } from "./AdminCloseoutReview";
import { EvidencePacketCard } from "./EvidencePacketCard";
import { FinalApprovalCard } from "./FinalApprovalCard";

interface Props {
  shiftId: string;
  companyId: string;
  employeeId?: string | null;
  /** True when current user is a shift admin/captain or admin. */
  canSubmit: boolean;
  /** True when current user can review (admin/manager/owner/developer). */
  canReview: boolean;
  /** True when current user can do final operational approval (Keury). */
  canFinalApprove?: boolean;
  role?: CloseoutRole;
}

export function ShiftCloseoutSection({
  shiftId,
  companyId,
  employeeId,
  canSubmit,
  canReview,
  canFinalApprove = false,
  role,
}: Props) {
  const { user } = useAuth();
  const [closeout, setCloseout] = useState<ShiftCloseout | null>(null);
  const [evidence, setEvidence] = useState<EvidencePacket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getShiftCloseout(shiftId), getShiftEvidencePacket(shiftId)])
      .then(([c, ev]) => {
        if (cancelled) return;
        setCloseout(c);
        setEvidence(ev);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  const reviewed =
    closeout?.status === "reviewed" || closeout?.status === "rejected";

  const showForm = canSubmit && !reviewed;
  const showReview = canReview && closeout?.status === "submitted";
  const showFinal =
    canFinalApprove &&
    closeout?.status === "reviewed" &&
    closeout?.review_status === "approved";

  return (
    <section aria-label="Cierre del turno">
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Cierre del turno</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <EvidencePacketCard
            packet={evidence}
            incidents={closeout?.incident_count ?? 0}
          />

          <CloseoutSummaryCard closeout={closeout} />

          {showReview && closeout ? (
            <AdminCloseoutReview
              closeout={closeout}
              onReviewed={(next) => setCloseout(next)}
            />
          ) : null}

          {showFinal && closeout ? (
            <FinalApprovalCard
              closeout={closeout}
              onFinalized={(next) => setCloseout(next)}
            />
          ) : null}

          {showForm && user?.id ? (
            <CaptainCloseoutForm
              companyId={companyId}
              shiftId={shiftId}
              userId={user.id}
              employeeId={employeeId ?? null}
              role={role ?? (canReview ? "admin" : "captain")}
              current={closeout}
              evidence={evidence}
              onSaved={(next) => setCloseout(next)}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
