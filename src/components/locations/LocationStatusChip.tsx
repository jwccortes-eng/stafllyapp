/**
 * Status chip for a worker / subject's location relative to a target site.
 * Pure presentation — caller computes the status with computeLocationStatus().
 */
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MapPin, AlertTriangle, Clock, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";

export type LocationStatus =
  | "on_site"
  | "en_route"
  | "off_route"
  | "outside_geofence"
  | "stale"
  | "unknown";

interface Props {
  status: LocationStatus;
  lastSeenAt?: string | null;
  distanceMeters?: number | null;
  className?: string;
}

const META: Record<
  LocationStatus,
  { label: string; icon: typeof MapPin; tone: string }
> = {
  on_site: { label: "On site", icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  en_route: { label: "En route", icon: Navigation, tone: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  off_route: { label: "Off route", icon: AlertTriangle, tone: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  outside_geofence: { label: "Outside geofence", icon: AlertTriangle, tone: "bg-red-500/10 text-red-700 border-red-500/20" },
  stale: { label: "Stale", icon: Clock, tone: "bg-muted text-muted-foreground border-border" },
  unknown: { label: "Unknown", icon: MapPin, tone: "bg-muted text-muted-foreground border-border" },
};

export default function LocationStatusChip({
  status,
  lastSeenAt,
  distanceMeters,
  className,
}: Props) {
  const m = META[status];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-[10px] font-semibold", m.tone, className)}>
      <Icon className="h-3 w-3" />
      <span>{m.label}</span>
      {distanceMeters != null && (
        <span className="font-mono opacity-75">· {Math.round(distanceMeters)}m</span>
      )}
      {lastSeenAt && status === "stale" && (
        <span className="opacity-75">· {new Date(lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      )}
    </Badge>
  );
}

/**
 * Compute live status given current position, target, and timing.
 */
export function computeLocationStatus(args: {
  currentLat: number | null;
  currentLng: number | null;
  targetLat: number | null;
  targetLng: number | null;
  geofenceMeters?: number | null;
  lastSeenAt?: string | null;
  staleAfterMinutes?: number;
}): { status: LocationStatus; distanceMeters: number | null } {
  const {
    currentLat, currentLng, targetLat, targetLng,
    geofenceMeters = 100, lastSeenAt, staleAfterMinutes = 5,
  } = args;

  if (currentLat == null || currentLng == null) {
    return { status: "unknown", distanceMeters: null };
  }

  if (lastSeenAt) {
    const ageMin = (Date.now() - new Date(lastSeenAt).getTime()) / 60000;
    if (ageMin > staleAfterMinutes) return { status: "stale", distanceMeters: null };
  }

  if (targetLat == null || targetLng == null) {
    return { status: "en_route", distanceMeters: null };
  }

  // Haversine
  const R = 6371000;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(targetLat - currentLat);
  const dLng = toRad(targetLng - currentLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(currentLat)) * Math.cos(toRad(targetLat)) * Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const fence = geofenceMeters && geofenceMeters > 0 ? geofenceMeters : 100;

  if (dist <= fence) return { status: "on_site", distanceMeters: dist };
  if (dist <= fence * 5) return { status: "en_route", distanceMeters: dist };
  if (dist <= fence * 20) return { status: "off_route", distanceMeters: dist };
  return { status: "outside_geofence", distanceMeters: dist };
}
