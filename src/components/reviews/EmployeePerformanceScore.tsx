import { useEffect, useState } from "react";
import { Star, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PerformanceData {
  overallRating: number;
  totalReviews: number;
  performanceScore: number;
  categories: { label: string; avg: number }[];
}

/* Weighted performance score calculation */
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

export function EmployeePerformanceScore({ employeeId }: { employeeId: string }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      setLoading(true);
      const { data: reviews, error } = await supabase
        .from("shift_reviews")
        .select("overall_rating, rating_presentation, rating_punctuality, rating_service, rating_quality, rating_professionalism, rating_teamwork, rating_instructions, rating_productivity")
        .eq("reviewed_employee_id", employeeId)
        .eq("reviewer_type", "manager");

      if (error || !reviews?.length) {
        setData(null);
        setLoading(false);
        return;
      }

      const n = reviews.length;
      const overallRating = Math.round((reviews.reduce((s, r) => s + Number(r.overall_rating), 0) / n) * 10) / 10;

      const catKeys = Object.keys(CATEGORY_LABELS);
      const catAvgs: Record<string, number> = {};
      const categories: { label: string; avg: number }[] = [];
      catKeys.forEach(k => {
        const vals = reviews.map(r => (r as any)[k]).filter(Boolean);
        if (vals.length) {
          const avg = Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10;
          catAvgs[k] = avg;
          categories.push({ label: CATEGORY_LABELS[k], avg });
        }
      });

      setData({
        overallRating,
        totalReviews: n,
        performanceScore: calcPerformanceScore(catAvgs),
        categories,
      });
      setLoading(false);
    })();
  }, [employeeId]);

  if (loading) return null;
  if (!data) return (
    <div className="text-xs text-muted-foreground italic">Sin reseñas aún</div>
  );

  return (
    <div className="space-y-3">
      {/* Header scores */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          <span className="text-lg font-bold">{data.overallRating}</span>
          <span className="text-xs text-muted-foreground">/ 5</span>
        </div>
        <div className="flex items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">{data.performanceScore}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{data.totalReviews} reseña{data.totalReviews !== 1 ? "s" : ""}</span>
      </div>

      {/* Category bars */}
      <div className="space-y-1.5">
        {data.categories.map(c => (
          <div key={c.label} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-24 truncate">{c.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  c.avg >= 4 ? "bg-emerald-500" : c.avg >= 3 ? "bg-amber-400" : "bg-destructive"
                )}
                style={{ width: `${(c.avg / 5) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-medium w-7 text-right">{c.avg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
