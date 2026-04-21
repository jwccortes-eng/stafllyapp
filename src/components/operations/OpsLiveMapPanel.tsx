/**
 * OpsLiveMapPanel — embedded live-map view for the Operations Command Center.
 *
 * Reuses the existing LiveOperationsMap component (no duplication) and exposes
 * a side rail with the active workers + an "off-site" / "no-clockin" summary
 * derived from clock_events for the selected date.
 *
 * Filtering by date: when the panel sits inside the Command Center, the user
 * already chose a date. We honor it instead of forcing "today" — admins use
 * this panel both for live ops and post-event review.
 *
 * Realtime: a single channel watches clock_events for the company; combined
 * with a 30s polling fallback so the panel stays fresh without bursts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import {
  Search, RefreshCw, Loader2, MapPin, Phone, Clock, Navigation,
  AlertTriangle, Wifi,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  LiveOperationsMap,
  type LiveMapWorker,
  type LiveMapLocation,
  type LiveMapLayer,
} from "@/components/maps/LiveOperationsMap";
import { distanceMeters } from "@/lib/geo-helpers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatPersonName } from "@/lib/format-helpers";

interface OpsLiveMapPanelProps {
  companyId: string;
  date: Date;
}

interface PendingArrival {
  employee_id: string;
  employee_name: string;
  shift_title: string;
  start_time: string;
}

export function OpsLiveMapPanel({ companyId, date }: OpsLiveMapPanelProps) {
  const dateStr = format(date, "yyyy-MM-dd");
  const isToday = isSameDay(date, new Date());

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<LiveMapWorker[]>([]);
  const [locations, setLocations] = useState<LiveMapLocation[]>([]);
  const [pending, setPending] = useState<PendingArrival[]>([]);
  const [showLayer, setShowLayer] = useState<LiveMapLayer>("all");
  const [search, setSearch] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const dayStart = `${dateStr}T00:00:00`;
    const dayEnd = `${dateStr}T23:59:59`;

    // Single batch — all reads in parallel.
    const [
      activeEntriesRes,
      clockEventsRes,
      employeesRes,
      locationsRes,
      assignmentsRes,
    ] = await Promise.all([
      supabase.from("time_entries")
        .select("employee_id, clock_in, shift_id")
        .eq("company_id", companyId)
        .gte("clock_in", dayStart).lte("clock_in", dayEnd)
        .is("clock_out", null),
      // Both arrival/clock_in events serve as last-known position
      supabase.from("clock_events")
        .select("employee_id, latitude, longitude, accuracy, created_at, shift_id, type")
        .eq("company_id", companyId)
        .in("type", ["arrival", "clock_in"])
        .gte("created_at", dayStart).lte("created_at", dayEnd)
        .order("created_at", { ascending: false }),
      supabase.from("employees")
        .select("id, first_name, last_name, phone_number, avatar_url")
        .eq("company_id", companyId).eq("is_active", true),
      supabase.from("locations")
        .select("id, name, latitude, longitude, geofence_radius, city")
        .eq("company_id", companyId).is("deleted_at", null)
        .not("latitude", "is", null).not("longitude", "is", null),
      // Pending arrivals = scheduled today, not present in time_entries set yet.
      supabase.from("shift_assignments")
        .select("employee_id, scheduled_shifts(title, date, start_time)")
        .eq("company_id", companyId)
        .not("status", "in", "(rejected,removed)"),
    ]);

    const activeEntries = activeEntriesRes.data ?? [];
    const activeIds = new Set(activeEntries.map((e: any) => e.employee_id));
    const empMap = new Map((employeesRes.data ?? []).map((e: any) => [e.id, e]));

    // Fetch shift titles for active entries (one extra hop, only if needed).
    const shiftIds = Array.from(new Set(activeEntries.map((e: any) => e.shift_id).filter(Boolean)));
    let shiftMap = new Map<string, any>();
    if (shiftIds.length > 0) {
      const { data: shifts } = await supabase
        .from("scheduled_shifts")
        .select("id, title, clients(name)")
        .in("id", shiftIds);
      shiftMap = new Map((shifts ?? []).map((s: any) => [s.id, s]));
    }

    // Build live worker pins from the most-recent clock_event per employee.
    const seen = new Set<string>();
    const list: LiveMapWorker[] = [];
    for (const ev of (clockEventsRes.data ?? [])) {
      if (seen.has(ev.employee_id)) continue;
      if (!activeIds.has(ev.employee_id)) continue; // only currently-clocked-in workers on the map
      if (ev.latitude == null || ev.longitude == null) continue;
      seen.add(ev.employee_id);
      const emp = empMap.get(ev.employee_id);
      const entry = activeEntries.find((e: any) => e.employee_id === ev.employee_id);
      const shift = entry?.shift_id ? shiftMap.get(entry.shift_id) : null;
      list.push({
        employee_id: ev.employee_id,
        employee_name: emp ? formatPersonName(`${emp.first_name} ${emp.last_name}`) : "—",
        latitude: ev.latitude,
        longitude: ev.longitude,
        accuracy: ev.accuracy ?? 0,
        clock_in: entry?.clock_in ?? ev.created_at,
        shift_title: shift?.title ?? "Sin turno",
        client_name: shift?.clients?.name ?? "",
        phone: emp?.phone_number ?? null,
      });
    }
    setWorkers(list);

    setLocations((locationsRes.data ?? []).map((l: any) => ({
      id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude,
      geofence_radius: l.geofence_radius ?? 200, city: l.city,
    })));

    // Pending = scheduled for the selected date and not yet clocked in.
    const pendingList: PendingArrival[] = ((assignmentsRes.data ?? []) as any[])
      .filter((a) => a.scheduled_shifts?.date === dateStr && !activeIds.has(a.employee_id))
      .map((a) => {
        const emp = empMap.get(a.employee_id);
        return {
          employee_id: a.employee_id,
          employee_name: emp ? formatPersonName(`${emp.first_name} ${emp.last_name}`) : "—",
          shift_title: a.scheduled_shifts?.title ?? "",
          start_time: a.scheduled_shifts?.start_time ?? "",
        };
      })
      // De-dup if same employee has multiple shifts queued same day.
      .filter((v, i, arr) => arr.findIndex(x => x.employee_id === v.employee_id) === i);
    setPending(pendingList);

    setLoading(false);
  }, [companyId, dateStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime — only when looking at today; old days don't need a channel.
  useEffect(() => {
    if (!companyId || !isToday) return;
    const channel = supabase.channel(`ops-live-map:${companyId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "clock_events", filter: `company_id=eq.${companyId}` },
        () => fetchData())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `company_id=eq.${companyId}` },
        () => fetchData())
      .subscribe();
    const interval = setInterval(fetchData, 30_000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [companyId, isToday, fetchData]);

  // Distance to closest known location → defines the "on-site / near / off-site" tone.
  const workersDecorated = useMemo(() => {
    return workers.map(w => {
      let dist: number | undefined;
      let locName: string | undefined;
      let best = Infinity;
      for (const loc of locations) {
        const d = distanceMeters(w.latitude, w.longitude, loc.latitude, loc.longitude);
        if (d < best) { best = d; dist = d; locName = loc.name; }
      }
      const elapsedMin = Math.max(0, Math.round((Date.now() - new Date(w.clock_in).getTime()) / 60000));
      // Tone tiers: on-site ≤ geofence radius proxy (200m), near ≤ 500m, else off-site.
      let tone: "on_site" | "near" | "off_site" = "off_site";
      if (dist == null) tone = "near";
      else if (dist <= 200) tone = "on_site";
      else if (dist <= 500) tone = "near";
      return { ...w, dist, locName, elapsedMin, tone };
    });
  }, [workers, locations]);

  const filteredWorkers = useMemo(() => {
    if (!search.trim()) return workersDecorated;
    const q = search.toLowerCase();
    return workersDecorated.filter(w =>
      w.employee_name.toLowerCase().includes(q) ||
      w.shift_title.toLowerCase().includes(q) ||
      w.client_name.toLowerCase().includes(q),
    );
  }, [workersDecorated, search]);

  const offSite = workersDecorated.filter(w => w.tone === "off_site").length;
  const onSite = workersDecorated.filter(w => w.tone === "on_site").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
      {/* ─── Map ─── */}
      <div className="rounded-2xl border bg-card overflow-hidden h-[600px] relative">
        {loading && workers.length === 0 ? (
          <div className="h-full flex items-center justify-center bg-muted/20">
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <LiveOperationsMap workers={workers} locations={locations} showLayer={showLayer} />
        )}

        {/* Floating overlays */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <Select value={showLayer} onValueChange={(v) => setShowLayer(v as LiveMapLayer)}>
              <SelectTrigger className="h-8 text-[11px] bg-background/90 backdrop-blur w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All layers</SelectItem>
                <SelectItem value="workers">Workers only</SelectItem>
                <SelectItem value="locations">Sites only</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8 bg-background/90 backdrop-blur"
              onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <span className="rounded-full bg-background/90 backdrop-blur border px-2 py-1 text-[10px] font-bold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-earning" />{onSite} on-site
            </span>
            {offSite > 0 && (
              <span className="rounded-full bg-background/90 backdrop-blur border px-2 py-1 text-[10px] font-bold flex items-center gap-1 text-deduction">
                <span className="h-1.5 w-1.5 rounded-full bg-deduction" />{offSite} off-site
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Side rail ─── */}
      <div className="rounded-2xl border bg-card flex flex-col h-[600px] overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search worker, shift, client…"
              className="pl-8 h-8 text-xs" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-3">
            {/* Active workers */}
            <section>
              <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-earning animate-pulse" />
                Active workers ({filteredWorkers.length})
              </p>
              {filteredWorkers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/70 px-2 py-3 text-center">
                  No active workers right now
                </p>
              ) : filteredWorkers.map(w => {
                const open = selectedWorkerId === w.employee_id;
                return (
                  <button
                    key={w.employee_id}
                    onClick={() => setSelectedWorkerId(open ? null : w.employee_id)}
                    className={cn(
                      "w-full text-left px-2.5 py-2 rounded-lg transition-colors mb-0.5",
                      open ? "bg-muted/40" : "hover:bg-muted/20",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative shrink-0">
                        <div className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold",
                          w.tone === "on_site" && "bg-earning/15 text-earning",
                          w.tone === "near" && "bg-warning/15 text-warning",
                          w.tone === "off_site" && "bg-deduction/15 text-deduction",
                        )}>
                          {w.employee_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                        </div>
                        <span className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                          w.tone === "on_site" && "bg-earning",
                          w.tone === "near" && "bg-warning",
                          w.tone === "off_site" && "bg-deduction",
                        )} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold truncate">{w.employee_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {w.shift_title}{w.client_name ? ` · ${w.client_name}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {Math.floor(w.elapsedMin / 60)}h{String(w.elapsedMin % 60).padStart(2, "0")}m
                        </p>
                        {w.dist != null && (
                          <p className={cn(
                            "text-[9px] font-bold",
                            w.tone === "on_site" && "text-earning",
                            w.tone === "near" && "text-warning",
                            w.tone === "off_site" && "text-deduction",
                          )}>
                            {w.tone === "on_site" ? "On-site" : `${Math.round(w.dist)}m`}
                          </p>
                        )}
                      </div>
                    </div>

                    {open && (
                      <div className="mt-2 pt-2 border-t border-border/30 grid grid-cols-1 gap-1">
                        {w.locName && (
                          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {w.locName}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> Clocked in: {format(new Date(w.clock_in), "hh:mm a")}
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Wifi className="h-3 w-3" /> GPS ±{Math.round(w.accuracy)}m
                        </span>
                        {w.phone && (
                          <a href={`tel:${w.phone}`} onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-[10px] text-primary hover:underline">
                            <Phone className="h-3 w-3" /> {w.phone}
                          </a>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </section>

            {/* Pending */}
            {pending.length > 0 && (
              <section>
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-warning flex items-center gap-1.5 mb-1.5">
                  <Clock className="h-3 w-3" /> Not clocked in ({pending.length})
                </p>
                {pending.slice(0, 12).map(p => (
                  <div key={p.employee_id} className="px-2.5 py-1.5 text-[11px]">
                    <span className="font-semibold">{p.employee_name}</span>
                    <span className="text-[10px] text-muted-foreground"> · {p.shift_title} · {p.start_time?.slice(0, 5)}</span>
                  </div>
                ))}
                {pending.length > 12 && (
                  <p className="text-[10px] text-muted-foreground/70 px-2.5">+{pending.length - 12} more</p>
                )}
              </section>
            )}

            {offSite > 0 && (
              <section>
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-deduction flex items-center gap-1.5 mb-1.5">
                  <Navigation className="h-3 w-3" /> Off-site ({offSite})
                </p>
                {workersDecorated.filter(w => w.tone === "off_site").map(w => (
                  <div key={w.employee_id} className="px-2.5 py-1.5 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-deduction shrink-0" />
                    <span className="font-semibold truncate">{w.employee_name}</span>
                    <span className="text-[10px] text-deduction shrink-0 ml-auto">
                      {w.dist ? `${Math.round(w.dist)}m` : "—"}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
