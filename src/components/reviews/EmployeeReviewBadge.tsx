import { Star, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEmployeeReviewStats, classifyRisk } from "@/hooks/useEmployeeReviewStats";

interface Props {
  employeeId: string;
  /** Pre-fetched stats from a bulk hook — avoids per-row queries in lists. */
  stats?: ReturnType<typeof useEmployeeReviewStats>["data"];
  size?: "xs" | "sm";
  className?: string;
}

/**
 * Compact performance badge for employee lists.
 * Shows ⭐ avg, review count, and a risk dot when applicable.
 * Renders nothing when there are zero reviews.
 */
export function EmployeeReviewBadge({ employeeId, stats: external, size = "sm", className }: Props) {
  const { data: fetched } = useEmployeeReviewStats(external !== undefined ? null : employeeId);
  const stats = external !== undefined ? external : fetched;

  if (!stats || stats.total_reviews === 0) return null;

  const risk = classifyRisk(stats);
  const score = stats.avg_overall_score ?? 0;

  const dim = size === "xs" ? "text-[9px] h-4 px-1.5 gap-0.5" : "text-[10px] h-5 px-1.5 gap-1";
  const iconDim = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full font-semibold ring-1",
        score >= 4 ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
        : score >= 3 ? "bg-amber-400/10 text-amber-600 ring-amber-400/30"
        : "bg-destructive/10 text-destructive ring-destructive/20",
        dim,
        className,
      )}
      title={`${stats.total_reviews} reseña${stats.total_reviews !== 1 ? "s" : ""} · promedio ${score}/5`}
    >
      <Star className={cn(iconDim, "fill-current")} />
      <span>{score.toFixed(1)}</span>
      <span className="opacity-60">·{stats.total_reviews}</span>
      {risk === "at_risk" && (
        <AlertTriangle className={cn(iconDim, "ml-0.5 text-destructive")} />
      )}
      {risk === "watch" && (
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
      )}
    </div>
  );
}
