import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ─── Star rating input ─── */
function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground min-w-[140px]">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(s)}
            className="p-0.5"
          >
            <Star
              className={cn(
                "h-5 w-5 transition-colors",
                (hover || value) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Manager → Employee categories ─── */
const MANAGER_CATEGORIES = [
  { key: "rating_presentation", label: "Presentación personal" },
  { key: "rating_punctuality", label: "Puntualidad" },
  { key: "rating_service", label: "Actitud de servicio" },
  { key: "rating_quality", label: "Calidad del trabajo" },
  { key: "rating_professionalism", label: "Profesionalismo" },
  { key: "rating_teamwork", label: "Trabajo en equipo" },
  { key: "rating_instructions", label: "Seguimiento de instrucciones" },
  { key: "rating_productivity", label: "Productividad" },
] as const;

/* ─── Employee → Client categories ─── */
const EMPLOYEE_CATEGORIES = [
  { key: "rating_organization", label: "Organización del trabajo" },
  { key: "rating_clarity", label: "Claridad de instrucciones" },
  { key: "rating_supervisor_treatment", label: "Trato del supervisor" },
  { key: "rating_conditions", label: "Condiciones de trabajo" },
  { key: "rating_compensation", label: "Compensación justa" },
] as const;

/* ─── Weighted overall for manager reviews ─── */
function calcManagerOverall(r: Record<string, number>): number {
  const w = {
    rating_punctuality: 0.25,
    rating_quality: 0.25,
    rating_service: 0.15,
    rating_professionalism: 0.15,
    rating_teamwork: 0.10,
    rating_presentation: 0.10,
  };
  let total = 0, wSum = 0;
  for (const [k, weight] of Object.entries(w)) {
    if (r[k]) { total += r[k] * weight; wSum += weight; }
  }
  // Include non-weighted ones as simple average contribution
  const extra = ["rating_instructions", "rating_productivity"];
  let extraSum = 0, extraCount = 0;
  extra.forEach(k => { if (r[k]) { extraSum += r[k]; extraCount++; } });
  if (extraCount > 0 && wSum > 0) {
    return Math.round(((total / wSum) * 0.85 + (extraSum / extraCount) * 0.15) * 10) / 10;
  }
  return wSum > 0 ? Math.round((total / wSum) * 10) / 10 : 0;
}

function calcEmployeeOverall(r: Record<string, number>): number {
  const vals = EMPLOYEE_CATEGORIES.map(c => r[c.key]).filter(Boolean);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/* ─── Props ─── */
interface ShiftReviewFormProps {
  shiftId: string;
  companyId: string;
  reviewerType: "manager" | "employee";
  reviewerId: string;
  reviewedEmployeeId?: string;
  reviewedClientId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ShiftReviewForm({
  shiftId, companyId, reviewerType, reviewerId,
  reviewedEmployeeId, reviewedClientId,
  onSuccess, onCancel,
}: ShiftReviewFormProps) {
  const categories = reviewerType === "manager" ? MANAGER_CATEGORIES : EMPLOYEE_CATEGORIES;
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [wouldWorkAgain, setWouldWorkAgain] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const allFilled = categories.every(c => ratings[c.key] > 0);
  const overall = reviewerType === "manager" ? calcManagerOverall(ratings) : calcEmployeeOverall(ratings);

  async function handleSubmit() {
    if (!allFilled || overall === 0) {
      toast.error("Completa todas las categorías");
      return;
    }
    setSaving(true);
    try {
      const row: Record<string, unknown> = {
        shift_id: shiftId,
        company_id: companyId,
        reviewer_type: reviewerType,
        reviewer_id: reviewerId,
        overall_rating: overall,
        comment: comment.trim() || null,
      };
      if (reviewedEmployeeId) row.reviewed_employee_id = reviewedEmployeeId;
      if (reviewedClientId) row.reviewed_client_id = reviewedClientId;
      if (reviewerType === "employee") row.would_work_again = wouldWorkAgain;
      categories.forEach(c => { row[c.key] = ratings[c.key]; });

      const { error } = await supabase.from("shift_reviews").insert(row as any);
      if (error) throw error;
      toast.success("Reseña enviada");
      onSuccess?.();
    } catch (e: any) {
      if (e?.code === "23505") toast.error("Ya enviaste una reseña para este turno");
      else toast.error(e?.message ?? "Error al enviar reseña");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {categories.map(c => (
          <StarInput
            key={c.key}
            label={c.label}
            value={ratings[c.key] || 0}
            onChange={(v) => setRatings(prev => ({ ...prev, [c.key]: v }))}
          />
        ))}
      </div>

      {reviewerType === "employee" && (
        <div className="flex items-center gap-3 pt-2">
          <span className="text-xs text-muted-foreground">¿Trabajarías de nuevo con este cliente?</span>
          <div className="flex gap-2">
            <Button
              type="button" size="sm" variant={wouldWorkAgain === true ? "default" : "outline"}
              onClick={() => setWouldWorkAgain(true)}
            >Sí</Button>
            <Button
              type="button" size="sm" variant={wouldWorkAgain === false ? "destructive" : "outline"}
              onClick={() => setWouldWorkAgain(false)}
            >No</Button>
          </div>
        </div>
      )}

      {overall > 0 && (
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          <span className="font-semibold text-sm">{overall}</span>
          <span className="text-xs text-muted-foreground">/ 5 promedio ponderado</span>
        </div>
      )}

      <div>
        <Label className="text-xs">Comentarios (opcional)</Label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Escribe un comentario..."
          rows={3}
          maxLength={500}
        />
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>}
        <Button size="sm" onClick={handleSubmit} disabled={!allFilled || saving}>
          {saving ? "Enviando..." : "Enviar reseña"}
        </Button>
      </div>
    </div>
  );
}
