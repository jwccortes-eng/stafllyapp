/**
 * WorkforceRankingPanel — operational ranking blocks built on top of the
 * `employee_review_stats` view. Designed for the Quality dashboard.
 *
 * Surfaces four actionable cohorts:
 *   • Top rated      — highest avg score with at least N reviews.
 *   • Most reliable  — many reviews, no risk flags, score ≥ 4.
 *   • Needs attention— at_risk / watch (low scores, recent flags).
 *   • No reviews yet — active employees with zero reviews.
 *
 * Strict tenant scoping via the companyId prop.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, ShieldCheck, AlertTriangle, UserPlus, ArrowRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyRisk, type EmployeeReviewStats } from "@/hooks/useEmployeeReviewStats";
import { formatPersonName } from "@/lib/format-helpers";

type Emp = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  gender: string | null;
};

type Enriched = Emp & { stats: EmployeeReviewStats | null; risk: ReturnType<typeof classifyRisk> };

const MIN_REVIEWS_TOP = 3;       // need at least 3 reviews to be "top rated"
const MIN_REVIEWS_RELIABLE = 5;  // need 5+ to be "most reliable"

interface Props {
  companyId: string;
}

export function WorkforceRankingPanel({ companyId }: Props) {
  const [rows, setRows] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const [{ data: emps }, { data: stats }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, first_name, last_name, avatar_url, gender")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .limit(500),
        (supabase.from("employee_review_stats" as any) as any)
          .select("*")
          .eq("company_id", companyId),
      ]);

      if (cancelled) return;

      const statsMap = new Map<string, EmployeeReviewStats>();
      (stats ?? []).forEach((s: EmployeeReviewStats) => statsMap.set(s.employee_id, s));

      const enriched: Enriched[] = (emps ?? []).map((e: any) => {
        const s = statsMap.get(e.id) ?? null;
        return { ...e, stats: s, risk: classifyRisk(s) };
      });

      setRows(enriched);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [companyId]);

  const cohorts = useMemo(() => {
    const withReviews = rows.filter(r => r.stats && r.stats.total_reviews > 0);

    const topRated = [...withReviews]
      .filter(r => (r.stats?.total_reviews ?? 0) >= MIN_REVIEWS_TOP && (r.stats?.avg_overall_score ?? 0) >= 4)
      .sort((a, b) => (b.stats?.avg_overall_score ?? 0) - (a.stats?.avg_overall_score ?? 0))
      .slice(0, 8);

    const mostReliable = [...withReviews]
      .filter(r => (r.stats?.total_reviews ?? 0) >= MIN_REVIEWS_RELIABLE && r.risk === "none" && (r.stats?.avg_overall_score ?? 0) >= 4)
      .sort((a, b) => (b.stats?.total_reviews ?? 0) - (a.stats?.total_reviews ?? 0))
      .slice(0, 8);

    const needsAttention = [...withReviews]
      .filter(r => r.risk === "at_risk" || r.risk === "watch")
      .sort((a, b) => {
        // at_risk first, then by lowest avg score
        if (a.risk !== b.risk) return a.risk === "at_risk" ? -1 : 1;
        return (a.stats?.avg_overall_score ?? 5) - (b.stats?.avg_overall_score ?? 5);
      })
      .slice(0, 12);

    const noReviews = rows
      .filter(r => !r.stats || r.stats.total_reviews === 0)
      .slice(0, 12);

    return { topRated, mostReliable, needsAttention, noReviews, totalWithReviews: withReviews.length };
  }, [rows]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CohortCard
          title="Top rated"
          subtitle={`Score ≥ 4.0 · ${MIN_REVIEWS_TOP}+ reviews`}
          icon={Star}
          tone="primary"
          items={cohorts.topRated}
          empty="Not enough data yet — collect more reviews."
          renderTrailing={(r) => (
            <ScoreChip score={r.stats?.avg_overall_score ?? 0} reviews={r.stats?.total_reviews ?? 0} />
          )}
        />

        <CohortCard
          title="Most reliable"
          subtitle={`${MIN_REVIEWS_RELIABLE}+ reviews · no risk flags`}
          icon={ShieldCheck}
          tone="earning"
          items={cohorts.mostReliable}
          empty="No workers reach the reliability threshold yet."
          renderTrailing={(r) => (
            <span className="text-[11px] font-bold text-foreground/70 tabular-nums">
              {r.stats?.total_reviews ?? 0}<span className="opacity-60"> reviews</span>
            </span>
          )}
        />

        <CohortCard
          title="Needs attention"
          subtitle="At-risk or watch list"
          icon={AlertTriangle}
          tone="deduction"
          items={cohorts.needsAttention}
          empty="🎉 No workers flagged right now."
          renderTrailing={(r) => (
            <Badge
              variant="outline"
              className={cn(
                "h-5 text-[10px] px-1.5",
                r.risk === "at_risk"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-400",
              )}
            >
              {r.risk === "at_risk" ? "At risk" : "Watch"}
            </Badge>
          )}
        />

        <CohortCard
          title="No reviews yet"
          subtitle="Active workers with zero feedback"
          icon={UserPlus}
          tone="warning"
          items={cohorts.noReviews}
          empty="All active workers have at least one review."
          renderTrailing={() => (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        />
      </div>
    </div>
  );
}

/* ────────────────────── Subcomponents ────────────────────── */

function CohortCard({
  title, subtitle, icon: Icon, tone, items, empty, renderTrailing,
}: {
  title: string;
  subtitle: string;
  icon: typeof Star;
  tone: "primary" | "earning" | "warning" | "deduction";
  items: Enriched[];
  empty: string;
  renderTrailing: (r: Enriched) => React.ReactNode;
}) {
  const toneMap: Record<string, { ring: string; bg: string; iconText: string }> = {
    primary:   { ring: "ring-primary/15",   bg: "bg-primary/5",   iconText: "text-primary" },
    earning:   { ring: "ring-emerald-500/20", bg: "bg-emerald-500/[0.05]", iconText: "text-emerald-600 dark:text-emerald-500" },
    warning:   { ring: "ring-amber-400/25", bg: "bg-amber-400/[0.06]", iconText: "text-amber-700 dark:text-amber-400" },
    deduction: { ring: "ring-destructive/20", bg: "bg-destructive/[0.05]", iconText: "text-destructive" },
  };
  const t = toneMap[tone];

  return (
    <Card className={cn("rounded-2xl border-border/50 ring-1", t.ring)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", t.bg)}>
            <Icon className={cn("h-4 w-4", t.iconText)} />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm leading-tight">{title}</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
            {items.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/70 text-center py-6">{empty}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((r, i) => (
              <li key={r.id}>
                <Link
                  to={`/app/employees/${r.id}/onboarding`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <span className="w-5 text-[10px] font-bold text-muted-foreground/60 tabular-nums text-center">
                    {i + 1}
                  </span>
                  <EmployeeAvatar
                    firstName={r.first_name}
                    lastName={r.last_name}
                    avatarUrl={r.avatar_url}
                    gender={r.gender}
                    size="xs"
                  />
                  <p className="text-[12px] font-semibold truncate flex-1 min-w-0">
                    {formatPersonName(`${r.first_name} ${r.last_name}`)}
                  </p>
                  {renderTrailing(r)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreChip({ score, reviews }: { score: number; reviews: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      {score.toFixed(1)}
      <span className="text-muted-foreground font-medium ml-1">·{reviews}</span>
    </span>
  );
}
