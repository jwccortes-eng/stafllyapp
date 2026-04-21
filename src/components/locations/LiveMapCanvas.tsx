/**
 * LiveMapCanvas — premium operational live map for a shift's workers.
 *
 * What's new in this version (Phase 2.1 — operational):
 *   - Dual venue support: job_site + meeting_point pins & geofences
 *   - Side roster with avatars, status chip, distance, last-seen
 *   - Click on a worker → fly to + open popup
 *   - "Fit all" / "Recenter venue" controls
 *   - Status filter chips with live counts
 *   - Dense empty states (no presence / no venue / tracking off)
 *
 * Pure presentation. Data comes from `useShiftLiveMap`.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users, MapPin, RefreshCcw, Crosshair, Maximize2, Navigation, Flag,
  Search, AlertTriangle,
} from "lucide-react";
import LocationStatusChip, { type LocationStatus } from "@/components/locations/LocationStatusChip";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import type { ShiftLiveWorker } from "@/hooks/useShiftLiveMap";

interface VenuePoint {
  latitude: number;
  longitude: number;
  geofence_radius_meters: number | null;
}

interface Props {
  workers: ShiftLiveWorker[];
  /** Primary target — job site if available, else meeting point. Used by status engine. */
  target: VenuePoint | null;
  targetLabel?: string;
  /** Always render job site venue marker (if present). */
  jobSite?: VenuePoint | null;
  jobSiteName?: string | null;
  /** Always render meeting point marker (if present). */
  meetingPoint?: VenuePoint | null;
  meetingPointName?: string | null;
  lastUpdateAt: string | null;
  onRefresh?: () => void;
  className?: string;
  height?: number;
}

const STATUS_COLOR: Record<LocationStatus, string> = {
  on_site: "#10b981",
  en_route: "#3b82f6",
  off_route: "#f59e0b",
  outside_geofence: "#ef4444",
  stale: "#9ca3af",
  unknown: "#6b7280",
};

const STATUS_ORDER: LocationStatus[] = [
  "on_site",
  "en_route",
  "outside_geofence",
  "off_route",
  "stale",
  "unknown",
];

const STATUS_LABEL: Record<LocationStatus, string> = {
  on_site: "On site",
  en_route: "En route",
  off_route: "Off route",
  outside_geofence: "Outside",
  stale: "Stale",
  unknown: "Unknown",
};

function makeWorkerIcon(status: LocationStatus, label: string) {
  const color = STATUS_COLOR[status];
  return L.divIcon({
    className: "live-map-pin",
    html: `
      <div style="
        position: relative;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid white;
        box-shadow: 0 6px 14px rgba(0,0,0,0.28);
        display:flex;
        align-items:center;
        justify-content:center;
        color:white;
        font-weight:700;
        font-size:11px;
        letter-spacing:0.3px;
      ">${label}</div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function makeVenueIcon(kind: "job_site" | "meeting_point") {
  const isJob = kind === "job_site";
  const fill = isJob ? "hsl(var(--primary))" : "#7c3aed";
  const ring = isJob ? "hsla(var(--primary),0.18)" : "rgba(124,58,237,0.18)";
  const inner = isJob ? "F" : "M"; // Flag / Meeting
  return L.divIcon({
    className: "live-map-venue",
    html: `
      <div style="
        position:relative;
        width:24px;height:24px;border-radius:50%;
        background:${fill};
        color:white;
        font-weight:800;
        font-size:11px;
        display:flex;align-items:center;justify-content:center;
        border:3px solid white;
        box-shadow:0 0 0 6px ${ring}, 0 4px 10px rgba(0,0,0,0.25);
      ">${inner}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function initials(first: string | null, last: string | null) {
  const a = first?.[0] ?? "?";
  const b = last?.[0] ?? "";
  return (a + b).toUpperCase();
}

function fmtDistance(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function LiveMapCanvas({
  workers,
  target,
  targetLabel = "Job site",
  jobSite = null,
  jobSiteName = null,
  meetingPoint = null,
  meetingPointName = null,
  lastUpdateAt,
  onRefresh,
  className,
  height = 420,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const workerMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const [statusFilter, setStatusFilter] = useState<LocationStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [activeWorkerId, setActiveWorkerId] = useState<string | null>(null);

  // ── Init map once ──
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
      workerMarkersRef.current.clear();
    };
  }, []);

  // ── Filtering / search ──
  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (statusFilter !== "all" && w.status.status !== statusFilter) return false;
      if (q) {
        const full = `${w.first_name ?? ""} ${w.last_name ?? ""}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [workers, statusFilter, search]);

  // ── Bounds helper (workers + venues) ──
  const computeBounds = useCallback(
    (set: ShiftLiveWorker[]): L.LatLngBounds => {
      const bounds = L.latLngBounds([]);
      if (jobSite) bounds.extend(L.latLng(jobSite.latitude, jobSite.longitude));
      if (meetingPoint) bounds.extend(L.latLng(meetingPoint.latitude, meetingPoint.longitude));
      for (const w of set) {
        if (w.presence) bounds.extend(L.latLng(w.presence.current_lat, w.presence.current_lng));
      }
      return bounds;
    },
    [jobSite, meetingPoint],
  );

  // ── Render markers ──
  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    workerMarkersRef.current.clear();

    // Venues
    const renderVenue = (
      v: VenuePoint | null,
      kind: "job_site" | "meeting_point",
      name: string | null,
    ) => {
      if (!v) return;
      const ll = L.latLng(v.latitude, v.longitude);
      L.marker(ll, { icon: makeVenueIcon(kind) })
        .bindPopup(
          `<div style="min-width:160px">
            <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">
              ${kind === "job_site" ? "Job site" : "Meeting point"}
            </div>
            <div style="font-weight:700;margin-top:2px">${name ?? "—"}</div>
            ${v.geofence_radius_meters ? `<div style="font-size:11px;color:#6b7280;margin-top:4px">Geofence: ${v.geofence_radius_meters}m</div>` : ""}
          </div>`,
        )
        .addTo(layer);
      if (v.geofence_radius_meters && v.geofence_radius_meters > 0) {
        L.circle(ll, {
          radius: v.geofence_radius_meters,
          color: kind === "job_site" ? "hsl(var(--primary))" : "#7c3aed",
          weight: 1.5,
          fillColor: kind === "job_site" ? "hsl(var(--primary))" : "#7c3aed",
          fillOpacity: 0.06,
        }).addTo(layer);
      }
    };
    renderVenue(jobSite, "job_site", jobSiteName);
    renderVenue(meetingPoint, "meeting_point", meetingPointName);

    // Workers
    for (const w of filteredWorkers) {
      if (!w.presence) continue;
      const ll = L.latLng(w.presence.current_lat, w.presence.current_lng);
      const marker = L.marker(ll, {
        icon: makeWorkerIcon(w.status.status, initials(w.first_name, w.last_name)),
      });
      marker.bindPopup(
        `<div style="min-width:180px">
          <div style="font-weight:700;margin-bottom:4px">
            ${(w.first_name ?? "") + " " + (w.last_name ?? "")}
          </div>
          <div style="font-size:11px;color:#6b7280">
            ${STATUS_LABEL[w.status.status]}${
              w.status.distance_m != null ? ` · ${fmtDistance(w.status.distance_m)}` : ""
            }
          </div>
          <div style="font-size:10px;color:#9ca3af;margin-top:4px">
            Last seen: ${fmtRelative(w.presence.last_seen_at)}
          </div>
        </div>`,
      );
      marker.on("click", () => setActiveWorkerId(w.employee_id));
      marker.addTo(layer);
      workerMarkersRef.current.set(w.employee_id, marker);
    }

    // Auto-fit on first render only when nothing has been focused
    if (!activeWorkerId) {
      const bounds = computeBounds(filteredWorkers);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    }
  }, [filteredWorkers, jobSite, jobSiteName, meetingPoint, meetingPointName, computeBounds, activeWorkerId]);

  // ── Counts for filter chips ──
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: workers.length };
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const w of workers) c[w.status.status] = (c[w.status.status] ?? 0) + 1;
    return c;
  }, [workers]);

  // ── Operational metrics ──
  const onlineCount = useMemo(() => workers.filter((w) => !!w.presence).length, [workers]);

  // ── Actions ──
  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = computeBounds(workers);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    setActiveWorkerId(null);
  }, [computeBounds, workers]);

  const recenterVenue = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const v = jobSite ?? meetingPoint;
    if (!v) return;
    map.setView([v.latitude, v.longitude], 16, { animate: true });
    setActiveWorkerId(null);
  }, [jobSite, meetingPoint]);

  const focusWorker = useCallback((id: string) => {
    const map = mapRef.current;
    const marker = workerMarkersRef.current.get(id);
    if (!map || !marker) return;
    map.setView(marker.getLatLng(), 17, { animate: true });
    marker.openPopup();
    setActiveWorkerId(id);
  }, []);

  const hasAnyVenue = !!jobSite || !!meetingPoint;
  const hasAnyPresence = workers.some((w) => !!w.presence);

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider leading-tight">Live map</div>
            <div className="text-[10px] text-muted-foreground leading-tight truncate">
              {onlineCount}/{workers.length} sharing
              {lastUpdateAt && <> · updated {new Date(lastUpdateAt).toLocaleTimeString()}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasAnyVenue && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={recenterVenue}
              title="Recenter to venue"
            >
              <Crosshair className="h-3 w-3 mr-1" /> Venue
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={fitAll}
            title="Fit all"
          >
            <Maximize2 className="h-3 w-3 mr-1" /> Fit
          </Button>
          {onRefresh && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onRefresh}>
              <RefreshCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b overflow-x-auto bg-background">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={cn(
            "text-[10px] px-2 py-1 rounded-full border transition-colors whitespace-nowrap",
            statusFilter === "all"
              ? "bg-primary/10 border-primary/40 text-primary font-semibold"
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
                ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                : "border-border/40 text-muted-foreground hover:bg-muted",
            )}
          >
            <span
              className="inline-block h-2 w-2 rounded-full mr-1 align-middle"
              style={{ background: STATUS_COLOR[s] }}
            />
            {STATUS_LABEL[s]} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      {/* ── Body: map + side roster ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">
        {/* Map */}
        <div className="relative">
          <div ref={containerRef} style={{ height }} className="w-full bg-muted/40" />

          {/* Venue legend */}
          {hasAnyVenue && (
            <div className="absolute left-3 bottom-3 z-[400] flex flex-col gap-1 rounded-md border bg-background/95 backdrop-blur px-2 py-1.5 text-[10px] shadow-md">
              {jobSite && (
                <div className="flex items-center gap-1.5">
                  <Flag className="h-3 w-3 text-primary" />
                  <span className="font-semibold">Job site</span>
                  {jobSite.geofence_radius_meters && (
                    <span className="text-muted-foreground">· {jobSite.geofence_radius_meters}m</span>
                  )}
                </div>
              )}
              {meetingPoint && (
                <div className="flex items-center gap-1.5">
                  <Navigation className="h-3 w-3" style={{ color: "#7c3aed" }} />
                  <span className="font-semibold">Meeting point</span>
                  {meetingPoint.geofence_radius_meters && (
                    <span className="text-muted-foreground">· {meetingPoint.geofence_radius_meters}m</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty state overlays */}
          {!hasAnyVenue && (
            <div className="absolute inset-x-3 top-3 z-[400] rounded-md border bg-warning/10 border-warning/30 text-warning-foreground px-3 py-2 text-[11px] flex items-center gap-2 shadow-sm">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span className="font-semibold">No structured venue.</span>
              <span className="text-muted-foreground">Set a job site or meeting point to enable geofence tracking.</span>
            </div>
          )}
          {hasAnyVenue && !hasAnyPresence && (
            <div className="absolute inset-x-3 bottom-3 z-[400] rounded-md border bg-background/95 backdrop-blur px-3 py-2 text-[11px] flex items-center gap-2 shadow-md">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span>No live presence yet — workers must enable tracking from their portal.</span>
            </div>
          )}
        </div>

        {/* Side roster */}
        <div className="border-t md:border-t-0 md:border-l bg-background/60 flex flex-col" style={{ maxHeight: height }}>
          <div className="px-2 py-2 border-b">
            <div className="relative">
              <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search worker…"
                className="w-full h-7 pl-6 pr-2 text-[11px] rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {filteredWorkers.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                No workers match this filter.
              </div>
            ) : (
              filteredWorkers.map((w) => {
                const active = activeWorkerId === w.employee_id;
                const canFocus = !!w.presence;
                return (
                  <button
                    key={w.employee_id}
                    type="button"
                    onClick={() => canFocus && focusWorker(w.employee_id)}
                    disabled={!canFocus}
                    className={cn(
                      "w-full text-left px-2.5 py-2 flex items-center gap-2 transition-colors",
                      canFocus ? "hover:bg-muted/60 cursor-pointer" : "opacity-60 cursor-not-allowed",
                      active && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    )}
                  >
                    <EmployeeAvatar
                      firstName={w.first_name ?? ""}
                      lastName={w.last_name ?? ""}
                      avatarUrl={w.avatar_url}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold truncate">
                        {w.first_name} {w.last_name}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: STATUS_COLOR[w.status.status] }}
                        />
                        <span className="truncate">
                          {STATUS_LABEL[w.status.status]}
                          {w.status.distance_m != null && ` · ${fmtDistance(w.status.distance_m)}`}
                        </span>
                      </div>
                      <div className="text-[9px] text-muted-foreground/80 mt-0.5">
                        {w.presence ? fmtRelative(w.presence.last_seen_at) : "Not sharing"}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
