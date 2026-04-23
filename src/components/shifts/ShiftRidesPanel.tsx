import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Popover removed: driver picker now uses unified SingleEmployeePicker
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Car, Plus, Trash2, Loader2, DollarSign, Users, AlertTriangle, Settings2, Search, Check, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPersonName } from "@/lib/format-helpers";
import { SingleEmployeePicker } from "./SingleEmployeePicker";
import { EmployeeInviteDialog } from "@/components/employee/EmployeeInviteDialog";
import { ShiftShareMenu } from "./ShiftShareMenu";
import { isEmployeeDriver, type Assignment, type Employee } from "./types";

const MAX_PASSENGERS = 5;

interface ShiftRide {
  id: string;
  driver_id: string;
  ride_type: "regular" | "special";
  passenger_count: number;
  movement_id: string | null;
  notes: string | null;
}

interface Concept {
  id: string;
  name: string;
  default_rate: number | null;
}

interface ConceptMapping {
  regular_concept_id: string | null;
  special_concept_id: string | null;
}

interface ShiftRidesPanelProps {
  shiftId: string;
  companyId: string;
  assignments: Assignment[];
  employees: Employee[];
  canEdit: boolean;
  /** Optional shift context for share-link CTAs (date / time / title). */
  shiftContext?: { title: string; date: string; start_time: string; shift_link_token?: string | null };
  onRidesChanged?: () => void;
}

export function ShiftRidesPanel({
  shiftId, companyId, assignments, employees, canEdit, shiftContext, onRidesChanged,
}: ShiftRidesPanelProps) {
  const [rides, setRides] = useState<ShiftRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<Employee[]>([]);
  const [allConcepts, setAllConcepts] = useState<Concept[]>([]);
  const [mapping, setMapping] = useState<ConceptMapping>({ regular_concept_id: null, special_concept_id: null });
  const [saving, setSaving] = useState(false);
  const [generatingPayments, setGeneratingPayments] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  /** Driver currently being invited (controls EmployeeInviteDialog). */
  const [inviteEmployee, setInviteEmployee] = useState<Employee | null>(null);

  // Load drivers from the active company.
  // Authoritative source: can_drive=true. Legacy fallback: has_car contains "yes/sí/si"
  // or any free-form text the employee wrote ("Yes, I have a Car", "Sí tengo carro", etc.).
  // We fetch all active employees of the company and filter client-side via isEmployeeDriver
  // so that string variants and the boolean column are honored consistently.
  const loadDrivers = useCallback(async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("id, first_name, last_name, avatar_url, gender, phone_number, email, employee_role, has_car, can_drive, user_id, access_pin, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("first_name");
    if (error) {
      console.error("[ShiftRidesPanel] loadDrivers failed", error);
      setDrivers([]);
      return;
    }
    const all = (data ?? []) as Employee[];
    const onlyDrivers = all.filter(isEmployeeDriver);
    setDrivers(onlyDrivers);
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

  // Load all active concepts + mapping config
  const loadConceptsAndMapping = useCallback(async () => {
    const [conceptsRes, mappingRes] = await Promise.all([
      supabase.from("concepts")
        .select("id, name, default_rate")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name"),
      supabase.from("company_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "ride_concept_mapping")
        .maybeSingle(),
    ]);

    const concepts = (conceptsRes.data ?? []) as Concept[];
    setAllConcepts(concepts);

    const stored = mappingRes.data?.value as unknown as ConceptMapping | null;
    if (stored?.regular_concept_id || stored?.special_concept_id) {
      setMapping({
        regular_concept_id: stored.regular_concept_id ?? null,
        special_concept_id: stored.special_concept_id ?? null,
      });
    } else {
      // Auto-detect by common name patterns (English + Spanish)
      const findByPatterns = (patterns: string[]) =>
        concepts.find(c => patterns.some(p => c.name.toLowerCase().includes(p.toLowerCase())))?.id ?? null;

      setMapping({
        regular_concept_id: findByPatterns(["ride regular", "transporte regular", "ride normal"]),
        special_concept_id: findByPatterns(["ride special", "transporte especial", "ride especial"]),
      });
    }
  }, [companyId]);

  useEffect(() => {
    loadRides();
    loadDrivers();
    loadConceptsAndMapping();
  }, [loadRides, loadDrivers, loadConceptsAndMapping]);

  const totalAssigned = assignments.filter(a => a.shift_id === shiftId).length;
  const vehiclesNeeded = Math.ceil(totalAssigned / MAX_PASSENGERS);
  const totalPassengersAssigned = rides.reduce((sum, r) => sum + r.passenger_count, 0);
  const ridesWithPayment = rides.filter(r => r.movement_id).length;
  const ridesWithoutPayment = rides.filter(r => !r.movement_id).length;
  const mappingComplete = !!(mapping.regular_concept_id && mapping.special_concept_id);

  // (driver search filtering moved into SingleEmployeePicker)

  /**
   * Decide invite path before opening the dialog. Reuses the central
   * resolve-applicant-identity edge function so the same logic that drives
   * /apply/:slug also drives this admin-side action:
   *   - new           → registro/onboarding (here we just open the invite flow)
   *   - existing_no_portal / existing_inactive → activación (open invite)
   *   - existing_active → cuenta lista, no reinvitar (sólo aviso)
   *   - pending_application → ya hay invitación pendiente (sólo aviso)
   */
  const handleInviteEmployee = useCallback(async (emp: Employee) => {
    if ((emp as any).is_active === false) {
      toast.error("Reactivate this driver before sending an invitation.");
      return;
    }
    const phone = (emp.phone_number ?? "").replace(/\D/g, "");
    if (!phone && !emp.email) {
      toast.error("Este empleado no tiene teléfono ni email para invitar.");
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("resolve-applicant-identity", {
        body: { company_id: companyId, phone, email: emp.email ?? undefined },
      });
      if (error) throw error;
      const scenario = (data as { scenario?: string } | null)?.scenario;
      if (scenario === "existing_active") {
        toast.success(`${formatPersonName(emp.first_name)} ya tiene cuenta activa.`);
        return;
      }
      if (scenario === "pending_application") {
        toast.message("Ya hay una solicitud pendiente para este teléfono.");
        // Still open the dialog so admin can resend / copy link.
      }
      // For new / existing_no_portal / existing_inactive → abrir invitación.
    } catch (err: unknown) {
      // Don't block the admin if resolver fails — fall through to invite dialog.
      console.warn("[ShiftRidesPanel] phone resolution failed (non-blocking):", err);
    }
    setInviteEmployee(emp);
  }, [companyId]);

  const saveMapping = async (next: ConceptMapping) => {
    setMapping(next);
    const { error } = await supabase.from("company_settings").upsert({
      company_id: companyId,
      key: "ride_concept_mapping",
      value: next as any,
    } as any, { onConflict: "company_id,key" });
    if (error) toast.error("No se pudo guardar el mapeo: " + error.message);
    else toast.success("Mapeo de conceptos guardado");
  };

  const addRide = async (driverId: string) => {
    setSaving(true);
    const remainingPassengers = Math.max(0, totalAssigned - totalPassengersAssigned);
    const passengerCount = Math.min(MAX_PASSENGERS, remainingPassengers || MAX_PASSENGERS);

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
    if (!mappingComplete) {
      toast.error("Mapea los conceptos de Ride Regular y Special primero");
      setMappingOpen(true);
      return;
    }
    setGeneratingPayments(true);

    const conceptById = new Map(allConcepts.map(c => [c.id, c]));

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

      const conceptId = ride.ride_type === "special" ? mapping.special_concept_id : mapping.regular_concept_id;
      const concept = conceptId ? conceptById.get(conceptId) : null;
      if (!concept) { skipped++; continue; }

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
          note: `Auto: ${concept.name} - Turno`,
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
    toast.success(`${created} pago${created !== 1 ? "s" : ""} generado${created !== 1 ? "s" : ""}${skipped > 0 ? `, ${skipped} omitido${skipped !== 1 ? "s" : ""}` : ""}`);
    setGeneratingPayments(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
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
          <span>{rides.length} ride{rides.length !== 1 ? "s" : ""} asignado{rides.length !== 1 ? "s" : ""} · {totalPassengersAssigned}/{totalAssigned} cubiertos</span>
        </div>
        {rides.length < vehiclesNeeded && totalAssigned > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-warning">
            <AlertTriangle className="h-3 w-3" />
            Faltan {vehiclesNeeded - rides.length} vehículo{vehiclesNeeded - rides.length !== 1 ? "s" : ""} por asignar
          </div>
        )}
      </div>

      {/* Concept mapping warning + manage */}
      {canEdit && !mappingComplete && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-2.5 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
          <p className="text-[11px] text-warning-foreground flex-1">
            Conceptos de pago no mapeados. Configura cuál concepto pagará Regular y Special.
          </p>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setMappingOpen(true)}>
            Configurar
          </Button>
        </div>
      )}

      {/* Mapping sheet (inline) */}
      {mappingOpen && (
        <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold flex items-center gap-1.5">
              <Settings2 className="h-3 w-3" /> Mapeo de conceptos de Rides
            </p>
            <button onClick={() => setMappingOpen(false)} className="text-muted-foreground hover:text-foreground">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Ride Regular paga →</label>
              <Select
                value={mapping.regular_concept_id ?? ""}
                onValueChange={(v) => saveMapping({ ...mapping, regular_concept_id: v })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecciona concepto..." /></SelectTrigger>
                <SelectContent>
                  {allConcepts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="text-xs">{c.name} {c.default_rate ? `· $${c.default_rate}` : ""}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Ride Special paga →</label>
              <Select
                value={mapping.special_concept_id ?? ""}
                onValueChange={(v) => saveMapping({ ...mapping, special_concept_id: v })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecciona concepto..." /></SelectTrigger>
                <SelectContent>
                  {allConcepts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="text-xs">{c.name} {c.default_rate ? `· $${c.default_rate}` : ""}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {allConcepts.length === 0 && (
              <p className="text-[10px] text-destructive">
                No hay conceptos activos. Crea conceptos en Conceptos primero.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Ride list */}
      {rides.length > 0 && (
        <div className="space-y-1.5">
          {rides.map(ride => {
            const driver = drivers.find(d => d.id === ride.driver_id) ||
              employees.find(e => e.id === ride.driver_id);
            const driverPortalActive = !!driver?.user_id;
            const driverHasContact = !!(driver?.phone_number || driver?.email);
            const driverNeedsInvite = canEdit && !!driver && !driverPortalActive && driverHasContact;
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
                  avatarUrl={driver?.avatar_url}
                  gender={driver?.gender}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate flex items-center gap-1.5">
                    {driver ? `${driver.first_name} ${driver.last_name}` : "Conductor desconocido"}
                    {driver && (
                      driverPortalActive ? (
                        <Badge variant="outline" className="text-[9px] bg-[hsl(var(--earning))]/12 text-[hsl(var(--earning))] border-[hsl(var(--earning))]/25">
                          Activo
                        </Badge>
                      ) : driver.access_pin ? (
                        <Badge variant="outline" className="text-[9px] bg-warning/12 text-warning border-warning/25">
                          Pendiente
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground border-border/40">
                          Sin acceso
                        </Badge>
                      )
                    )}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {canEdit && !ride.movement_id ? (
                      <Input
                        type="number"
                        min={1}
                        max={MAX_PASSENGERS}
                        value={ride.passenger_count}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(MAX_PASSENGERS, parseInt(e.target.value) || 1));
                          updateRide(ride.id, { passenger_count: v });
                        }}
                        className="h-5 w-12 text-[10px] px-1.5 py-0"
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{ride.passenger_count}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      pasajero{ride.passenger_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {driverNeedsInvite && driver && (
                  <div className="flex items-center gap-1">
                    {/* PRIMARY — keep onboarding flow first. */}
                    <button
                      type="button"
                      onClick={() => handleInviteEmployee(driver)}
                      title={driver.access_pin ? "Reenviar invitación" : "Enviar invitación / link de acceso"}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                      {driver.access_pin ? <RefreshCw className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                      {driver.access_pin ? "Reenviar" : "Invitar"}
                    </button>
                    {/* SECONDARY — copy shift link (smart-link), never replaces the primary CTA. */}
                    {shiftContext && (
                      <ShiftShareMenu
                        shiftId={shiftId}
                        token={shiftContext.shift_link_token}
                        title={shiftContext.title}
                        date={shiftContext.date}
                        startTime={shiftContext.start_time}
                        recipientName={`${driver.first_name} ${driver.last_name}`}
                        recipientPhone={driver.phone_number}
                        compact
                        variant="ghost"
                        className="h-6 px-1.5"
                      />
                    )}
                  </div>
                )}

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
                    ride.ride_type === "special" ? "bg-warning/10 text-warning border-warning/25" : "bg-primary/10 text-primary border-primary/20"
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

      {/* Add driver — unified searchable picker (allows duplicates with usage badge) */}
      {canEdit && drivers.length > 0 && (
        <div className="space-y-1">
          <SingleEmployeePicker
            employees={drivers}
            value={null}
            onChange={(id) => { if (id) addRide(id); }}
            placeholder="Buscar conductor..."
            emptyLabel={`+ Agregar ride (${drivers.length} conductor${drivers.length !== 1 ? "es" : ""})`}
            allowClear={false}
            highlightDrivers
            showPortalState
            onInviteEmployee={handleInviteEmployee}
            usageCount={(id) => rides.filter(r => r.driver_id === id).length}
            disabled={saving}
            triggerClassName="border-dashed"
          />
          <p className="text-[10px] text-muted-foreground px-1">
            Puedes asignar el mismo conductor varias veces si hay varios viajes.
          </p>
        </div>
      )}

      {canEdit && drivers.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          No hay empleados con vehículo registrado. Activa "¿Tiene carro?" en el perfil del empleado.
        </p>
      )}

      {/* Manage mapping access */}
      {canEdit && mappingComplete && !mappingOpen && (
        <button
          onClick={() => setMappingOpen(true)}
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
        >
          <Settings2 className="h-2.5 w-2.5" /> Cambiar mapeo de conceptos
        </button>
      )}

      {/* Generate payments button */}
      {canEdit && ridesWithoutPayment > 0 && (
        <Button
          className="w-full h-9 text-xs gap-1.5"
          onClick={generatePayments}
          disabled={generatingPayments || !mappingComplete}
        >
          {generatingPayments ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <DollarSign className="h-3.5 w-3.5" />
          )}
          {!mappingComplete
            ? "Configura mapeo para generar pagos"
            : `Generar pagos (${ridesWithoutPayment} ride${ridesWithoutPayment !== 1 ? "s" : ""})`
          }
        </Button>
      )}

      {ridesWithPayment > 0 && ridesWithoutPayment === 0 && (
        <p className="text-[10px] text-earning text-center font-medium">
          ✓ Todos los rides tienen pago generado
        </p>
      )}

      {/* Invite dialog: opens when admin clicks Invitar/Reenviar inline.
          Reuses the canonical EmployeeInviteDialog so portal token, channel,
          delivery status and resend logic stay consistent across the app. */}
      {inviteEmployee && (
        <EmployeeInviteDialog
          open={!!inviteEmployee}
          onOpenChange={(o) => { if (!o) setInviteEmployee(null); }}
          employee={inviteEmployee as unknown as Record<string, any>}
          onInviteSent={() => {
            // Refresh drivers so the portal-state badge updates immediately.
            loadDrivers();
          }}
        />
      )}
    </div>
  );
}
