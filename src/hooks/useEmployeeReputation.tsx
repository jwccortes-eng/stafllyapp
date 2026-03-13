import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ─── Badge definitions ─── */
export const BADGE_DEFS: Record<string, { emoji: string; label: string; desc: string }> = {
  top_performer:    { emoji: "🏆", label: "Top Performer",       desc: "Score de desempeño ≥ 90" },
  customer_fav:     { emoji: "⭐", label: "Customer Favorite",   desc: "Rating promedio ≥ 4.8" },
  always_on_time:   { emoji: "⏰", label: "Always On Time",      desc: "Puntualidad ≥ 4.5 en reseñas" },
  fast_worker:      { emoji: "⚡", label: "Fast Worker",         desc: "Productividad ≥ 4.5 en reseñas" },
  team_player:      { emoji: "🤝", label: "Team Player",         desc: "Trabajo en equipo ≥ 4.5" },
  shifts_50:        { emoji: "🎯", label: "50 Shifts",           desc: "50 turnos completados" },
  shifts_100:       { emoji: "💯", label: "100 Shifts",          desc: "100 turnos completados" },
  reliable:         { emoji: "🛡️", label: "Reliable",            desc: "Trust Score ≥ 95%" },
};

/* ─── Employee level ─── */
export type EmployeeLevel = "new" | "bronze" | "silver" | "gold" | "elite";

export function getLevel(reputationScore: number, shiftsCompleted: number): EmployeeLevel {
  if (shiftsCompleted < 10) return "new";
  if (reputationScore >= 95) return "elite";
  if (reputationScore >= 85) return "gold";
  if (reputationScore >= 70) return "silver";
  if (reputationScore >= 60) return "bronze";
  return "new";
}

export const LEVEL_CONFIG: Record<EmployeeLevel, { label: string; color: string; emoji: string }> = {
  new:    { label: "New Worker", color: "text-muted-foreground", emoji: "🆕" },
  bronze: { label: "Bronze",    color: "text-amber-700",        emoji: "🥉" },
  silver: { label: "Silver",    color: "text-slate-400",        emoji: "🥈" },
  gold:   { label: "Gold",      color: "text-amber-400",        emoji: "🥇" },
  elite:  { label: "Elite",     color: "text-primary",          emoji: "💎" },
};

/* ─── Trust Score calculation ─── */
export interface TrustData {
  trustScore: number;
  geofenceCompliance: number;
  clockAccuracy: number;
  cancellationRate: number;
  shiftsCompleted: number;
}

export async function calcTrustScore(employeeId: string, companyId: string): Promise<TrustData> {
  // Shifts completed (last 90 days)
  const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { count: totalAssigned } = await supabase
    .from("shift_assignments")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .gte("created_at", ninetyAgo);

  const { count: completed } = await supabase
    .from("shift_assignments")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("status", "confirmed")
    .gte("created_at", ninetyAgo);

  const { count: cancelled } = await supabase
    .from("shift_assignments")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .in("status", ["rejected", "removed"])
    .gte("created_at", ninetyAgo);

  // Geofence alerts
  const { count: geofenceAlerts } = await supabase
    .from("clock_alerts")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("type", "OUTSIDE_GEOFENCE")
    .gte("created_at", ninetyAgo);

  // Clock events count (for accuracy baseline)
  const { count: clockEvents } = await supabase
    .from("clock_events")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .gte("created_at", ninetyAgo);

  const total = totalAssigned ?? 1;
  const comp = completed ?? 0;
  const canc = cancelled ?? 0;
  const geoAlerts = geofenceAlerts ?? 0;
  const clocks = clockEvents ?? 1;

  const cancellationRate = total > 0 ? (canc / total) * 100 : 0;
  const geofenceCompliance = clocks > 0 ? Math.max(0, 100 - (geoAlerts / clocks) * 100) : 100;
  const clockAccuracy = clocks > 0 ? Math.min(100, (comp / Math.max(total, 1)) * 100) : 100;

  // Weighted trust score
  const trustScore = Math.round(
    geofenceCompliance * 0.30 +
    clockAccuracy * 0.30 +
    (100 - cancellationRate) * 0.25 +
    Math.min(comp, 100) * 0.15
  );

  return {
    trustScore: Math.min(100, Math.max(0, trustScore)),
    geofenceCompliance: Math.round(geofenceCompliance),
    clockAccuracy: Math.round(clockAccuracy),
    cancellationRate: Math.round(cancellationRate),
    shiftsCompleted: comp,
  };
}

/* ─── Reputation Score (0-100) ─── */
export async function calcReputationScore(
  employeeId: string,
  companyId: string
): Promise<{ reputationScore: number; reviewAvg: number; trustScore: number; shiftsCompleted: number }> {
  // Reviews average
  const { data: reviews } = await supabase
    .from("shift_reviews")
    .select("overall_rating")
    .eq("reviewed_employee_id", employeeId)
    .eq("reviewer_type", "manager");

  const reviewAvg = reviews?.length
    ? reviews.reduce((s, r) => s + Number(r.overall_rating), 0) / reviews.length
    : 0;

  const trust = await calcTrustScore(employeeId, companyId);

  // Weighted reputation: reviews 40%, trust 30%, completion 20%, experience 10%
  const reviewComponent = reviewAvg > 0 ? (reviewAvg / 5) * 100 * 0.40 : 0;
  const trustComponent = trust.trustScore * 0.30;
  const completionComponent = Math.min(trust.shiftsCompleted, 100) * 0.20;
  const experienceComponent = Math.min(trust.shiftsCompleted / 2, 100) * 0.10;

  const reputationScore = Math.round(
    reviewComponent + trustComponent + completionComponent + experienceComponent
  );

  return {
    reputationScore: Math.min(100, Math.max(0, reputationScore)),
    reviewAvg: Math.round(reviewAvg * 10) / 10,
    trustScore: trust.trustScore,
    shiftsCompleted: trust.shiftsCompleted,
  };
}

/* ─── Auto-badge evaluation ─── */
export async function evaluateAndAwardBadges(
  employeeId: string,
  companyId: string
): Promise<string[]> {
  const awarded: string[] = [];

  const rep = await calcReputationScore(employeeId, companyId);
  const trust = await calcTrustScore(employeeId, companyId);

  // Reviews data
  const { data: reviews } = await supabase
    .from("shift_reviews")
    .select("rating_punctuality, rating_productivity, rating_teamwork, overall_rating")
    .eq("reviewed_employee_id", employeeId)
    .eq("reviewer_type", "manager");

  const n = reviews?.length ?? 0;
  const avg = (key: string) => n > 0 ? reviews!.reduce((s, r) => s + (Number((r as any)[key]) || 0), 0) / n : 0;

  // Evaluate badges
  const checks: [string, boolean][] = [
    ["top_performer", rep.reputationScore >= 90],
    ["customer_fav", rep.reviewAvg >= 4.8 && n >= 5],
    ["always_on_time", avg("rating_punctuality") >= 4.5 && n >= 3],
    ["fast_worker", avg("rating_productivity") >= 4.5 && n >= 3],
    ["team_player", avg("rating_teamwork") >= 4.5 && n >= 3],
    ["shifts_50", trust.shiftsCompleted >= 50],
    ["shifts_100", trust.shiftsCompleted >= 100],
    ["reliable", trust.trustScore >= 95],
  ];

  for (const [key, earned] of checks) {
    if (earned) {
      const def = BADGE_DEFS[key];
      const { error } = await supabase.from("employee_badges").upsert(
        { employee_id: employeeId, company_id: companyId, badge_key: key, badge_label: def.label, badge_emoji: def.emoji },
        { onConflict: "employee_id,badge_key" }
      );
      if (!error) awarded.push(key);
    }
  }

  return awarded;
}

/* ─── Hook for loading reputation data ─── */
export interface FullReputationData {
  reputationScore: number;
  reviewAvg: number;
  trustScore: number;
  shiftsCompleted: number;
  level: EmployeeLevel;
  badges: { badge_key: string; badge_label: string; badge_emoji: string; earned_at: string }[];
  loading: boolean;
}

export function useEmployeeReputation(employeeId: string | undefined, companyId: string | undefined): FullReputationData {
  const [data, setData] = useState<FullReputationData>({
    reputationScore: 0, reviewAvg: 0, trustScore: 0, shiftsCompleted: 0,
    level: "new", badges: [], loading: true,
  });

  useEffect(() => {
    if (!employeeId || !companyId) return;
    let cancelled = false;

    (async () => {
      const rep = await calcReputationScore(employeeId, companyId);
      const level = getLevel(rep.reputationScore, rep.shiftsCompleted);

      // Load badges
      const { data: badges } = await supabase
        .from("employee_badges")
        .select("badge_key, badge_label, badge_emoji, earned_at")
        .eq("employee_id", employeeId)
        .order("earned_at", { ascending: false });

      if (!cancelled) {
        setData({
          ...rep,
          level,
          badges: (badges as any[]) ?? [],
          loading: false,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [employeeId, companyId]);

  return data;
}
