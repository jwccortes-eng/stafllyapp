/**
 * workforce-score.ts
 *
 * Reliability/punctuality/rating composite for an employee, derived from
 * existing tables — NEVER duplicates the Reviews engine.
 *
 *   reliability_score  = 100 − 25·no_shows − 5·lates  + 5·perfect_streaks
 *   rating_avg         = review_scores.weighted_score (entity_type='employee', score_type='overall')
 *   punctuality_score  = % of arrivals tagged on_time / early in last 60 days
 *   composite          = 0.5·reliability + 0.3·(rating/5·100) + 0.2·punctuality
 *
 * No writes to payroll. Bonus eligibility is exposed as a derived flag the
 * admin reviews manually (no auto-insert into movements).
 */
import { supabase } from "@/integrations/supabase/client";

export interface WorkforceScoreInput {
  companyId: string;
  employeeId: string;
  /** Window in days to look back for clock_events. Defaults to 60. */
  lookbackDays?: number;
}

export interface WorkforceScore {
  employeeId: string;
  reliability: number;        // 0–100
  rating: number;             // 0–5 (raw average)
  ratingCount: number;
  punctuality: number;        // 0–100
  composite: number;          // 0–100
  shiftsCompleted: number;
  shiftsNoShow: number;
  shiftsLate: number;
  bonusEligible: boolean;
  computedAt: string;
}

/**
 * Compute the composite score from raw signals.
 * Pure function — easy to unit-test.
 */
export function composeScore(parts: {
  reliability: number; rating: number; punctuality: number;
}): number {
  const ratingNormalized = Math.max(0, Math.min(100, (parts.rating / 5) * 100));
  return Math.round(
    parts.reliability * 0.5 + ratingNormalized * 0.3 + parts.punctuality * 0.2,
  );
}

export async function computeWorkforceScore(
  input: WorkforceScoreInput,
): Promise<WorkforceScore> {
  const { companyId, employeeId } = input;
  const lookback = input.lookbackDays ?? 60;
  const since = new Date(Date.now() - lookback * 24 * 60 * 60_000).toISOString();

  // ─── Reviews aggregate ────────────────────────────────────────────────
  const { data: scoreRow } = await supabase
    .from("review_scores")
    .select("score_value, score_count, weighted_score")
    .eq("company_id", companyId)
    .eq("entity_type", "employee")
    .eq("entity_id", employeeId)
    .eq("score_type", "overall")
    .maybeSingle();

  const rating = Number(scoreRow?.weighted_score ?? scoreRow?.score_value ?? 0);
  const ratingCount = scoreRow?.score_count ?? 0;

  // ─── Clock-event signals (last `lookback` days) ───────────────────────
  const [arrRes, noShowRes] = await Promise.all([
    supabase
      .from("clock_events")
      .select("punctuality, type")
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .in("type", ["arrival", "clock_in"])
      .gte("created_at", since),
    supabase
      .from("clock_alerts")
      .select("id, type")
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .in("type", ["no_show", "no_show_alert"])
      .gte("created_at", since),
  ]);

  const arrivals = arrRes.data ?? [];
  const noShows = (noShowRes.data ?? []).length;
  const lates = arrivals.filter(a => a.punctuality === "late" || a.punctuality === "very_late").length;
  const onTime = arrivals.filter(a => a.punctuality === "on_time" || a.punctuality === "early").length;
  const completed = arrivals.length;

  // ─── Reliability (capped 0–100) ───────────────────────────────────────
  // Recovery: every 5 perfect arrivals (on_time, no late) adds back 5 pts
  const perfectStreaks = Math.floor(onTime / 5);
  const reliability = Math.max(
    0,
    Math.min(100, 100 - 25 * noShows - 5 * lates + 5 * perfectStreaks),
  );

  // ─── Punctuality % ────────────────────────────────────────────────────
  const punctuality = completed > 0
    ? Math.round((onTime / completed) * 100)
    : 0;

  const composite = composeScore({ reliability, rating, punctuality });

  // ─── Bonus eligibility (read-only flag, NEVER written to payroll) ─────
  const bonusEligible = composite > 90 && noShows === 0;

  return {
    employeeId,
    reliability,
    rating,
    ratingCount,
    punctuality,
    composite,
    shiftsCompleted: completed,
    shiftsNoShow: noShows,
    shiftsLate: lates,
    bonusEligible,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Batch variant — efficient for the Workforce panel and Leaderboard.
 * Does N+1 friendly batched queries (single review_scores fetch + single
 * clock_events fetch with `in()`).
 */
export async function computeWorkforceScoresBatch(
  companyId: string,
  employeeIds: string[],
  lookbackDays = 60,
): Promise<WorkforceScore[]> {
  if (!employeeIds.length) return [];
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60_000).toISOString();

  const [scoresRes, arrRes, noShowRes] = await Promise.all([
    supabase
      .from("review_scores")
      .select("entity_id, score_value, score_count, weighted_score")
      .eq("company_id", companyId)
      .eq("entity_type", "employee")
      .eq("score_type", "overall")
      .in("entity_id", employeeIds),
    supabase
      .from("clock_events")
      .select("employee_id, punctuality, type")
      .eq("company_id", companyId)
      .in("employee_id", employeeIds)
      .in("type", ["arrival", "clock_in"])
      .gte("created_at", since),
    supabase
      .from("clock_alerts")
      .select("employee_id, type")
      .eq("company_id", companyId)
      .in("employee_id", employeeIds)
      .in("type", ["no_show", "no_show_alert"])
      .gte("created_at", since),
  ]);

  const scoreMap = new Map((scoresRes.data ?? []).map(r => [r.entity_id, r]));
  const noShowCount = new Map<string, number>();
  (noShowRes.data ?? []).forEach(r => {
    noShowCount.set(r.employee_id, (noShowCount.get(r.employee_id) ?? 0) + 1);
  });

  type ArrAgg = { onTime: number; late: number; total: number };
  const arrAgg = new Map<string, ArrAgg>();
  (arrRes.data ?? []).forEach(a => {
    const cur = arrAgg.get(a.employee_id) ?? { onTime: 0, late: 0, total: 0 };
    cur.total += 1;
    if (a.punctuality === "on_time" || a.punctuality === "early") cur.onTime += 1;
    if (a.punctuality === "late" || a.punctuality === "very_late") cur.late += 1;
    arrAgg.set(a.employee_id, cur);
  });

  const now = new Date().toISOString();
  return employeeIds.map(id => {
    const sr = scoreMap.get(id);
    const rating = Number(sr?.weighted_score ?? sr?.score_value ?? 0);
    const ratingCount = sr?.score_count ?? 0;
    const a = arrAgg.get(id) ?? { onTime: 0, late: 0, total: 0 };
    const noShows = noShowCount.get(id) ?? 0;
    const perfectStreaks = Math.floor(a.onTime / 5);
    const reliability = Math.max(0, Math.min(100, 100 - 25 * noShows - 5 * a.late + 5 * perfectStreaks));
    const punctuality = a.total > 0 ? Math.round((a.onTime / a.total) * 100) : 0;
    const composite = composeScore({ reliability, rating, punctuality });
    return {
      employeeId: id,
      reliability,
      rating,
      ratingCount,
      punctuality,
      composite,
      shiftsCompleted: a.total,
      shiftsNoShow: noShows,
      shiftsLate: a.late,
      bonusEligible: composite > 90 && noShows === 0,
      computedAt: now,
    };
  });
}
