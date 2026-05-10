import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  type ShiftCloseout,
  type CloseoutRole,
  getShiftCloseout,
} from "@/lib/shifts/closeout";
import { CloseoutSummaryCard } from "./CloseoutSummaryCard";
import { CaptainCloseoutForm } from "./CaptainCloseoutForm";
import { AdminCloseoutReview } from "./AdminCloseoutReview";

interface Props {
  shiftId: string;
  companyId: string;
  /** Set when current user maps to an employee on this company. */
  employeeId?: string | null;
  /** True when current user is a shift admin/captain or admin. */
  canSubmit: boolean;
  /** True when current user can review (admin/manager/owner/developer). */
  canReview: boolean;
  /** Operational role used when creating/updating the row. */
  role?: CloseoutRole;
}

export function ShiftCloseoutSection({
  shiftId,
  companyId,
  employeeId,
  canSubmit,
  canReview,
  role,
}: Props) {
  const { user } = useAuth();
  const [closeout, setCloseout] = useState<ShiftCloseout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getShiftCloseout(shiftId)
      .then((r) => {
        if (!cancelled) setCloseout(r);
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

  return (
    <section aria-label="Daily close">
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Daily close</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <CloseoutSummaryCard closeout={closeout} />

          {showReview && closeout ? (
            <AdminCloseoutReview
              closeout={closeout}
              onReviewed={(next) => setCloseout(next)}
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
              onSaved={(next) => setCloseout(next)}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
