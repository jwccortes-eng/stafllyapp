import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Star, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReviewFormDialog } from "./ReviewFormDialog";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const FORM_LABEL: Record<string, string> = {
  captain_to_employee: "Evalúa a un trabajador",
  employee_to_captain: "Evalúa a tu líder",
  employee_to_shift: "¿Cómo fue el turno?",
  admin_to_employee: "Evalúa a un trabajador",
};

interface PendingReview {
  id: string;
  review_form_type: string;
  evaluated_entity_type: string;
  evaluated_entity_id: string;
  evaluated_role: string | null;
  source_event_id: string;
  source_event_type: string;
  deadline_at: string;
  priority: number;
  evaluated_name?: string;
}

export function PendingReviewPrompt() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const fetchPending = async () => {
      const { data } = await supabase
        .from("review_requests")
        .select("id, review_form_type, evaluated_entity_type, evaluated_entity_id, evaluated_role, source_event_id, source_event_type, deadline_at, priority")
        .eq("evaluator_user_id", user.id)
        .eq("status", "pending")
        .gt("deadline_at", new Date().toISOString())
        .order("priority", { ascending: false })
        .limit(5);

      if (!data || data.length === 0) {
        setPending([]);
        return;
      }

      // Enrich with names
      const enriched: PendingReview[] = [];
      for (const req of data) {
        let name = "";
        if (req.evaluated_entity_type === "employee" || req.evaluated_entity_type === "captain" || req.evaluated_entity_type === "supervisor") {
          const { data: emp } = await supabase
            .from("employees")
            .select("first_name, last_name")
            .eq("id", req.evaluated_entity_id)
            .maybeSingle();
          name = emp ? `${emp.first_name} ${emp.last_name}` : "";
        } else if (req.evaluated_entity_type === "shift") {
          const { data: shift } = await supabase
            .from("scheduled_shifts")
            .select("title")
            .eq("id", req.evaluated_entity_id)
            .maybeSingle();
          name = shift?.title || "Turno";
        }
        enriched.push({ ...req, evaluated_name: name } as PendingReview);
      }

      setPending(enriched);
    };

    fetchPending();

    // Listen for new requests
    const channel = supabase
      .channel("review-requests-" + user.id)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "review_requests",
        filter: `evaluator_user_id=eq.${user.id}`,
      }, () => fetchPending())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleDismiss = async (reviewId: string) => {
    setDismissed(prev => new Set([...prev, reviewId]));
    await supabase
      .from("review_requests")
      .update({ status: "dismissed" as any })
      .eq("id", reviewId);
  };

  const visiblePending = pending.filter(r => !dismissed.has(r.id));

  if (visiblePending.length === 0) return null;

  return (
    <>
      <div className="space-y-2">
        {visiblePending.slice(0, 2).map((review) => (
          <div
            key={review.id}
            className={cn(
              "relative flex items-center gap-3 rounded-xl border p-3 transition-all",
              "bg-amber-50/50 border-amber-200/60 dark:bg-amber-950/10 dark:border-amber-800/30",
              "hover:shadow-sm cursor-pointer group"
            )}
            onClick={() => setSelectedReview(review)}
          >
            <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Star className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {FORM_LABEL[review.review_form_type] || "Evaluación pendiente"}
              </p>
              {review.evaluated_name && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {review.evaluated_name}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground/50">
                  Expira {formatDistanceToNow(new Date(review.deadline_at), { locale: es, addSuffix: true })}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleDismiss(review.id); }}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        ))}
        {visiblePending.length > 2 && (
          <p className="text-[11px] text-muted-foreground/50 text-center">
            +{visiblePending.length - 2} evaluaciones pendientes más
          </p>
        )}
      </div>

      <ReviewFormDialog
        open={!!selectedReview}
        onOpenChange={(open) => !open && setSelectedReview(null)}
        reviewRequest={selectedReview ? {
          id: selectedReview.id,
          review_form_type: selectedReview.review_form_type,
          evaluated_entity_type: selectedReview.evaluated_entity_type,
          evaluated_entity_id: selectedReview.evaluated_entity_id,
          evaluated_role: selectedReview.evaluated_role || undefined,
          source_event_id: selectedReview.source_event_id,
          source_event_type: selectedReview.source_event_type,
        } : undefined}
        evaluatedName={selectedReview?.evaluated_name}
        onSubmitted={() => {
          setPending(prev => prev.filter(r => r.id !== selectedReview?.id));
          setSelectedReview(null);
        }}
      />
    </>
  );
}
