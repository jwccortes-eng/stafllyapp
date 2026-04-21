import { useEffect, useMemo, useState } from "react";
import { Star, CheckCircle2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { supabase } from "@/integrations/supabase/client";
import { ShiftReviewForm } from "./ShiftReviewForm";
import type { Assignment, Employee } from "@/components/shifts/types";
import { cn } from "@/lib/utils";

interface Props {
  shiftId: string;
  companyId: string;
  reviewerUserId: string;
  reviewerEmployeeId?: string | null;
  reviewerRole?: "admin" | "owner" | "manager" | "supervisor" | "captain";
  shiftEndsAt: Date | null;
  assignments: Assignment[];
  employees: Employee[];
}

interface ReviewRow {
  reviewed_employee_id: string | null;
  overall_rating: number;
  submitted_at: string | null;
  created_at: string;
}

/**
 * Premium roster of post-shift reviews shown inside ShiftDetailDialog.
 * - Lists only employees who were actually staffed (status not rejected/removed).
 * - Marks who has been evaluated by the current reviewer.
 * - Disables Evaluate when the shift hasn't ended yet (DB also enforces this).
 */
export function ShiftPostReviewsSection({
  shiftId, companyId, reviewerUserId, reviewerEmployeeId,
  reviewerRole = "admin",
  shiftEndsAt, assignments, employees,
}: Props) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Employee | null>(null);

  const eligibleAssignments = useMemo(
    () => assignments.filter(a => a.status !== "rejected" && a.status !== "removed"),
    [assignments],
  );

  const canReviewNow = !!shiftEndsAt && shiftEndsAt.getTime() <= Date.now() + 5 * 60_000;

  async function refresh() {
    if (!shiftId || !reviewerUserId) return;
    setLoading(true);
    const { data } = await supabase
      .from("shift_reviews")
      .select("reviewed_employee_id, overall_rating, submitted_at, created_at")
      .eq("shift_id", shiftId)
      .eq("reviewer_id", reviewerUserId);
    setReviews((data as ReviewRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [shiftId, reviewerUserId]);

  const reviewByEmployee = useMemo(() => {
    const m = new Map<string, ReviewRow>();
    reviews.forEach(r => { if (r.reviewed_employee_id) m.set(r.reviewed_employee_id, r); });
    return m;
  }, [reviews]);

  if (eligibleAssignments.length === 0) return null;

  const reviewedCount = eligibleAssignments.filter(a => reviewByEmployee.has(a.employee_id)).length;

  return (
    <div className="rounded-xl border border-border/30 bg-card/40 p-3 space-y-2.5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Post-shift reviews
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {reviewedCount}/{eligibleAssignments.length}
        </span>
      </header>

      {!canReviewNow && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1">
          <Clock3 className="h-3 w-3" />
          <span>Las reseñas se habilitan cuando el turno termine.</span>
        </div>
      )}

      <div className="space-y-1">
        {eligibleAssignments.map(a => {
          const emp = employees.find(e => e.id === a.employee_id);
          if (!emp) return null;
          const review = reviewByEmployee.get(emp.id);
          const reviewed = !!review;
          return (
            <div
              key={a.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                reviewed ? "border-emerald-500/15 bg-emerald-500/[0.03]" : "border-border/40 bg-background/40",
              )}
            >
              <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="xs" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold truncate">{emp.first_name} {emp.last_name}</p>
                {reviewed && (
                  <p className="text-[9.5px] text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                    Evaluado · <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {review!.overall_rating}
                  </p>
                )}
              </div>
              {reviewed ? (
                <span className="text-[10px] font-semibold text-emerald-600 px-1.5">✓</span>
              ) : (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setTarget(emp)}
                  disabled={!canReviewNow || loading}
                  className="h-6 px-2 text-[10px] gap-1 rounded-md"
                >
                  <Star className="h-3 w-3" />
                  Evaluate
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Evaluar a {target?.first_name} {target?.last_name}
            </DialogTitle>
          </DialogHeader>
          {target && (
            <ShiftReviewForm
              shiftId={shiftId}
              companyId={companyId}
              reviewerType="manager"
              reviewerId={reviewerUserId}
              reviewerUserId={reviewerUserId}
              reviewerEmployeeId={reviewerEmployeeId ?? null}
              reviewerRole={reviewerRole}
              reviewedEmployeeId={target.id}
              onSuccess={() => { setTarget(null); refresh(); }}
              onCancel={() => setTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
