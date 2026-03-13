import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ShiftReviewForm } from "./ShiftReviewForm";

interface ShiftReviewButtonProps {
  shiftId: string;
  companyId: string;
  reviewerType: "manager" | "employee";
  reviewerId: string;
  reviewedEmployeeId?: string;
  reviewedClientId?: string;
  employeeName?: string;
  size?: "sm" | "default";
}

export function ShiftReviewButton({
  shiftId, companyId, reviewerType, reviewerId,
  reviewedEmployeeId, reviewedClientId, employeeName,
  size = "sm",
}: ShiftReviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [hasReview, setHasReview] = useState(false);
  const [rating, setRating] = useState<number | null>(null);

  useEffect(() => {
    if (!shiftId || !reviewerId) return;
    supabase
      .from("shift_reviews")
      .select("overall_rating")
      .eq("shift_id", shiftId)
      .eq("reviewer_type", reviewerType)
      .eq("reviewer_id", reviewerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setHasReview(true);
          setRating(Number(data.overall_rating));
        }
      });
  }, [shiftId, reviewerId, reviewerType]);

  if (hasReview) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        <span>{rating}</span>
      </div>
    );
  }

  return (
    <>
      <Button variant="ghost" size={size} onClick={() => setOpen(true)} className="gap-1.5 text-xs">
        <Star className="h-3.5 w-3.5" />
        Evaluar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {reviewerType === "manager"
                ? `Evaluar a ${employeeName || "empleado"}`
                : "Evaluar este trabajo"}
            </DialogTitle>
          </DialogHeader>
          <ShiftReviewForm
            shiftId={shiftId}
            companyId={companyId}
            reviewerType={reviewerType}
            reviewerId={reviewerId}
            reviewedEmployeeId={reviewedEmployeeId}
            reviewedClientId={reviewedClientId}
            onSuccess={() => { setOpen(false); setHasReview(true); }}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
