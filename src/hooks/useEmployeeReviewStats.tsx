import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Aggregate review stats per employee, served from the
 * `employee_review_stats` Postgres view (computed on the fly,
 * no materialization to keep in sync).
 */
export interface EmployeeReviewStats {
  company_id: string;
  employee_id: string;
  total_reviews: number;
  avg_overall_score: number | null;
  avg_punctuality_score: number | null;
  avg_presentation_score: number | null;
  avg_attitude_score: number | null;
  avg_work_quality_score: number | null;
  avg_communication_score: number | null;
  last_review_at: string | null;
  low_score_count_30d: number;
  no_show_flags_90d: number;
}

/** Single-employee variant. Returns null when no reviews exist. */
export function useEmployeeReviewStats(employeeId?: string | null) {
  const [data, setData] = useState<EmployeeReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (supabase.from("employee_review_stats" as any) as any)
      .select("*")
      .eq("employee_id", employeeId)
      .maybeSingle()
      .then(({ data: row }: { data: EmployeeReviewStats | null }) => {
        if (cancelled) return;
        setData(row ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [employeeId]);

  return { data, loading };
}

/** Bulk variant — returns a Map keyed by employee_id for list views. */
export function useEmployeeReviewStatsBulk(
  companyId?: string | null,
  employeeIds?: string[],
) {
  const [map, setMap] = useState<Map<string, EmployeeReviewStats>>(new Map());
  const [loading, setLoading] = useState(false);
  const key = (employeeIds ?? []).join(",");

  useEffect(() => {
    if (!companyId || !employeeIds || employeeIds.length === 0) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    (supabase.from("employee_review_stats" as any) as any)
      .select("*")
      .eq("company_id", companyId)
      .in("employee_id", employeeIds)
      .then(({ data }: { data: EmployeeReviewStats[] | null }) => {
        if (cancelled) return;
        const m = new Map<string, EmployeeReviewStats>();
        (data ?? []).forEach(r => m.set(r.employee_id, r));
        setMap(m);
        setLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, key]);

  return { stats: map, loading };
}

/** Risk classification used by badges & alerts. */
export type ReviewRisk = "none" | "watch" | "at_risk";

export function classifyRisk(s: EmployeeReviewStats | null | undefined): ReviewRisk {
  if (!s || s.total_reviews === 0) return "none";
  if (s.low_score_count_30d >= 2 || s.no_show_flags_90d >= 3) return "at_risk";
  if (
    (s.avg_overall_score !== null && s.avg_overall_score < 3) ||
    s.low_score_count_30d >= 1
  ) return "watch";
  return "none";
}
