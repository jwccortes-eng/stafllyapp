import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Truck, RefreshCw, Loader2, Filter, Eye } from "lucide-react";
import { NavigationButtons } from "@/components/navigation/NavigationButtons";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const workerIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const locationIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const alertIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

interface ActiveWorker {
  employee_id: string;
  employee_name: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  clock_in: string;
  shift_title: string;
  client_name: string;
  phone: string | null;
}

interface LocationPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofence_radius: number;
  city: string | null;
}

interface ClockAlert {
  id: string;
  employee_name: string;
  type: string;
  severity: string;
  description: string;
  created_at: string;
  latitude?: number;
  longitude?: number;
}

export default function LiveMap() {
  const { role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<ActiveWorker[]>([]);
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [alerts, setAlerts] = useState<ClockAlert[]>([]);
  const [showLayer, setShowLayer] = useState<"all" | "workers" | "locations" | "alerts">("all");

  const hasAccess = ["developer", "owner", "admin", "manager"].includes(role ?? "");


  const fetchData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];

    // Get latest clock_in events for today (most recent per employee)
    const { data: clockEvents } = await supabase
      .from("clock_events")
      .select("employee_id, latitude, longitude, accuracy, created_at, shift_id")
      .eq("company_id", selectedCompanyId)
      .eq("type", "clock_in")
      .gte("created_at", today + "T00:00:00")
      .order("created_at", { ascending: false });

    // Get active time entries (no clock_out)
    const { data: activeEntries } = await supabase
      .from("time_entries")
      .select("employee_id, clock_in, shift_id")
      .eq("company_id", selectedCompanyId)
      .is("clock_out", null);

    const activeEmployeeIds = new Set((activeEntries ?? []).map(e => e.employee_id));

    // Get employees info
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true);

    const empMap = new Map((employees ?? []).map(e => [e.id, e]));

    // Get shift info
    const shiftIds = [...new Set((activeEntries ?? []).map(e => e.shift_id).filter(Boolean))];
    const { data: shifts } = await supabase
      .from("scheduled_shifts")
      .select("id, title, client_id, clients(name)")
      .in("id", shiftIds.length > 0 ? shiftIds : ["__none__"]);
    const shiftMap = new Map((shifts ?? []).map((s: any) => [s.id, s]));

    // Build active workers with GPS
    const seenEmployees = new Set<string>();
    const workersList: ActiveWorker[] = [];
    for (const ce of clockEvents ?? []) {
      if (seenEmployees.has(ce.employee_id) || !activeEmployeeIds.has(ce.employee_id)) continue;
      if (!ce.latitude || !ce.longitude) continue;
      seenEmployees.add(ce.employee_id);
      const emp = empMap.get(ce.employee_id);
      const entry = (activeEntries ?? []).find(e => e.employee_id === ce.employee_id);
      const shift = entry?.shift_id ? shiftMap.get(entry.shift_id) : null;
      workersList.push({
        employee_id: ce.employee_id,
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Desconocido",
        latitude: ce.latitude,
        longitude: ce.longitude,
        accuracy: ce.accuracy ?? 0,
        clock_in: entry?.clock_in ?? ce.created_at,
        shift_title: (shift as any)?.title ?? "Sin turno",
        client_name: (shift as any)?.clients?.name ?? "",
        phone: emp?.phone_number ?? null,
      });
    }
    setWorkers(workersList);

    // Get locations with coordinates
    const { data: locs } = await supabase
      .from("locations")
      .select("id, name, latitude, longitude, geofence_radius, city")
      .eq("company_id", selectedCompanyId)
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    setLocations((locs ?? []).map((l: any) => ({
      id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude,
      geofence_radius: l.geofence_radius ?? 200, city: l.city,
    })));

    // Get recent alerts
    const { data: alertsData } = await supabase
      .from("clock_alerts")
      .select("id, employee_id, type, severity, description, created_at")
      .eq("company_id", selectedCompanyId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const alertsList: ClockAlert[] = (alertsData ?? []).map((a: any) => {
      const emp = empMap.get(a.employee_id);
      return {
        id: a.id, employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Desconocido",
        type: a.type, severity: a.severity, description: a.description ?? "", created_at: a.created_at,
      };
    });
    setAlerts(alertsList);

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedCompanyId]);

  // Realtime subscription for clock events
  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase
      .channel("live-map-clock")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clock_events", filter: `company_id=eq.${selectedCompanyId}` }, () => fetchData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clock_alerts", filter: `company_id=eq.${selectedCompanyId}` }, () => fetchData())
      .subscribe();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [selectedCompanyId]);

  const center: [number, number] = useMemo(() => {
    const allPoints = [
      ...workers.map(w => [w.latitude, w.longitude] as [number, number]),
      ...locations.map(l => [l.latitude, l.longitude] as [number, number]),
    ];
    if (allPoints.length === 0) return [25.7617, -80.1918]; // Default: Miami
    const avgLat = allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length;
    const avgLng = allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length;
    return [avgLat, avgLng];
  }, [workers, locations]);

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

  if (!hasAccess) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">No tienes acceso a este módulo.</p></div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Mapa Operativo" subtitle="Supervisión en tiempo real de trabajadores y ubicaciones" icon={MapPin} />

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={showLayer} onValueChange={(v: any) => setShowLayer(v)}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las capas</SelectItem>
            <SelectItem value="workers">Solo trabajadores</SelectItem>
            <SelectItem value="locations">Solo ubicaciones</SelectItem>
            <SelectItem value="alerts">Solo alertas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Actualizar
        </Button>
        <div className="flex gap-3 ml-auto text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {workers.length} activos</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> {locations.length} ubicaciones</span>
          {alerts.length > 0 && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-destructive" /> {alerts.length} alertas</span>}
        </div>
      </div>

      {/* Map */}
      <div className="rounded-xl border overflow-hidden" style={{ height: "500px" }}>
        {loading && workers.length === 0 && locations.length === 0 ? (
          <div className="h-full flex items-center justify-center bg-muted/20">
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Location geofences */}
            {(showLayer === "all" || showLayer === "locations") && locations.map((loc) => (
              <React.Fragment key={loc.id}>
                <Circle
                  center={[loc.latitude, loc.longitude]}
                  radius={loc.geofence_radius}
                  pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.1, weight: 1 }}
                />
                <Marker position={[loc.latitude, loc.longitude]} icon={locationIcon}>
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[160px]">
                      <p className="font-bold text-sm">{loc.name}</p>
                      {loc.city && <p className="text-muted-foreground">{loc.city}</p>}
                      <p>Radio: {loc.geofence_radius}m</p>
                      <div className="pt-1">
                        <a href={`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`} target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs">Abrir en Maps</a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            ))}

            {/* Active workers */}
            {(showLayer === "all" || showLayer === "workers") && workers.map((w) => (
              <Marker key={w.employee_id} position={[w.latitude, w.longitude]} icon={workerIcon}>
                <Popup>
                  <div className="text-xs space-y-1.5 min-w-[180px]">
                    <p className="font-bold text-sm">🟢 {w.employee_name}</p>
                    <p><strong>Turno:</strong> {w.shift_title}</p>
                    {w.client_name && <p><strong>Cliente:</strong> {w.client_name}</p>}
                    <p><strong>Entrada:</strong> {new Date(w.clock_in).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Precisión GPS:</strong> ±{Math.round(w.accuracy)}m</p>
                    {w.phone && (
                      <a href={`tel:${w.phone}`} className="text-primary underline block">📞 {w.phone}</a>
                    )}
                    <div className="pt-1">
                      <a href={`https://www.google.com/maps/search/?api=1&query=${w.latitude},${w.longitude}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">Navegar</a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Alerts panel */}
      {alerts.length > 0 && (showLayer === "all" || showLayer === "alerts") && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              Alertas activas ({alerts.length})
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-background">
                  <Badge className={severityColor(a.severity)} variant="outline">
                    {a.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{a.employee_name}</p>
                    <p className="text-[10px] text-muted-foreground">{alertTypeLabel(a.type)} — {a.description}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(a.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <Users className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
          <p className="text-2xl font-bold tabular-nums">{workers.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Activos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <MapPin className="h-5 w-5 mx-auto text-blue-500 mb-1" />
          <p className="text-2xl font-bold tabular-nums">{locations.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ubicaciones</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <Eye className="h-5 w-5 mx-auto text-destructive mb-1" />
          <p className="text-2xl font-bold tabular-nums">{alerts.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Alertas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <Truck className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold tabular-nums">—</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Drivers</p>
        </CardContent></Card>
      </div>
    </div>
  );
}
