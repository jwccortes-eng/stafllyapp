import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MapPin, Users, RefreshCw, Loader2, Filter, Eye, AlertTriangle, Clock,
  Navigation, Search, Signal, WifiOff, ChevronRight, Phone, Shield, Wifi,
} from "lucide-react";
import {
  LiveOperationsMap,
  type LiveMapLayer,
  type LiveMapLocation,
  type LiveMapWorker,
} from "@/components/maps/LiveOperationsMap";
import { distanceMeters } from "@/lib/geo-helpers";
import { differenceInMinutes, format } from "date-fns";

interface ClockAlert {
  id: string;
  employee_name: string;
  type: string;
  severity: string;
  description: string;
  created_at: string;
}

export default function LiveMap() {
  const { role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<LiveMapWorker[]>([]);
  const [locations, setLocations] = useState<LiveMapLocation[]>([]);
  const [alerts, setAlerts] = useState<ClockAlert[]>([]);
  const [showLayer, setShowLayer] = useState<LiveMapLayer>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // Scheduled shifts for today (workers not yet clocked in)
  const [scheduledNotClocked, setScheduledNotClocked] = useState<{ employee_name: string; shift_title: string; start_time: string }[]>([]);

  const hasAccess = ["developer", "owner", "admin", "manager"].includes(role ?? "");

  const fetchData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];

    // Fetch active time entries (clocked in, not out)
    const { data: activeEntries } = await supabase
      .from("time_entries")
      .select("employee_id, clock_in, shift_id")
      .eq("company_id", selectedCompanyId)
      .is("clock_out", null);

    const activeEmployeeIds = new Set((activeEntries ?? []).map(e => e.employee_id));

    // Fetch clock events for today
    const { data: clockEvents } = await supabase
      .from("clock_events")
      .select("employee_id, latitude, longitude, accuracy, created_at, shift_id")
      .eq("company_id", selectedCompanyId)
      .eq("type", "clock_in")
      .gte("created_at", `${today}T00:00:00`)
      .order("created_at", { ascending: false });

    // Fetch employees
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, avatar_url")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true);

    const employeeMap = new Map((employees ?? []).map(e => [e.id, e]));

    // Fetch shifts for active entries
    const shiftIds = [...new Set((activeEntries ?? []).map(e => e.shift_id).filter(Boolean))];
    const { data: shifts } = await supabase
      .from("scheduled_shifts")
      .select("id, title, client_id, clients(name), location_id, locations(name, latitude, longitude, geofence_radius)")
      .in("id", shiftIds.length > 0 ? shiftIds : ["__none__"]);

    const shiftMap = new Map((shifts ?? []).map((s: any) => [s.id, s]));

    // Build worker list from REAL data only
    const seenEmployees = new Set<string>();
    const workersList: LiveMapWorker[] = [];

    for (const ce of clockEvents ?? []) {
      if (seenEmployees.has(ce.employee_id) || !activeEmployeeIds.has(ce.employee_id)) continue;
      if (!ce.latitude || !ce.longitude) continue;

      seenEmployees.add(ce.employee_id);
      const emp = employeeMap.get(ce.employee_id);
      const activeEntry = (activeEntries ?? []).find(e => e.employee_id === ce.employee_id);
      const shift = activeEntry?.shift_id ? shiftMap.get(activeEntry.shift_id) : null;

      workersList.push({
        employee_id: ce.employee_id,
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Desconocido",
        latitude: ce.latitude,
        longitude: ce.longitude,
        accuracy: ce.accuracy ?? 0,
        clock_in: activeEntry?.clock_in ?? ce.created_at,
        shift_title: (shift as any)?.title ?? "Sin turno",
        client_name: (shift as any)?.clients?.name ?? "",
        phone: emp?.phone_number ?? null,
      });
    }

    setWorkers(workersList);

    // Locations
    const { data: locationsData } = await supabase
      .from("locations")
      .select("id, name, latitude, longitude, geofence_radius, city")
      .eq("company_id", selectedCompanyId)
      .is("deleted_at", null)
      .not("latitude", "is", null).not("longitude", "is", null);

    setLocations((locationsData ?? []).map((l: any) => ({
      id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude,
      geofence_radius: l.geofence_radius ?? 200, city: l.city,
    })));

    // Alerts
    const { data: alertsData } = await supabase
      .from("clock_alerts")
      .select("id, employee_id, type, severity, description, created_at")
      .eq("company_id", selectedCompanyId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false }).limit(20);

    setAlerts((alertsData ?? []).map((a: any) => {
      const emp = employeeMap.get(a.employee_id);
      return { id: a.id, employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Desconocido", type: a.type, severity: a.severity, description: a.description ?? "", created_at: a.created_at };
    }));

    // Scheduled but not clocked in
    const { data: todayAssignments } = await supabase
      .from("shift_assignments")
      .select("employee_id, scheduled_shifts(title, date, start_time)")
      .eq("company_id", selectedCompanyId)
      .eq("status", "confirmed");

    const notClocked = (todayAssignments ?? [])
      .filter((a: any) => a.scheduled_shifts?.date === today && !activeEmployeeIds.has(a.employee_id))
      .map((a: any) => {
        const emp = employeeMap.get(a.employee_id);
        return { employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Desconocido", shift_title: a.scheduled_shifts?.title ?? "", start_time: a.scheduled_shifts?.start_time ?? "" };
      });
    setScheduledNotClocked(notClocked);

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase.channel("live-map-clock")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clock_events", filter: `company_id=eq.${selectedCompanyId}` }, () => fetchData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clock_alerts", filter: `company_id=eq.${selectedCompanyId}` }, () => fetchData())
      .subscribe();
    const interval = setInterval(fetchData, 30000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [selectedCompanyId]);

  const filteredWorkers = useMemo(() => {
    if (!searchQuery) return workers;
    const q = searchQuery.toLowerCase();
    return workers.filter(w => w.employee_name.toLowerCase().includes(q) || w.shift_title.toLowerCase().includes(q) || w.client_name.toLowerCase().includes(q));
  }, [workers, searchQuery]);

  // Workers with distance to their assigned location
  const workersWithDistance = useMemo(() => {
    return filteredWorkers.map(w => {
      // Find the shift's location
      let distToSite: number | undefined;
      let locationName: string | undefined;
      // Match through locations by proximity (since we don't have location_id on worker)
      let closestLoc: typeof locations[0] | undefined;
      let closestDist = Infinity;
      locations.forEach(loc => {
        const d = distanceMeters(w.latitude, w.longitude, loc.latitude, loc.longitude);
        if (d < closestDist) { closestDist = d; closestLoc = loc; }
      });
      if (closestLoc) { distToSite = closestDist; locationName = closestLoc.name; }
      const elapsed = differenceInMinutes(new Date(), new Date(w.clock_in));
      return { ...w, distToSite, locationName, elapsed };
    });
  }, [filteredWorkers, locations]);

  const offSiteWorkers = workersWithDistance.filter(w => w.distToSite !== undefined && w.distToSite > 300);

  const severityColor = (s: string) => {
    if (s === "critical") return "bg-destructive text-destructive-foreground";
    if (s === "high") return "bg-destructive/80 text-destructive-foreground";
    if (s === "medium") return "bg-warning text-warning-foreground";
    return "bg-muted text-muted-foreground";
  };

  const alertTypeLabel = (t: string) => {
    switch (t) {
      case "OUTSIDE_GEOFENCE": return "Fuera de zona";
      case "DEVICE_DUPLICATION": return "Dispositivo duplicado";
      case "GPS_LOW_ACCURACY": return "GPS baja precisión";
      case "SUSPICIOUS_MOVEMENT": return "Movimiento sospechoso";
      default: return t;
    }
  };

  if (!hasAccess) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">No tienes acceso a este módulo.</p></div>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Mapa Operativo" subtitle="Supervisión en tiempo real de trabajadores y ubicaciones" icon={MapPin} />

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KpiCard icon={<Signal className="h-4 w-4 text-emerald-500" />} value={workers.length} label="Active Now" accent={workers.length > 0 ? "emerald" : undefined} />
        <KpiCard icon={<MapPin className="h-4 w-4 text-primary" />} value={locations.length} label="Locations" />
        <KpiCard icon={<Clock className="h-4 w-4 text-amber-500" />} value={scheduledNotClocked.length} label="Not Clocked In" accent={scheduledNotClocked.length > 0 ? "amber" : undefined} />
        <KpiCard icon={<Navigation className="h-4 w-4 text-destructive" />} value={offSiteWorkers.length} label="Off Site" accent={offSiteWorkers.length > 0 ? "red" : undefined} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} value={alerts.length} label="Alerts" accent={alerts.length > 0 ? "red" : undefined} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={showLayer} onValueChange={v => setShowLayer(v as LiveMapLayer)}>
          <SelectTrigger className="w-40 h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las capas</SelectItem>
            <SelectItem value="workers">Solo trabajadores</SelectItem>
            <SelectItem value="locations">Solo ubicaciones</SelectItem>
            <SelectItem value="alerts">Solo alertas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Actualizar
        </Button>
      </div>

      {/* Main content: Map + Side Panel */}
      <div className="flex gap-4 h-[600px]">
        {/* Map */}
        <div className="flex-1 rounded-xl border overflow-hidden">
          {loading && workers.length === 0 && locations.length === 0 ? (
            <div className="h-full flex items-center justify-center bg-muted/20"><Loader2 className="h-8 w-8 text-muted-foreground animate-spin" /></div>
          ) : (
            <LiveOperationsMap workers={workers} locations={locations} showLayer={showLayer} />
          )}
        </div>

        {/* Side Panel */}
        <div className="w-80 shrink-0 hidden lg:flex flex-col border rounded-xl bg-card overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search workers..." className="pl-8 h-8 text-xs" />
            </div>
          </div>

          {/* Active Workers */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Active Workers ({workersWithDistance.length})
              </p>
              {workersWithDistance.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">No active workers</p>
              )}
              {workersWithDistance.map(w => (
                <button
                  key={w.employee_id}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 transition-colors mb-1 group"
                  onClick={() => setSelectedWorkerId(w.employee_id === selectedWorkerId ? null : w.employee_id)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {w.employee_name.charAt(0)}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{w.employee_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{w.shift_title}{w.client_name ? ` · ${w.client_name}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-mono text-muted-foreground">{Math.floor(w.elapsed / 60)}h{String(w.elapsed % 60).padStart(2, "0")}m</p>
                      {w.distToSite !== undefined && (
                        <p className={`text-[9px] font-medium ${w.distToSite <= 300 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                          {w.distToSite <= 300 ? "On-site" : `${Math.round(w.distToSite)}m away`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {selectedWorkerId === w.employee_id && (
                    <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
                      {w.locationName && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {w.locationName}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" /> Clocked in: {format(new Date(w.clock_in), "hh:mm a")}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Wifi className="h-3 w-3" /> GPS: ±{Math.round(w.accuracy)}m
                      </div>
                      {w.phone && (
                        <a href={`tel:${w.phone}`} className="flex items-center gap-1.5 text-[10px] text-primary hover:underline">
                          <Phone className="h-3 w-3" /> {w.phone}
                        </a>
                      )}
                    </div>
                  )}
                </button>
              ))}

              {/* Not clocked in section */}
              {scheduledNotClocked.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mt-4 mb-2 flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-amber-500" /> Not Clocked In ({scheduledNotClocked.length})
                  </p>
                  {scheduledNotClocked.slice(0, 10).map((s, i) => (
                    <div key={i} className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{s.employee_name}</span>
                      <span className="text-[10px]"> · {s.shift_title} · {s.start_time?.substring(0, 5)}</span>
                    </div>
                  ))}
                  {scheduledNotClocked.length > 10 && <p className="text-[10px] text-muted-foreground px-2">+{scheduledNotClocked.length - 10} más</p>}
                </>
              )}

              {/* Alerts */}
              {alerts.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mt-4 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-destructive" /> Alerts ({alerts.length})
                  </p>
                  {alerts.slice(0, 5).map(alert => (
                    <div key={alert.id} className="flex items-center gap-2 p-2 rounded-lg mb-1">
                      <Badge className={`${severityColor(alert.severity)} text-[9px] px-1.5`}>{alert.severity}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium truncate">{alert.employee_name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{alertTypeLabel(alert.type)}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, value, label, accent }: { icon: React.ReactNode; value: number; label: string; accent?: string }) {
  return (
    <Card className="border-border/30 rounded-xl">
      <CardContent className="pt-3 pb-2 px-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <p className={`text-xl font-bold tabular-nums ${accent === "emerald" ? "text-emerald-600 dark:text-emerald-400" : accent === "amber" ? "text-amber-600 dark:text-amber-400" : accent === "red" ? "text-destructive" : ""}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
