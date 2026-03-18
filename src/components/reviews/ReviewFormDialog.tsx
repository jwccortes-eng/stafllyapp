import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Star, AlertTriangle, Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LOW_RATING_REASONS = [
  { key: "tardanza", label: "Tardanza" },
  { key: "mala_comunicacion", label: "Mala comunicación" },
  { key: "mala_actitud", label: "Mala actitud" },
  { key: "incumplimiento", label: "Incumplimiento" },
  { key: "baja_calidad", label: "Baja calidad" },
  { key: "falta_organizacion", label: "Falta de organización" },
  { key: "problema_liderazgo", label: "Problema de liderazgo" },
  { key: "logistica_deficiente", label: "Logística deficiente" },
  { key: "alcance_incompleto", label: "Alcance incompleto" },
  { key: "trato_inadecuado", label: "Trato inadecuado" },
  { key: "otro", label: "Otro" },
];

const FORM_TITLES: Record<string, string> = {
  captain_to_employee: "Evaluar Trabajador",
  employee_to_captain: "Evaluar Líder",
  employee_to_shift: "Evaluar Turno",
  admin_to_employee: "Evaluar Trabajador",
  captain_to_shift: "Evaluar Turno",
};

interface Dimension {
  category_key: string;
  label_es: string;
  display_order: number;
}

interface ReviewFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewRequest?: {
    id: string;
    review_form_type: string;
    evaluated_entity_type: string;
    evaluated_entity_id: string;
    evaluated_role?: string;
    source_event_id?: string;
    source_event_type?: string;
  };
  /** For ad-hoc reviews without a request */
  formType?: string;
  evaluatedEntityType?: string;
  evaluatedEntityId?: string;
  evaluatedName?: string;
  sourceEventId?: string;
  sourceEventType?: string;
  onSubmitted?: () => void;
}

function StarRating({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = useState(0);
  const px = size === "sm" ? "h-5 w-5" : "h-7 w-7";

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star)}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            className={cn(
              px,
              "transition-colors",
              (hover || value) >= star
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/20"
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewFormDialog({
  open,
  onOpenChange,
  reviewRequest,
  formType: propFormType,
  evaluatedEntityType: propEntityType,
  evaluatedEntityId: propEntityId,
  evaluatedName,
  sourceEventId,
  sourceEventType,
  onSubmitted,
}: ReviewFormDialogProps) {
  const { user, employeeId } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [overallRating, setOverallRating] = useState(0);
  const [dimensionRatings, setDimensionRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const formType = reviewRequest?.review_form_type || propFormType || "admin_to_employee";
  const entityType = reviewRequest?.evaluated_entity_type || propEntityType || "employee";
  const entityId = reviewRequest?.evaluated_entity_id || propEntityId;

  const isLowRating = overallRating > 0 && overallRating <= 3;
  const isVeryLowRating = overallRating > 0 && overallRating <= 2;
  const commentRequired = isLowRating;
  const reasonRequired = isVeryLowRating;

  // Fetch form dimensions
  useEffect(() => {
    if (!open || !formType) return;
    supabase
      .from("review_form_dimensions")
      .select("category_key, label_es, display_order")
      .eq("form_type", formType as any)
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => {
        setDimensions((data as Dimension[]) ?? []);
      });
  }, [open, formType]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setOverallRating(0);
      setDimensionRatings({});
      setComment("");
      setSelectedReasons([]);
    }
  }, [open]);

  const toggleReason = (key: string) => {
    setSelectedReasons((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  };

  const canSubmit = () => {
    if (overallRating === 0) return false;
    if (commentRequired && !comment.trim()) return false;
    if (reasonRequired && selectedReasons.length === 0) return false;
    // At least half dimensions rated
    const ratedCount = Object.values(dimensionRatings).filter((v) => v > 0).length;
    if (dimensions.length > 0 && ratedCount < Math.ceil(dimensions.length / 2)) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit() || !user || !selectedCompanyId || !entityId) return;
    setSubmitting(true);

    try {
      // Calculate overall from dimensions if not manually set high
      const dimValues = Object.values(dimensionRatings).filter((v) => v > 0);
      const dimAvg = dimValues.length > 0
        ? Math.round(dimValues.reduce((a, b) => a + b, 0) / dimValues.length)
        : overallRating;
      const finalOverall = overallRating || dimAvg;

      // Insert submission
      const { data: submission, error: subError } = await supabase
        .from("review_submissions")
        .insert({
          review_request_id: reviewRequest?.id || null,
          company_id: selectedCompanyId,
          source_product: "stafly" as any,
          evaluator_user_id: user.id,
          evaluator_employee_id: employeeId,
          evaluated_entity_type: entityType as any,
          evaluated_entity_id: entityId,
          evaluated_role: reviewRequest?.evaluated_role || null,
          review_form_type: formType as any,
          overall_rating: finalOverall,
          comment: comment.trim() || null,
          low_rating_reason: selectedReasons[0] || null,
          low_rating_reasons: selectedReasons.length > 0 ? selectedReasons : null,
          source_event_type: reviewRequest?.source_event_type || sourceEventType || null,
          source_event_id: reviewRequest?.source_event_id || sourceEventId || null,
        } as any)
        .select("id")
        .single();

      if (subError) throw subError;

      // Insert dimension scores
      const dimInserts = Object.entries(dimensionRatings)
        .filter(([, v]) => v > 0)
        .map(([key, rating]) => ({
          submission_id: submission.id,
          category_key: key,
          rating,
        }));

      if (dimInserts.length > 0) {
        await supabase.from("review_dimension_scores").insert(dimInserts);
      }

      toast.success("Evaluación enviada correctamente");
      onOpenChange(false);
      onSubmitted?.();
    } catch (err: any) {
      console.error("Review submit error:", err);
      toast.error(err.message || "Error al enviar evaluación");
    } finally {
      setSubmitting(false);
    }
  };

  const title = FORM_TITLES[formType] || "Evaluación";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          {evaluatedName && (
            <p className="text-sm text-muted-foreground">{evaluatedName}</p>
          )}
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Overall Rating */}
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Calificación general
            </p>
            <StarRating value={overallRating} onChange={setOverallRating} />
          </div>

          {/* Dimension Ratings */}
          {dimensions.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                Detalle por categoría
              </p>
              {dimensions.map((dim) => (
                <div
                  key={dim.category_key}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-sm text-foreground truncate flex-1">
                    {dim.label_es}
                  </span>
                  <StarRating
                    size="sm"
                    value={dimensionRatings[dim.category_key] || 0}
                    onChange={(v) =>
                      setDimensionRatings((prev) => ({
                        ...prev,
                        [dim.category_key]: v,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {/* Low Rating Warning + Reasons */}
          {isLowRating && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/30 p-3 space-y-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="text-xs font-semibold">
                  {isVeryLowRating
                    ? "Calificación muy baja — por favor indica el motivo"
                    : "Calificación baja — por favor agrega un comentario"}
                </p>
              </div>

              {reasonRequired && (
                <div className="flex flex-wrap gap-1.5">
                  {LOW_RATING_REASONS.map((reason) => (
                    <Badge
                      key={reason.key}
                      variant={
                        selectedReasons.includes(reason.key)
                          ? "default"
                          : "outline"
                      }
                      className={cn(
                        "cursor-pointer text-[11px] transition-all",
                        selectedReasons.includes(reason.key)
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : "hover:bg-amber-100 dark:hover:bg-amber-950/30"
                      )}
                      onClick={() => toggleReason(reason.key)}
                    >
                      {reason.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comment */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Comentario{" "}
              {commentRequired ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground/40">(opcional)</span>
              )}
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="¿Qué destacarías de esta experiencia?"
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting}
            className="w-full gap-2"
          >
            <Send className="h-4 w-4" />
            {submitting ? "Enviando..." : "Enviar evaluación"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
