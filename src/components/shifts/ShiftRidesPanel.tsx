import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Badge } from "@/components/ui/badge";
import { Car, Plus, Trash2, Loader2, DollarSign, Users, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Assignment, Employee } from "./types";

const MAX_PASSENGERS = 5;

interface ShiftRide {
  id: string;
  driver_id: string;
  ride_type: "regular" | "special";
  passenger_count: number;
  movement_id: string | null;
  notes: string | null;
}

interface ShiftRidesPanelProps {
  shiftId: string;
  companyId: string;
  assignments: Assignment[];
  employees: Employee[];
  canEdit: boolean;
  onRidesChanged?: () => void;
}

export function ShiftRidesPanel({
  shiftId, companyId, assignments, employees, canEdit, onRidesChanged,
}: ShiftRidesPanelProps) {
  const [rides, setRides] = useState<ShiftRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [generatingPayments, setGeneratingPayments] = useState(false);

  // Load drivers (employees with has_car = 'Yes')
  const loadDrivers = useCallback(async () => {
    const { data } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("has_car", ["Yes", "true", "Sí", "yes", "YES"]);
    setDrivers(data ?? []);
  }, [companyId]);

  // Load rides for this shift
  const loadRides = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shift_rides")
      .select("id, driver_id, ride_type, passenger_count, movement_id, notes")
      .eq("shift_id", shiftId)
      .order("created_at");
    setRides((data as ShiftRide[]) ?? []);
    setLoading(false);
  }, [shiftId]);

  useEffect(() => {
    loadRides();
    loadDrivers();
  }, [loadRides, loadDrivers]);

  const totalAssigned = assignments.filter(a => a.shift_id === shiftId).length;
  const vehiclesNeeded = Math.ceil(totalAssigned / MAX_PASSENGERS);
  const totalPassengersAssigned = rides.reduce((sum, r) => sum + r.passenger_count, 0);

  const addRide = async (driverId: string) => {
    setSaving(true);
    const remainingPassengers = Math.max(0, totalAssigned - totalPassengersAssigned);
    const passengerCount = Math.min(MAX_PASSENGERS, remainingPassengers);

    const { error } = await supabase.from("shift_rides").insert({
      shift_id: shiftId,
      driver_id: driverId,
      company_id: companyId,
      ride_type: "regular",
      passenger_count: passengerCount,
    } as any);

    if (error) toast.error(error.message);
    else {
      toast.success("Ride agregado");
      await loadRides();
      onRidesChanged?.();
    }
    setSaving(false);
  };

  const updateRide = async (rideId: string, updates: Partial<ShiftRide>) => {
    const { error } = await supabase
      .from("shift_rides")
      .update(updates as any)
      .eq("id", rideId);
    if (error) toast.error(error.message);
    else await loadRides();
  };

  const removeRide = async (rideId: string) => {
    const { error } = await supabase.from("shift_rides").delete().eq("id", rideId);
    if (error) toast.error(error.message);
    else {
      toast.success("Ride eliminado");
      await loadRides();
      onRidesChanged?.();
    }
  };

  const generatePayments = async () => {
    if (rides.length === 0) return;
    setGeneratingPayments(true);

    // Get or verify concepts exist
    const { data: concepts } = await supabase
      .from("concepts")
      .select("id, name, default_rate")
      .eq("company_id", companyId)
      .in("name", ["Ride Regular", "Ride Special"])
      .eq("is_active", true);

    const conceptMap = new Map((concepts ?? []).map(c => [c.name, c]));

    if (!conceptMap.has("Ride Regular") && !conceptMap.has("Ride Special")) {
      toast.error("No se encontraron los conceptos 'Ride Regular' o 'Ride Special'. Créalos primero en Conceptos.");
      setGeneratingPayments(false);
      return;
    }

    // Get current period
    const today = new Date().toISOString().split("T")[0];
    const { data: period } = await supabase
      .from("pay_periods")
      .select("id")
      .eq("company_id", companyId)
      .lte("start_date", today)
      .gte("end_date", today)
      .maybeSingle();

    if (!period) {
      toast.error("No hay un periodo de pago activo para la fecha actual.");
      setGeneratingPayments(false);
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const ride of rides) {
      if (ride.movement_id) { skipped++; continue; }

      const conceptName = ride.ride_type === "special" ? "Ride Special" : "Ride Regular";
      const concept = conceptMap.get(conceptName) || conceptMap.get("Ride Regular");
      if (!concept) { skipped++; continue; }

      // Check employee-specific rate
      const { data: empRate } = await supabase
        .from("concept_employee_rates")
        .select("rate")
        .eq("employee_id", ride.driver_id)
        .eq("concept_id", concept.id)
        .maybeSingle();

      const rate = empRate?.rate ?? concept.default_rate ?? 0;

      const { data: movement, error } = await supabase
        .from("movements")
        .insert({
          company_id: companyId,
          period_id: period.id,
          employee_id: ride.driver_id,
          concept_id: concept.id,
          quantity: 1,
          rate,
          total_value: rate,
          note: `Auto: ${conceptName} - Turno`,
          approval_status: "pending",
        } as any)
        .select("id")
        .single();

      if (!error && movement) {
        await supabase.from("shift_rides").update({ movement_id: movement.id } as any).eq("id", ride.id);
        created++;
      }
    }

    await loadRides();
    toast.success(`${created} pago${created !== 1 ? "s" : ""} generado${created !== 1 ? "s" : ""}${skipped > 0 ? `, ${skipped} omitido${skipped !== 1 ? "s" : ""} (ya tenían pago)` : ""}`);
    setGeneratingPayments(false);
  };

  const ridesWithPayment = rides.filter(r => r.movement_id).length;
  const ridesWithoutPayment = rides.filter(r => !r.movement_id).length;
  const assignedDriverIds = new Set(rides.map(r => r.driver_id));
  const availableDrivers = drivers.filter(d => !assignedDriverIds.has(d.id));

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl bg-muted/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span><strong>{totalAssigned}</strong> empleados asignados</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Car className="h-3.5 w-3.5 text-muted-foreground" />
            <span><strong>{vehiclesNeeded}</strong> vehículo{vehiclesNeeded !== 1 ? "s" : ""} necesario{vehiclesNeeded !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Capacidad: {MAX_PASSENGERS} pasajeros/vehículo</span>
          <span>{rides.length} ride{rides.length !== 1 ? "s" : ""} asignado{rides.length !== 1 ? "s" : ""}</span>
        </div>
        {rides.length < vehiclesNeeded && totalAssigned > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-warning">
            <AlertTriangle className="h-3 w-3" />
            Faltan {vehiclesNeeded - rides.length} vehículo{vehiclesNeeded - rides.length !== 1 ? "s" : ""} por asignar
          </div>
        )}
      </div>

      {/* Ride list */}
      {rides.length > 0 && (
        <div className="space-y-1.5">
          {rides.map(ride => {
            const driver = drivers.find(d => d.id === ride.driver_id) ||
              employees.find(e => e.id === ride.driver_id);
            return (
              <div
                key={ride.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                  ride.movement_id ? "border-earning/20 bg-earning/5" : "border-border/40"
                )}
              >
                <EmployeeAvatar
                  firstName={driver?.first_name ?? "?"}
                  lastName={driver?.last_name ?? ""}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {driver ? `${driver.first_name} ${driver.last_name}` : "Conductor desconocido"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {ride.passenger_count} pasajero{ride.passenger_count !== 1 ? "s" : ""}
                  </p>
                </div>

                {canEdit && !ride.movement_id ? (
                  <>
                    <Select
                      value={ride.ride_type}
                      onValueChange={(v) => updateRide(ride.id, { ride_type: v as "regular" | "special" })}
                    >
                      <SelectTrigger className="h-7 w-[100px] text-[10px] border-0 font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">
                          <span className="text-[10px]">🚗 Regular</span>
                        </SelectItem>
                        <SelectItem value="special">
                          <span className="text-[10px]">⭐ Special</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => removeRide(ride.id)}
                      className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded-lg hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <Badge variant="outline" className={cn("text-[10px]",
                    ride.ride_type === "special" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-primary/10 text-primary border-primary/20"
                  )}>
                    {ride.ride_type === "special" ? "⭐ Special" : "🚗 Regular"}
                  </Badge>
                )}

                {ride.movement_id && (
                  <Badge variant="outline" className="text-[9px] bg-earning/10 text-earning border-earning/20">
                    <DollarSign className="h-2.5 w-2.5 mr-0.5" /> Pagado
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rides.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Sin rides asignados. Agrega conductores con vehículo.
        </p>
      )}

      {/* Add driver */}
      {canEdit && availableDrivers.length > 0 && (
        <div className="border border-dashed border-primary/25 rounded-xl p-3 space-y-2 bg-primary/5">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Plus className="h-3 w-3" /> Agregar conductor
          </p>
          <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
            {availableDrivers.map(d => (
              <Button
                key={d.id}
                variant="ghost"
                size="sm"
                className="h-8 text-xs justify-start gap-1.5 px-2"
                onClick={() => addRide(d.id)}
                disabled={saving}
              >
                <EmployeeAvatar firstName={d.first_name} lastName={d.last_name} size="sm" />
                {d.first_name} {d.last_name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {canEdit && availableDrivers.length === 0 && drivers.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          No hay empleados con vehículo registrado. Activa "¿Tiene carro?" en el perfil del empleado.
        </p>
      )}

      {/* Generate payments button */}
      {canEdit && ridesWithoutPayment > 0 && (
        <Button
          className="w-full h-9 text-xs gap-1.5"
          onClick={generatePayments}
          disabled={generatingPayments}
        >
          {generatingPayments ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <DollarSign className="h-3.5 w-3.5" />
          )}
          Generar pagos ({ridesWithoutPayment} ride{ridesWithoutPayment !== 1 ? "s" : ""})
        </Button>
      )}

      {ridesWithPayment > 0 && ridesWithoutPayment === 0 && (
        <p className="text-[10px] text-earning text-center font-medium">
          ✓ Todos los rides tienen pago generado
        </p>
      )}
    </div>
  );
}