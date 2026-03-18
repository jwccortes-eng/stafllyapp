import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Truck, RefreshCw, Loader2, Filter, Eye } from "lucide-react";
import {
  LiveOperationsMap,
  type LiveMapLayer,
  type LiveMapLocation,
  type LiveMapWorker,
} from "@/components/maps/LiveOperationsMap";

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
  const [workers, setWorkers] = useState<LiveMapWorker[]>([]);
  const [locations, setLocations] = useState<LiveMapLocation[]>([]);
  const [alerts, setAlerts] = useState<ClockAlert[]>([]);
  const [showLayer, setShowLayer] = useState<LiveMapLayer>("all");

  const hasAccess = ["developer", "owner", "admin", "manager"].includes(role ?? "");

  const fetchData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];

    const { data: clockEvents } = await supabase
      .from("clock_events")
      .select("employee_id, latitude, longitude, accuracy, created_at, shift_id")
      .eq("company_id", selectedCompanyId)
      .eq("type", "clock_in")
      .gte("created_at", `${today}T00:00:00`)
      .order("created_at", { ascending: false });

    const { data: activeEntries } = await supabase
      .from("time_entries")
      .select("employee_id, clock_in, shift_id")
      .eq("company_id", selectedCompanyId)
      .is("clock_out", null);

    const activeEmployeeIds = new Set((activeEntries ?? []).map((entry) => entry.employee_id));

    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true);

    const employeeMap = new Map((employees ?? []).map((employee) => [employee.id, employee]));

    const shiftIds = [...new Set((activeEntries ?? []).map((entry) => entry.shift_id).filter(Boolean))];
    const { data: shifts } = await supabase
      .from("scheduled_shifts")
      .select("id, title, client_id, clients(name)")
      .in("id", shiftIds.length > 0 ? shiftIds : ["__none__"]);

    const shiftMap = new Map((shifts ?? []).map((shift: any) => [shift.id, shift]));

    const seenEmployees = new Set<string>();
    const workersList: LiveMapWorker[] = [];

    for (const clockEvent of clockEvents ?? []) {
      if (seenEmployees.has(clockEvent.employee_id) || !activeEmployeeIds.has(clockEvent.employee_id)) continue;
      if (!clockEvent.latitude || !clockEvent.longitude) continue;

      seenEmployees.add(clockEvent.employee_id);
      const employee = employeeMap.get(clockEvent.employee_id);
      const activeEntry = (activeEntries ?? []).find((entry) => entry.employee_id === clockEvent.employee_id);
      const shift = activeEntry?.shift_id ? shiftMap.get(activeEntry.shift_id) : null;

      workersList.push({
        employee_id: clockEvent.employee_id,
        employee_name: employee ? `${employee.first_name} ${employee.last_name}` : "Desconocido",
        latitude: clockEvent.latitude,
        longitude: clockEvent.longitude,
        accuracy: clockEvent.accuracy ?? 0,
        clock_in: activeEntry?.clock_in ?? clockEvent.created_at,
        shift_title: (shift as any)?.title ?? "Sin turno",
        client_name: (shift as any)?.clients?.name ?? "",
        phone: employee?.phone_number ?? null,
      });
    }

    setWorkers(workersList);

    const { data: locationsData } = await supabase
      .from("locations")
      .select("id, name, latitude, longitude, geofence_radius, city")
      .eq("company_id", selectedCompanyId)
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    setLocations(
      (locationsData ?? []).map((location: any) => ({
        id: location.id,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        geofence_radius: location.geofence_radius ?? 200,
        city: location.city,
      }))
    );

    const { data: alertsData } = await supabase
      .from("clock_alerts")
      .select("id, employee_id, type, severity, description, created_at")
      .eq("company_id", selectedCompanyId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const alertsList: ClockAlert[] = (alertsData ?? []).map((alert: any) => {
      const employee = employeeMap.get(alert.employee_id);
      return {
        id: alert.id,
        employee_name: employee ? `${employee.first_name} ${employee.last_name}` : "Desconocido",
        type: alert.type,
        severity: alert.severity,
        description: alert.description ?? "",
        created_at: alert.created_at,
      };
    });

    setAlerts(alertsList);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) return;

    const channel = supabase
      .channel("live-map-clock")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clock_events",
          filter: `company_id=eq.${selectedCompanyId}`,
        },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clock_alerts",
          filter: `company_id=eq.${selectedCompanyId}`,
        },
        () => fetchData()
      )
      .subscribe();

    const interval = setInterval(fetchData, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [selectedCompanyId]);

  const severityColor = (severity: string) => {
    if (severity === "critical") return "bg-destructive text-destructive-foreground";
    if (severity === "high") return "bg-destructive/80 text-destructive-foreground";
    if (severity === "medium") return "bg-warning text-warning-foreground";
    return "bg-muted text-muted-foreground";
  };

  const alertTypeLabel = (type: string) => {
    switch (type) {
      case "OUTSIDE_GEOFENCE":
        return "Fuera de zona";
      case "DEVICE_DUPLICATION":
        return "Dispositivo duplicado";
      case "GPS_LOW_ACCURACY":
        return "GPS baja precisión";
      case "SUSPICIOUS_MOVEMENT":
        return "Movimiento sospechoso";
      default:
        return type;
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Mapa Operativo"
        subtitle="Supervisión en tiempo real de trabajadores y ubicaciones"
        icon={MapPin}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={showLayer} onValueChange={(value) => setShowLayer(value as LiveMapLayer)}>
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
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {workers.length} activos
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> {locations.length} ubicaciones
          </span>
          {alerts.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> {alerts.length} alertas
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ height: "500px" }}>
        {loading && workers.length === 0 && locations.length === 0 ? (
          <div className="h-full flex items-center justify-center bg-muted/20">
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <LiveOperationsMap workers={workers} locations={locations} showLayer={showLayer} />
        )}
      </div>

      {alerts.length > 0 && (showLayer === "all" || showLayer === "alerts") && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              Alertas activas ({alerts.length})
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-background">
                  <Badge className={severityColor(alert.severity)} variant="outline">
                    {alert.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{alert.employee_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {alertTypeLabel(alert.type)} — {alert.description}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(alert.created_at).toLocaleTimeString("es", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Users className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
            <p className="text-2xl font-bold tabular-nums">{workers.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <MapPin className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold tabular-nums">{locations.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ubicaciones</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Eye className="h-5 w-5 mx-auto text-destructive mb-1" />
            <p className="text-2xl font-bold tabular-nums">{alerts.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Alertas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Truck className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold tabular-nums">—</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Drivers</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
