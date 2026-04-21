/**
 * useShiftLiveMap — orchestrator hook combining:
 *   - workers assigned to a given shift
 *   - their live presence (`location_presence` via realtime)
 *   - the target site (`job_site_location_id` → `locations_v2`)
 *   - per-worker derived status (on_site / en_route / stale / ...)
 *
 * Returns a single dataset ready for `<LiveMapCanvas />`.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLivePresence, type PresenceRow } from "@/hooks/useLivePresence";
import { fetchLocationById, type LocationV2 } from "@/hooks/useLocationsV2";
import {
  computeLocationStatus,
  type LocationStatusResult,
  type TargetSite,
} from "@/lib/location-status";

export interface ShiftLiveWorker {
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  presence: PresenceRow | null;
  status: LocationStatusResult;
}

interface Options {
  shiftId: string | null;
  companyId: string | null;
  enabled?: boolean;
}

interface ShiftSnapshot {
  id: string;
  company_id: string;
  job_site_location_id: string | null;
  meeting_point_location_id: string | null;
}

export function useShiftLiveMap({ shiftId, companyId, enabled = true }: Options) {
  const [shift, setShift] = useState<ShiftSnapshot | null>(null);
  const [assignedEmployees, setAssignedEmployees] = useState<
    { employee_id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }[]
  >([]);
  const [jobSite, setJobSite] = useState<LocationV2 | null>(null);
  const [meetingPoint, setMeetingPoint] = useState<LocationV2 | null>(null);
  const [loading, setLoading] = useState(false);

  // Load shift + assignments + target sites
  useEffect(() => {
    if (!enabled || !shiftId || !companyId) {
      setShift(null);
      setAssignedEmployees([]);
      setJobSite(null);
      setMeetingPoint(null);
      return;
    }
    let alive = true;
    setLoading(true);

    (async () => {
      const { data: shiftRow } = await supabase
        .from("scheduled_shifts")
        .select("id, company_id, job_site_location_id, meeting_point_location_id")
        .eq("id", shiftId)
        .maybeSingle();

      if (!alive) return;
      const snapshot = (shiftRow ?? null) as ShiftSnapshot | null;
      setShift(snapshot);

      // Assignments (excluding rejected/removed)
      const { data: assigns } = await supabase
        .from("shift_assignments")
        .select(
          "employee_id, status, employees!inner ( id, first_name, last_name, avatar_url )",
        )
        .eq("shift_id", shiftId)
        .not("status", "in", "(rejected,removed)");
      if (!alive) return;

      const workers = ((assigns as unknown as Array<{
        employee_id: string;
        employees: { first_name: string | null; last_name: string | null; avatar_url: string | null };
      }>) ?? []).map((a) => ({
        employee_id: a.employee_id,
        first_name: a.employees?.first_name ?? null,
        last_name: a.employees?.last_name ?? null,
        avatar_url: a.employees?.avatar_url ?? null,
      }));
      setAssignedEmployees(workers);

      // Resolve target sites in parallel
      const [js, mp] = await Promise.all([
        snapshot?.job_site_location_id ? fetchLocationById(snapshot.job_site_location_id) : Promise.resolve(null),
        snapshot?.meeting_point_location_id ? fetchLocationById(snapshot.meeting_point_location_id) : Promise.resolve(null),
      ]);
      if (!alive) return;
      setJobSite(js);
      setMeetingPoint(mp);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [enabled, shiftId, companyId]);

  const subjectIds = useMemo(() => assignedEmployees.map((w) => w.employee_id), [assignedEmployees]);

  const { presenceById, lastUpdateAt } = useLivePresence({
    companyId,
    contextId: shiftId,
    subjectIds,
    enabled: enabled && subjectIds.length > 0,
  });

  const target: TargetSite | null = useMemo(() => {
    const site = jobSite ?? meetingPoint;
    if (!site || site.latitude == null || site.longitude == null) return null;
    return {
      latitude: site.latitude,
      longitude: site.longitude,
      geofence_radius_meters: site.geofence_radius_meters,
    };
  }, [jobSite, meetingPoint]);

  const workers: ShiftLiveWorker[] = useMemo(() => {
    return assignedEmployees.map((w) => {
      const presence = presenceById.get(w.employee_id) ?? null;
      const status = computeLocationStatus(presence, target);
      return { ...w, presence, status };
    });
  }, [assignedEmployees, presenceById, target]);

  // Quick stats for the header strip
  const stats = useMemo(() => {
    const acc = { on_site: 0, en_route: 0, stale: 0, off_route: 0, unknown: 0, outside_geofence: 0 } as Record<string, number>;
    for (const w of workers) acc[w.status.status]++;
    return acc;
  }, [workers]);

  return {
    loading,
    workers,
    jobSite,
    meetingPoint,
    target,
    stats,
    lastUpdateAt,
  };
}
