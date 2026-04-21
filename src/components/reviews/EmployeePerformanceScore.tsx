import { useEffect, useState } from "react";
import { Star, TrendingUp, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeReviewStats, classifyRisk } from "@/hooks/useEmployeeReviewStats";
import { cn } from "@/lib/utils";

interface CategoryRow { label: string; avg: number }

const CATEGORY_LABELS: Record<string, string> = {
  rating_presentation: "Presentación",
  rating_punctuality: "Puntualidad",
  rating_service: "Actitud",
  rating_quality: "Calidad",
  rating_professionalism: "Profesionalismo",
  rating_teamwork: "Equipo",
  rating_instructions: "Instrucciones",
  rating_productivity: "Productividad",
};

/* Weighted performance score derived from category averages */
function calcPerformanceScore(cats: Record<string, number>): number {
  const weights: Record<string, number> = {
    rating_punctuality: 0.25,
    rating_quality: 0.25,
    rating_service: 0.15,
    rating_professionalism: 0.15,
    rating_teamwork: 0.10,
    rating_presentation: 0.10,
  };
  let total = 0, wSum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (cats[k] != null) { total += cats[k] * w; wSum += w; }
  }
  return wSum > 0 ? Math.round((total / wSum / 5) * 100) : 0;
}

export function EmployeePerformanceScore({ employeeId }: { employeeId: string }) {
  const { data: stats, loading: statsLoading } = useEmployeeReviewStats(employeeId);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [recent, setRecent] = useState<{ comment: string; rating: number; at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      setLoading(true);
      const { data: reviews } = await supabase
        .from("shift_reviews")
        .select("overall_rating, comment, submitted_at, created_at, rating_presentation, rating_punctuality, rating_service, rating_quality, rating_professionalism, rating_teamwork, rating_instructions, rating_productivity")
        .eq("reviewed_employee_id", employeeId)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (!reviews?.length) {
        setCategories([]); setRecent([]); setLoading(false); return;
      }

      const cats: CategoryRow[] = [];
      Object.keys(CATEGORY_LABELS).forEach(k => {
        const vals = reviews.map(r => (r as any)[k]).filter(Boolean) as number[];
        if (vals.length) {
          const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
          cats.push({ label: CATEGORY_LABELS[k], avg });
        }
      });
      setCategories(cats);

      setRecent(
        reviews
          .filter(r => r.comment && r.comment.trim())
          .slice(0, 3)
          .map(r => ({
            comment: r.comment as string,
            rating: Number(r.overall_rating),
            at: (r.submitted_at ?? r.created_at) as string,
          })),
      );
      setLoading(false);
    })();
  }, [employeeId]);

  if (statsLoading || loading) return null;
  if (!stats || stats.total_reviews === 0) {
    return <div className="text-xs text-muted-foreground italic">Sin reseñas aún</div>;
  }

  const overallRating = stats.avg_overall_score ?? 0;
  const catObj: Record<string, number> = {
    rating_punctuality: stats.avg_punctuality_score ?? 0,
    rating_quality: stats.avg_work_quality_score ?? 0,
    rating_service: stats.avg_attitude_score ?? 0,
    rating_professionalism: stats.avg_communication_score ?? 0,
    rating_presentation: stats.avg_presentation_score ?? 0,
  };
  const performanceScore = calcPerformanceScore(catObj);
  const risk = classifyRisk(stats);

  return (
    <div className="space-y-3">
      {/* Header scores */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          <span className="text-lg font-bold">{overallRating}</span>
          <span className="text-xs text-muted-foreground">/ 5</span>
        </div>
        <div className="flex items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">{performanceScore}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {stats.total_reviews} reseña{stats.total_reviews !== 1 ? "s" : ""}
        </span>
        {risk !== "none" && (
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ring-1",
            risk === "at_risk"
              ? "bg-destructive/10 text-destructive ring-destructive/20"
              : "bg-amber-500/10 text-amber-700 ring-amber-500/20",
          )}>
            <AlertTriangle className="h-3 w-3" />
            {risk === "at_risk" ? "En riesgo" : "Vigilar"}
          </span>
        )}
      </div>

      {stats.total_reviews < 3 && (
        <p className="text-[10px] text-muted-foreground italic">
          Pocas reseñas — promedio aún poco representativo.
        </p>
      )}

      {/* Category bars */}
      <div className="space-y-1.5">
        {categories.map(c => (
          <div key={c.label} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-24 truncate">{c.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  c.avg >= 4 ? "bg-emerald-500" : c.avg >= 3 ? "bg-amber-400" : "bg-destructive",
                )}
                style={{ width: `${(c.avg / 5) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-medium w-7 text-right">{c.avg}</span>
          </div>
        ))}
      </div>

      {/* Recent observations */}
      {recent.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border/30">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Últimas observaciones
          </p>
          {recent.map((r, i) => (
            <div key={i} className="text-[11px] bg-muted/40 rounded-md px-2 py-1.5">
              <div className="flex items-center gap-1 mb-0.5">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{r.rating}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(r.at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-foreground/80 line-clamp-2">{r.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

