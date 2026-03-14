import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type RepScore = Database["public"]["Tables"]["rep_scores"]["Row"];
type RepEvent = Database["public"]["Tables"]["rep_events"]["Row"];
type RepBadge = Database["public"]["Tables"]["rep_badges"]["Row"];
type RepWorkerBadge = Database["public"]["Tables"]["rep_worker_badges"]["Row"];

export interface ReputationData {
  score: RepScore | null;
  recentEvents: RepEvent[];
  badges: (RepWorkerBadge & { badge?: RepBadge })[];
}

interface UseReputationOptions {
  workerProfileId?: string;
}

export function useReputation(options: UseReputationOptions = {}) {
  const [data, setData] = useState<ReputationData>({ score: null, recentEvents: [], badges: [] });
  const [loading, setLoading] = useState(true);

  const fetchReputation = useCallback(async () => {
    if (!options.workerProfileId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [scoreRes, eventsRes, badgesRes] = await Promise.all([
      supabase
        .from("rep_scores")
        .select("*")
        .eq("worker_profile_id", options.workerProfileId)
        .maybeSingle(),
      supabase
        .from("rep_events")
        .select("*")
        .eq("worker_profile_id", options.workerProfileId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("rep_worker_badges")
        .select("*, rep_badges(*)")
        .eq("worker_profile_id", options.workerProfileId)
        .order("earned_at", { ascending: false }),
    ]);

    setData({
      score: scoreRes.data ?? null,
      recentEvents: eventsRes.data ?? [],
      badges: (badgesRes.data ?? []) as any,
    });

    setLoading(false);
  }, [options.workerProfileId]);

  useEffect(() => {
    fetchReputation();
  }, [fetchReputation]);

  /** Record a reputation event — score is recalculated automatically by DB trigger */
  const recordEvent = async (event: {
    source: string;
    source_entity_id?: string;
    category: string;
    delta: number;
    weight?: number;
    note?: string;
  }) => {
    if (!options.workerProfileId) return;

    const { error } = await supabase
      .from("rep_events")
      .insert({
        worker_profile_id: options.workerProfileId,
        source: event.source,
        source_entity_id: event.source_entity_id,
        category: event.category,
        delta: event.delta,
        weight: event.weight ?? 1,
        note: event.note,
      } as any);

    if (error) return error;

    // Refetch — DB trigger already recalculated rep_scores
    await fetchReputation();
    return null;
  };

  /** Award a badge to the worker */
  const awardBadge = async (badgeId: string) => {
    if (!options.workerProfileId) return;
    const { error } = await supabase
      .from("rep_worker_badges")
      .insert({
        worker_profile_id: options.workerProfileId,
        badge_id: badgeId,
      } as any);
    if (!error) await fetchReputation();
    return error;
  };

  return {
    ...data,
    loading,
    refetch: fetchReputation,
    recordEvent,
    awardBadge,
  };
}
