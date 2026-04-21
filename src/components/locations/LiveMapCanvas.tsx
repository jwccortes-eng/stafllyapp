/**
 * LiveMapCanvas — premium live map for a set of workers + a target site.
 * Uses Leaflet (already in deps) so we stay map-provider neutral.
 *
 * Features:
 *   - Worker pins colored by computed status
 *   - Optional target site marker + geofence circle
 *   - Auto-fit bounds
 *   - Compact filter chips (status filter)
 *   - LocationStatusChip in popups
 *
 * Pure presentation: data comes from `useShiftLiveMap` (or any caller).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Users, MapPin, RefreshCcw } from "lucide-react";
import LocationStatusChip, { type LocationStatus } from "@/components/locations/LocationStatusChip";
import type { ShiftLiveWorker } from "@/hooks/useShiftLiveMap";

interface Props {
  workers: ShiftLiveWorker[];
  target: { latitude: number; longitude: number; geofence_radius_meters: number | null } | null;
  targetLabel?: string;
  lastUpdateAt: string | null;
  onRefresh?: () => void;
  className?: string;
  height?: number;
}

const STATUS_COLOR: Record<LocationStatus, string> = {
  on_site: "#10b981",        // emerald
  en_route: "#3b82f6",       // blue
  off_route: "#f59e0b",      // amber
  outside_geofence: "#ef4444", // red
  stale: "#9ca3af",          // gray
  unknown: "#6b7280",        // dark gray
};

const STATUS_ORDER: LocationStatus[] = [
  "on_site",
  "en_route",
  "outside_geofence",
  "off_route",
  "stale",
  "unknown",
];

function makeWorkerIcon(status: LocationStatus, label: string) {
  const color = STATUS_COLOR[status];
  return L.divIcon({
    className: "live-map-pin",
    html: `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid white;
        box-shadow: 0 4px 10px rgba(0,0,0,0.25);
        display:flex;
        align-items:center;
        justify-content:center;
        color:white;
        font-weight:700;
        font-size:11px;
      ">${label}</div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function makeTargetIcon() {
  return L.divIcon({
    className: "live-map-target",
    html: `
      <div style="
        width:18px;height:18px;border-radius:50%;
        background:hsl(var(--primary));
        border:3px solid white;
        box-shadow:0 0 0 4px hsla(var(--primary),0.18);
      "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function initials(first: string | null, last: string | null) {
  const a = first?.[0] ?? "?";
  const b = last?.[0] ?? "";
  return (a + b).toUpperCase();
}

export default function LiveMapCanvas({
  workers,
  target,
  targetLabel = "Job site",
  lastUpdateAt,
  onRefresh,
  className,
  height = 360,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [statusFilter, setStatusFilter] = useState<LocationStatus | "all">("all");

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([0, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  const filteredWorkers = useMemo(() => {
    if (statusFilter === "all") return workers;
    return workers.filter((w) => w.status.status === statusFilter);
  }, [workers, statusFilter]);

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds = L.latLngBounds([]);

    if (target) {
      const t = L.latLng(target.latitude, target.longitude);
      L.marker(t, { icon: makeTargetIcon() })
        .bindPopup(`<strong>${targetLabel}</strong>`)
        .addTo(layer);
      bounds.extend(t);
      if (target.geofence_radius_meters && target.geofence_radius_meters > 0) {
        L.circle(t, {
          radius: target.geofence_radius_meters,
          color: "hsl(var(--primary))",
          weight: 1.5,
          fillColor: "hsl(var(--primary))",
          fillOpacity: 0.08,
        }).addTo(layer);
      }
    }

    for (const w of filteredWorkers) {
      if (!w.presence) continue;
      const ll = L.latLng(w.presence.current_lat, w.presence.current_lng);
      const marker = L.marker(ll, {
        icon: makeWorkerIcon(w.status.status, initials(w.first_name, w.last_name)),
      });
      marker.bindPopup(
        `<div style="min-width:160px">
          <div style="font-weight:700;margin-bottom:4px">
            ${(w.first_name ?? "") + " " + (w.last_name ?? "")}
          </div>
          <div style="font-size:11px;color:#6b7280">
            ${w.status.status.replace("_", " ")}${
              w.status.distance_m != null ? ` · ${Math.round(w.status.distance_m)}m` : ""
            }
          </div>
          <div style="font-size:10px;color:#9ca3af;margin-top:2px">
            Last seen: ${new Date(w.presence.last_seen_at).toLocaleTimeString()}
          </div>
        </div>`,
      );
      marker.addTo(layer);
      bounds.extend(ll);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [filteredWorkers, target, targetLabel]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: workers.length };
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const w of workers) c[w.status.status] = (c[w.status.status] ?? 0) + 1;
    return c;
  }, [workers]);

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Live presence</span>
          <Badge variant="secondary" className="text-[10px]">{workers.length} workers</Badge>
          {lastUpdateAt && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              · updated {new Date(lastUpdateAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        {onRefresh && (
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onRefresh}>
            <RefreshCcw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 px-3 py-2 border-b overflow-x-auto">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={cn(
            "text-[10px] px-2 py-1 rounded-full border transition-colors whitespace-nowrap",
            statusFilter === "all"
              ? "bg-primary/10 border-primary/40 text-primary"
              : "border-border/40 text-muted-foreground hover:bg-muted",
          )}
        >
          All · {counts.all}
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              "text-[10px] px-2 py-1 rounded-full border transition-colors whitespace-nowrap",
              statusFilter === s
                ? "bg-primary/10 border-primary/40 text-primary"
                : "border-border/40 text-muted-foreground hover:bg-muted",
            )}
          >
            <span
              className="inline-block h-2 w-2 rounded-full mr-1 align-middle"
              style={{ background: STATUS_COLOR[s] }}
            />
            {s.replace("_", " ")} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      {/* Map */}
      <div ref={containerRef} style={{ height }} className="w-full bg-muted/40" />

      {/* Empty state overlay (when no presence) */}
      {workers.every((w) => !w.presence) && (
        <div className="px-3 py-3 border-t bg-muted/20 text-[11px] text-muted-foreground flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" />
          No live locations yet. Workers must enable tracking from their portal.
        </div>
      )}

      {/* Worker list (compact) */}
      {filteredWorkers.length > 0 && (
        <div className="border-t max-h-44 overflow-y-auto divide-y divide-border/40">
          {filteredWorkers.map((w) => (
            <div key={w.employee_id} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: STATUS_COLOR[w.status.status] }}
                />
                <span className="font-semibold truncate">
                  {w.first_name} {w.last_name}
                </span>
              </div>
              <LocationStatusChip
                status={w.status.status}
                distanceMeters={w.status.distance_m}
                lastSeenAt={w.presence?.last_seen_at}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
