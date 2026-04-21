/**
 * useLocationTracking — start/stop a real-time location tracking session
 * for the current employee, scoped to a context (typically a shift).
 *
 * Responsibilities:
 *   - Open a `location_sessions` row when tracking begins
 *   - Watch device geolocation and upsert `location_presence`
 *   - Detect geofence enter/exit + arrival_at_job_site against a target site
 *   - Emit `location_events` for the key transitions only (no spam)
 *   - Handle missing permission gracefully — never throw, never block UI
 *   - Auto-stop when context disappears or tab is closed
 *
 * Phase 2 scope: Stafly shifts only. Subject is always `employee`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { distanceMeters } from "@/lib/geo-helpers";
import {
  computeLocationStatus,
  STALE_THRESHOLD_MS,
  type PresenceLite,
  type TargetSite,
} from "@/lib/location-status";

export type TrackingState =
  | "idle"
  | "requesting_permission"
  | "permission_denied"
  | "unsupported"
  | "active"
  | "stopped"
  | "error";

interface Options {
  /** When false, hook is fully inert. Toggle to start/stop tracking. */
  enabled: boolean;
  companyId: string | null;
  /** Subject = the employee being tracked (current user's employee record). */
  employeeId: string | null;
  /** Context this session is bound to. */
  contextType?: "shift" | "job" | "route" | "general";
  contextId?: string | null;
  /** Optional target site to drive geofence/arrival events. */
  target?: TargetSite | null;
  /** Throttle: minimum ms between presence upserts (default 15s). */
  minIntervalMs?: number;
}

interface SessionRef {
  id: string;
  startedAt: number;
  insideGeofence: boolean;
  arrivedAtSite: boolean;
  lastUpsertAt: number;
}

export function useLocationTracking({
  enabled,
  companyId,
  employeeId,
  contextType = "shift",
  contextId = null,
  target = null,
  minIntervalMs = 15_000,
}: Options) {
  const [state, setState] = useState<TrackingState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sessionRef = useRef<SessionRef | null>(null);
  const targetRef = useRef<TargetSite | null>(target);

  // Keep target up to date without restarting watcher
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  const insertEvent = useCallback(
    async (
      type:
        | "tracking_started"
        | "tracking_stopped"
        | "entered_geofence"
        | "exited_geofence"
        | "arrived_job_site"
        | "stale_location",
      lat?: number,
      lng?: number,
      distance?: number,
    ) => {
      if (!sessionRef.current || !employeeId) return;
      try {
        await supabase.from("location_events").insert({
          company_id: companyId,
          session_id: sessionRef.current.id,
          subject_type: "employee",
          subject_id: employeeId,
          event_type: type,
          context_type: contextType,
          context_id: contextId,
          latitude: lat ?? null,
          longitude: lng ?? null,
          distance_meters: distance ?? null,
        } as never);
      } catch (e) {
        console.warn("[useLocationTracking] event insert failed:", e);
      }
    },
    [companyId, employeeId, contextType, contextId],
  );

  const upsertPresence = useCallback(
    async (pos: GeolocationPosition) => {
      if (!sessionRef.current || !employeeId) return;
      const now = Date.now();
      if (now - sessionRef.current.lastUpsertAt < minIntervalMs) return;
      sessionRef.current.lastUpsertAt = now;

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const presencePayload = {
        company_id: companyId,
        subject_type: "employee" as const,
        subject_id: employeeId,
        context_type: contextType,
        context_id: contextId,
        session_id: sessionRef.current.id,
        current_lat: lat,
        current_lng: lng,
        accuracy_meters: pos.coords.accuracy ?? null,
        speed_mps: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
        recorded_at: new Date(pos.timestamp).toISOString(),
        last_seen_at: new Date().toISOString(),
        source: "mobile_app",
        is_active: true,
      };

      const { error } = await supabase
        .from("location_presence")
        .upsert(presencePayload as never, { onConflict: "subject_type,subject_id" });

      if (error) {
        console.warn("[useLocationTracking] presence upsert failed:", error.message);
        return;
      }

      // Geofence / arrival transitions
      const t = targetRef.current;
      if (t?.latitude != null && t?.longitude != null) {
        const dist = distanceMeters(lat, lng, t.latitude, t.longitude);
        const radius = t.geofence_radius_meters ?? null;

        if (radius != null) {
          const inside = dist <= radius;
          if (inside && !sessionRef.current.insideGeofence) {
            sessionRef.current.insideGeofence = true;
            insertEvent("entered_geofence", lat, lng, dist);
          } else if (!inside && sessionRef.current.insideGeofence) {
            sessionRef.current.insideGeofence = false;
            insertEvent("exited_geofence", lat, lng, dist);
          }
        }

        // Arrived at job site = first time within 50m or geofence
        const arrivalThreshold = radius ?? 50;
        if (!sessionRef.current.arrivedAtSite && dist <= arrivalThreshold) {
          sessionRef.current.arrivedAtSite = true;
          insertEvent("arrived_job_site", lat, lng, dist);
        }
      }
    },
    [companyId, employeeId, contextType, contextId, minIntervalMs, insertEvent],
  );

  const stop = useCallback(async () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sessionRef.current) {
      const sid = sessionRef.current.id;
      try {
        await supabase
          .from("location_sessions")
          .update({ status: "stopped", stopped_at: new Date().toISOString() } as never)
          .eq("id", sid);
        await supabase
          .from("location_presence")
          .update({ is_active: false } as never)
          .eq("subject_type", "employee")
          .eq("subject_id", employeeId!);
        await insertEvent("tracking_stopped");
      } catch (e) {
        console.warn("[useLocationTracking] stop failed:", e);
      }
      sessionRef.current = null;
    }
    setState("stopped");
  }, [employeeId, insertEvent]);

  const start = useCallback(async () => {
    if (!employeeId || !companyId) return;
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    setState("requesting_permission");

    // Open session
    const { data: sessionRow, error: sessionErr } = await supabase
      .from("location_sessions")
      .insert({
        company_id: companyId,
        subject_type: "employee",
        subject_id: employeeId,
        context_type: contextType,
        context_id: contextId,
        status: "active",
        source: "mobile_app",
      } as never)
      .select("id")
      .single();

    if (sessionErr || !sessionRow) {
      setState("error");
      setLastError(sessionErr?.message ?? "Could not open tracking session");
      return;
    }

    sessionRef.current = {
      id: (sessionRow as { id: string }).id,
      startedAt: Date.now(),
      insideGeofence: false,
      arrivedAtSite: false,
      lastUpsertAt: 0,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (state !== "active") setState("active");
        upsertPresence(pos);
      },
      (err) => {
        console.warn("[useLocationTracking] geolocation error:", err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setState("permission_denied");
          stop();
        } else {
          setLastError(err.message);
        }
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );

    insertEvent("tracking_started");
    setState("active");
  }, [employeeId, companyId, contextType, contextId, upsertPresence, insertEvent, state, stop]);

  // Auto start/stop on enabled toggle
  useEffect(() => {
    if (!enabled) {
      if (sessionRef.current) stop();
      return;
    }
    if (sessionRef.current || state === "requesting_permission") return;
    start();
    return () => {
      // Cleanup on unmount
      if (sessionRef.current) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, employeeId, companyId, contextId]);

  // Stale watchdog: emit one stale_location event if no upsert in STALE_THRESHOLD
  useEffect(() => {
    if (state !== "active") return;
    const t = setInterval(() => {
      const sess = sessionRef.current;
      if (!sess) return;
      if (Date.now() - sess.lastUpsertAt > STALE_THRESHOLD_MS) {
        insertEvent("stale_location");
      }
    }, STALE_THRESHOLD_MS);
    return () => clearInterval(t);
  }, [state, insertEvent]);

  return { state, lastError, start, stop };
}
