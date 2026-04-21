/**
 * ShiftLiveMapPanel — drop-in panel that shows the LiveMapCanvas
 * for a given shift, plus a small enable-tracking control for the
 * current user when they belong to the shift.
 *
 * This is the first integration of the real-time location infra in
 * Stafly. Safe to mount inside ShiftDetailDialog or a dedicated tab.
 */
import { useMemo, useState } from "react";
import { useShiftLiveMap } from "@/hooks/useShiftLiveMap";
import { useLocationTracking } from "@/hooks/useLocationTracking";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import LiveMapCanvas from "@/components/locations/LiveMapCanvas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin, Navigation, MapPinOff, ArrowRight } from "lucide-react";

interface Props {
  shiftId: string;
  companyId: string;
  /** Whether the shift is in a state where tracking is meaningful. */
  isActiveShift?: boolean;
  /** Whether the current user can edit the shift (controls Set job site CTA). */
  canEdit?: boolean;
  /** Triggered when admin clicks "Set job site" — should open ShiftEditDialog focused on Location & Arrival. */
  onSetJobSite?: () => void;
}

export default function ShiftLiveMapPanel({
  shiftId,
  companyId,
  isActiveShift = true,
  canEdit = false,
  onSetJobSite,
}: Props) {
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const { workers, target, jobSite, meetingPoint, lastUpdateAt, loading, stats } = useShiftLiveMap({
    shiftId,
    companyId,
  });

  // Worker is part of this shift?
  const isAssignedHere = useMemo(
    () => !!effectiveEmployeeId && workers.some((w) => w.employee_id === effectiveEmployeeId),
    [workers, effectiveEmployeeId],
  );

  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const tracking = useLocationTracking({
    enabled: trackingEnabled && isActiveShift,
    companyId,
    employeeId: effectiveEmployeeId,
    contextType: "shift",
    contextId: shiftId,
    target,
  });

  const targetSite = jobSite ?? meetingPoint;
  const targetLabel = jobSite ? "Job site" : meetingPoint ? "Meeting point" : "Target";

  return (
    <div className="space-y-3">
      {/* Enable tracking strip — only for assigned workers */}
      {isAssignedHere && (
        <div className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Navigation className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold">Share my live location</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {tracking.state === "active" && "Sharing — visible to your team."}
                {tracking.state === "permission_denied" && "Permission denied. Enable GPS in your browser."}
                {tracking.state === "unsupported" && "GPS not supported on this device."}
                {tracking.state === "idle" && "Off — admins won't see you on the map."}
                {tracking.state === "stopped" && "Stopped sharing."}
                {tracking.state === "error" && (tracking.lastError ?? "Could not start tracking.")}
                {tracking.state === "requesting_permission" && "Requesting permission…"}
              </div>
            </div>
          </div>
          <Button
            variant={trackingEnabled ? "secondary" : "default"}
            size="sm"
            className="h-8 text-[11px] shrink-0"
            onClick={() => setTrackingEnabled((v) => !v)}
            disabled={!isActiveShift || tracking.state === "unsupported"}
          >
            {trackingEnabled ? "Stop sharing" : "Start sharing"}
          </Button>
        </div>
      )}

      {/* Stats strip */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="secondary" className="text-[10px]">
          On site · {stats.on_site}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          En route · {stats.en_route}
        </Badge>
        {stats.stale > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> Stale · {stats.stale}
          </Badge>
        )}
        {stats.outside_geofence > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            Outside geofence · {stats.outside_geofence}
          </Badge>
        )}
        {!targetSite && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <MapPin className="h-2.5 w-2.5" /> No job site set
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="h-64 rounded-xl border bg-muted/30 animate-pulse" />
      ) : (
        <LiveMapCanvas
          workers={workers}
          target={target}
          targetLabel={targetLabel}
          jobSite={
            jobSite && jobSite.latitude != null && jobSite.longitude != null
              ? {
                  latitude: jobSite.latitude,
                  longitude: jobSite.longitude,
                  geofence_radius_meters: jobSite.geofence_radius_meters ?? null,
                }
              : null
          }
          jobSiteName={jobSite?.name ?? jobSite?.formatted_address ?? null}
          meetingPoint={
            meetingPoint && meetingPoint.latitude != null && meetingPoint.longitude != null
              ? {
                  latitude: meetingPoint.latitude,
                  longitude: meetingPoint.longitude,
                  geofence_radius_meters: meetingPoint.geofence_radius_meters ?? null,
                }
              : null
          }
          meetingPointName={meetingPoint?.name ?? meetingPoint?.formatted_address ?? null}
          lastUpdateAt={lastUpdateAt}
        />
      )}
    </div>
  );
}
