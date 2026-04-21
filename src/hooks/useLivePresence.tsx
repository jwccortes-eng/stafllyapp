/**
 * useLivePresence — subscribes to live `location_presence` rows for a set
 * of subjects (e.g. workers assigned to a shift) and keeps an in-memory
 * map updated via Supabase Realtime.
 *
 * - Initial fetch by subject_ids (always employees in Phase 2)
 * - Realtime: postgres_changes on location_presence filtered by company_id
 * - Returns a Map<subject_id, PresenceRow> + last update timestamp
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PresenceRow {
  id: string;
  company_id: string | null;
  subject_type: "employee" | "shift" | "applicant" | "provider" | "kiosk_device";
  subject_id: string;
  context_type: string | null;
  context_id: string | null;
  current_lat: number;
  current_lng: number;
  accuracy_meters: number | null;
  speed_mps: number | null;
  heading: number | null;
  last_seen_at: string;
  recorded_at: string;
  is_active: boolean;
}

interface Options {
  companyId: string | null;
  /** Restrict realtime to a particular context (e.g. one shift). */
  contextId?: string | null;
  /** Subjects to fetch initially — typically employee ids assigned to the shift. */
  subjectIds: string[];
  enabled?: boolean;
}

export function useLivePresence({
  companyId,
  contextId = null,
  subjectIds,
  enabled = true,
}: Options) {
  const [presenceById, setPresenceById] = useState<Map<string, PresenceRow>>(new Map());
  const [loading, setLoading] = useState(false);
  const subjectIdsRef = useRef<Set<string>>(new Set(subjectIds));

  useEffect(() => {
    subjectIdsRef.current = new Set(subjectIds);
  }, [subjectIds]);

  // Initial fetch
  useEffect(() => {
    if (!enabled || !companyId || subjectIds.length === 0) {
      setPresenceById(new Map());
      return;
    }
    let alive = true;
    setLoading(true);
    supabase
      .from("location_presence")
      .select("*")
      .eq("company_id", companyId)
      .eq("subject_type", "employee")
      .in("subject_id", subjectIds)
      .then(({ data, error }) => {
        if (!alive) return;
        setLoading(false);
        if (error) {
          console.warn("[useLivePresence] initial fetch:", error.message);
          return;
        }
        const next = new Map<string, PresenceRow>();
        for (const row of (data as unknown as PresenceRow[]) ?? []) {
          next.set(row.subject_id, row);
        }
        setPresenceById(next);
      });
    return () => {
      alive = false;
    };
  }, [enabled, companyId, subjectIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription
  useEffect(() => {
    if (!enabled || !companyId) return;
    const channelName = `location_presence:${companyId}:${contextId ?? "all"}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "location_presence",
          filter: `company_id=eq.${companyId}`,
        },
        (payload: { eventType: string; new: PresenceRow | null; old: PresenceRow | null }) => {
          const row = payload.new ?? payload.old;
          if (!row) return;
          // Filter to the subjects we actually care about
          if (!subjectIdsRef.current.has(row.subject_id)) return;
          // Optional context narrowing
          if (contextId && row.context_id && row.context_id !== contextId) return;

          setPresenceById((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              next.delete(row.subject_id);
            } else if (payload.new) {
              next.set(row.subject_id, payload.new);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, companyId, contextId]);

  const lastUpdateAt = useMemo(() => {
    let max = 0;
    for (const row of presenceById.values()) {
      const t = new Date(row.last_seen_at).getTime();
      if (t > max) max = t;
    }
    return max ? new Date(max).toISOString() : null;
  }, [presenceById]);

  return { presenceById, loading, lastUpdateAt };
}
