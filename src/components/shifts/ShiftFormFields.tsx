/**
 * ShiftFormFields — single source of truth for all operational shift fields.
 *
 * Used by BOTH the create dialog (Shifts.tsx) and the edit dialog
 * (ShiftEditDialog.tsx). Guarantees field/validation parity between the two
 * flows: any new field added here is immediately available in create AND edit.
 *
 * Design choice: this is a **controlled component**. The owning dialog still
 * keeps its own `useState` for form state (so create can have repeat/quickAdd
 * inline workflows and edit can do material-change detection), but renders
 * the field tree through this single component. Field markup, layout and
 * validation messaging cannot drift apart anymore.
 */
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CalendarIcon, Clock, Building2, Users, Hash, CreditCard, FileText, Car, Compass,
  Plus, Loader2, ChevronDown, Settings2, MapPin, QrCode,
} from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { SingleEmployeePicker } from "./SingleEmployeePicker";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { ShiftQRSection } from "./ShiftQRSection";
import type { Employee, SelectOption, Shift, Assignment } from "./types";

export interface LocationOption extends SelectOption {
  address?: string;
  client_id?: string | null;
  default_pay_type?: string | null;
  default_clock_method?: string | null;
  require_car?: boolean | null;
  default_instructions?: string | null;
}

/** All operational fields a shift exposes. Single source of truth. */
export interface ShiftFormState {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  slots: string;
  clientId: string;
  locationId: string;
  notes: string;
  claimable: boolean;
  meetingPoint: string;
  specialInstructions: string;
  payType: "hourly" | "daily";
  dayType: "full_day" | "half_day";
  shiftAdminId: string;
  clockMethod: "mobile" | "kiosk" | "both";
  // Transport
  transportRequired: boolean;
  carCapacity: string;
  transportNotes: string;
  driverEmployeeId: string;
  // Selected workforce (only meaningful in CREATE; edit handles assignments via its own UI)
  selectedEmployees: string[];
}

export interface ShiftFormFieldsProps {
  mode: "create" | "edit";
  value: ShiftFormState;
  onChange: (patch: Partial<ShiftFormState>) => void;

  /** Reference data */
  clients: SelectOption[];
  locations: LocationOption[];
  employees: Employee[];
  /** All shifts/assignments (for conflict detection in EmployeeCombobox) */
  shifts?: Shift[];
  assignments?: Assignment[];

  /** Availability data for EmployeeCombobox warnings */
  availabilityConfigs?: any[];
  availabilityOverrides?: any[];

  /** Whether the company allows shift claims (hides the checkbox if not) */
  allowClaims?: boolean;

  /** Quick-add inline (create flow uses this; edit can pass no-ops or wire it too) */
  onQuickAddClient?: (name: string) => Promise<void>;
  onQuickAddLocation?: (name: string, address: string) => Promise<void>;
  /** Open the full employee invite wizard */
  onAddNewEmployee?: () => void;

  /** EDIT mode only: the shift being edited (for QR section + admin candidate filtering) */
  shift?: Shift | null;
  /** EDIT mode only: handler for the QR section */
  qrAttendanceMode?: string;
  qrToken?: string | null;
  onQrUpdate?: (updates: { qr_attendance_mode?: string; qr_token?: string | null }) => void;

  /** Show the assign-employees combobox (CREATE mode). Edit has its own assignment UI. */
  showEmployeePicker?: boolean;

  /** Validation hint: when true, admin field shows an error border */
  adminError?: string | null;
}

function SectionCard({
  icon: Icon, title, required, children,
}: { icon: any; title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
        <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-3 w-3 text-primary" />
        </div>
        <span className="text-[11px] font-semibold text-foreground">
          {title}{required && <span className="text-destructive ml-0.5">*</span>}
        </span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

export function ShiftFormFields({
  mode,
  value: v,
  onChange,
  clients,
  locations,
  employees,
  shifts = [],
  assignments = [],
  availabilityConfigs,
  availabilityOverrides,
  allowClaims = true,
  onQuickAddClient,
  onQuickAddLocation,
  onAddNewEmployee,
  shift,
  qrAttendanceMode,
  qrToken,
  onQrUpdate,
  showEmployeePicker = false,
  adminError,
}: ShiftFormFieldsProps) {
  // Local UI state (popovers + quick-add inline forms)
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);

  // Handlers ----------------------------------------------------------------
  const handleClientChange = (newClientId: string) => {
    const id = newClientId === "none" ? "" : newClientId;
    onChange({ clientId: id });
    if (id) {
      const loc = locations.find(l => l.client_id === id && l.address);
      if (loc?.address) onChange({ meetingPoint: loc.address });
    }
  };

  const handleLocationChange = (newLocId: string) => {
    const id = newLocId === "none" ? "" : newLocId;
    const patch: Partial<ShiftFormState> = { locationId: id };
    if (id) {
      const loc = locations.find(l => l.id === id);
      if (loc) {
        if (loc.address) patch.meetingPoint = loc.address;
        if (loc.default_pay_type) patch.payType = loc.default_pay_type as "hourly" | "daily";
        if (loc.default_clock_method) patch.clockMethod = loc.default_clock_method as any;
        if (loc.require_car) patch.transportRequired = true;
        if (loc.default_instructions) patch.specialInstructions = loc.default_instructions;
      }
    }
    onChange(patch);
  };

  const handleQuickAddClientLocal = async () => {
    if (!newClientName.trim() || !onQuickAddClient) return;
    setAddingClient(true);
    try {
      await onQuickAddClient(newClientName.trim());
      setNewClientName(""); setShowAddClient(false);
    } finally {
      setAddingClient(false);
    }
  };

  const handleQuickAddLocationLocal = async () => {
    if (!newLocationName.trim() || !onQuickAddLocation) return;
    setAddingLocation(true);
    try {
      await onQuickAddLocation(newLocationName.trim(), newLocationAddress.trim());
      setNewLocationName(""); setNewLocationAddress(""); setShowAddLocation(false);
    } finally {
      setAddingLocation(false);
    }
  };

  // Admin candidate logic — when employees are assigned, restrict to that pool
  const shiftAssignedIds = mode === "edit" && shift
    ? assignments.filter(a => a.shift_id === shift.id && a.status !== "rejected" && a.status !== "removed").map(a => a.employee_id)
    : v.selectedEmployees;
  const adminCandidates = shiftAssignedIds.length > 0
    ? employees.filter(e => shiftAssignedIds.includes(e.id))
    : employees;

  const toggleEmployee = (id: string) => {
    const isSelected = v.selectedEmployees.includes(id);
    onChange({
      selectedEmployees: isSelected
        ? v.selectedEmployees.filter(x => x !== id)
        : [...v.selectedEmployees, id],
    });
  };

  return (
    <div className="space-y-3">
      {/* ── Basic info ── */}
      <SectionCard icon={Hash} title="Información básica">
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">
            Nombre del turno <span className="text-muted-foreground/40">(opcional)</span>
          </Label>
          <Input
            value={v.title}
            onChange={e => onChange({ title: e.target.value })}
            placeholder="Ej: Evento corporativo, Servicio VIP..."
            className="h-9 text-sm mt-1"
          />
          {mode === "create" && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              El código de turno (#0001) se asigna automáticamente.
            </p>
          )}
        </div>
      </SectionCard>

      {/* ── Schedule ── */}
      <SectionCard icon={Clock} title="Horario">
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">Fecha</Label>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full h-9 text-sm justify-start font-normal mt-1", !v.date && "text-muted-foreground")}
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {v.date
                  ? format(parse(v.date, "yyyy-MM-dd", new Date()), "EEEE d 'de' MMMM yyyy", { locale: es })
                  : "Seleccionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={v.date ? parse(v.date, "yyyy-MM-dd", new Date()) : undefined}
                onSelect={d => {
                  if (d) {
                    onChange({ date: format(d, "yyyy-MM-dd") });
                    setDatePickerOpen(false);
                  }
                }}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Entrada</Label>
            <Input
              type="time"
              value={v.startTime}
              onChange={e => onChange({ startTime: e.target.value })}
              className="h-9 text-sm mt-1"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Salida</Label>
            <Input
              type="time"
              value={v.endTime}
              onChange={e => onChange({ endTime: e.target.value })}
              className="h-9 text-sm mt-1"
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Assignment ── */}
      <SectionCard icon={Building2} title="Asignación">
        <div className="grid grid-cols-2 gap-3">
          {/* Client */}
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Cliente</Label>
            <div className="flex gap-1 mt-1">
              <Select value={v.clientId || "none"} onValueChange={handleClientChange}>
                <SelectTrigger className="h-9 text-sm flex-1">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{formatDisplayText(c.name, "name")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {onQuickAddClient && (
                <Popover open={showAddClient} onOpenChange={setShowAddClient}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Agregar cliente">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="end">
                    <p className="text-xs font-medium mb-2">Nuevo cliente</p>
                    <div className="flex gap-1.5">
                      <Input
                        value={newClientName}
                        onChange={e => setNewClientName(e.target.value)}
                        placeholder="Nombre del cliente"
                        className="h-8 text-sm"
                        onKeyDown={e => e.key === "Enter" && handleQuickAddClientLocal()}
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={handleQuickAddClientLocal}
                        disabled={addingClient || !newClientName.trim()}
                      >
                        {addingClient ? <Loader2 className="h-3 w-3 animate-spin" /> : "Crear"}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
          {/* Location */}
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Ubicación</Label>
            <div className="flex gap-1 mt-1">
              <Select value={v.locationId || "none"} onValueChange={handleLocationChange}>
                <SelectTrigger className="h-9 text-sm flex-1">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {onQuickAddLocation && (
                <Popover open={showAddLocation} onOpenChange={setShowAddLocation}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Agregar ubicación">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="end">
                    <p className="text-xs font-medium mb-2">Nueva ubicación</p>
                    <div className="space-y-1.5">
                      <Input
                        value={newLocationName}
                        onChange={e => setNewLocationName(e.target.value)}
                        placeholder="Nombre"
                        className="h-8 text-sm"
                      />
                      <Input
                        value={newLocationAddress}
                        onChange={e => setNewLocationAddress(e.target.value)}
                        placeholder="Dirección (opcional)"
                        className="h-8 text-sm"
                        onKeyDown={e => e.key === "Enter" && handleQuickAddLocationLocal()}
                      />
                      <Button
                        size="sm"
                        className="h-8 w-full text-xs"
                        onClick={handleQuickAddLocationLocal}
                        disabled={addingLocation || !newLocationName.trim()}
                      >
                        {addingLocation ? <Loader2 className="h-3 w-3 animate-spin" /> : "Crear"}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Plazas disponibles</Label>
            <Input
              type="number"
              min="1"
              value={v.slots}
              onChange={e => onChange({ slots: e.target.value })}
              className="h-9 text-sm mt-1"
            />
          </div>
          {allowClaims && (
            <div className="flex items-center gap-2 h-9">
              <Checkbox
                checked={v.claimable}
                onCheckedChange={c => onChange({ claimable: !!c })}
                id={`claimable-${mode}`}
              />
              <Label htmlFor={`claimable-${mode}`} className="text-xs font-normal cursor-pointer">
                Permitir reclamo
              </Label>
            </div>
          )}
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <Compass className="h-3 w-3" /> Dirección / Punto de encuentro
          </Label>
          <Input
            value={v.meetingPoint}
            onChange={e => onChange({ meetingPoint: e.target.value })}
            placeholder="Se autocompleta con el cliente, o escribe manualmente..."
            className="h-9 text-sm mt-1"
          />
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            Se prefillea desde el cliente pero puedes cambiarla.
          </p>
        </div>
      </SectionCard>

      {/* ── Payment ── */}
      <SectionCard icon={CreditCard} title="Tipo de pago">
        <Select value={v.payType} onValueChange={val => onChange({ payType: val as "hourly" | "daily" })}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hourly">⏱ Por hora (reloj)</SelectItem>
            <SelectItem value="daily">📅 Por día (tarifa fija)</SelectItem>
          </SelectContent>
        </Select>
        {v.payType === "daily" && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground">Tarifa diaria automática al consolidar.</p>
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Jornada</Label>
              <Select value={v.dayType} onValueChange={val => onChange({ dayType: val as "full_day" | "half_day" })}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_day">☀️ Día completo ($200)</SelectItem>
                  <SelectItem value="half_day">🌤️ Medio día ($125)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Clock method + QR (QR only in edit, needs shift.id) ── */}
      <div className={cn("grid gap-3", mode === "edit" && shift ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
        <SectionCard icon={Clock} title="Método de fichaje">
          <Select
            value={v.clockMethod}
            onValueChange={val => onChange({ clockMethod: val as "mobile" | "kiosk" | "both" })}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="both">📱🖥 Ambos (Móvil + Kiosk)</SelectItem>
              <SelectItem value="mobile">📱 Solo Móvil</SelectItem>
              <SelectItem value="kiosk">🖥 Solo Kiosk</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">Define desde dónde pueden fichar los empleados.</p>
        </SectionCard>

        {mode === "edit" && shift && onQrUpdate && (
          <SectionCard icon={QrCode} title="Asistencia por QR">
            <ShiftQRSection
              shiftId={shift.id}
              qrToken={qrToken ?? null}
              qrAttendanceMode={qrAttendanceMode ?? "disabled"}
              onUpdate={onQrUpdate}
            />
          </SectionCard>
        )}
      </div>

      {/* ── Shift Admin (responsable operativo) ── */}
      <SectionCard
        icon={Users}
        title="Admin del turno"
        required={shiftAssignedIds.length > 0}
      >
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">
            Responsable operativo {shiftAssignedIds.length > 0 && <span className="text-destructive">*</span>}
          </Label>
          <Select
            value={v.shiftAdminId || "none"}
            onValueChange={val => onChange({ shiftAdminId: val === "none" ? "" : val })}
          >
            <SelectTrigger className={cn(
              "h-9 text-sm mt-1",
              adminError && "border-destructive/50 ring-1 ring-destructive/20",
            )}>
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin asignar</SelectItem>
              {adminCandidates.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {shiftAssignedIds.length === 0 ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Puedes designarlo ahora; al asignar empleados deberá ser uno de ellos.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Confirma asistencia del equipo. Debe ser uno de los empleados asignados.
            </p>
          )}
          {adminError && (
            <p className="text-[10px] text-destructive mt-0.5 font-medium">⛔ {adminError}</p>
          )}
        </div>
      </SectionCard>

      {/* ── Transportation ── */}
      <SectionCard icon={Car} title="Transporte">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={v.transportRequired}
            onCheckedChange={c => onChange({ transportRequired: !!c })}
            id={`transport-${mode}`}
          />
          <Label htmlFor={`transport-${mode}`} className="text-xs font-normal cursor-pointer">
            ¿Este turno requiere transporte?
          </Label>
        </div>
        {v.transportRequired && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground font-medium">Capacidad por vehículo</Label>
                <Input
                  type="number"
                  min="1"
                  value={v.carCapacity}
                  onChange={e => onChange({ carCapacity: e.target.value })}
                  className="h-9 text-sm mt-1"
                />
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-[11px] text-muted-foreground font-medium mb-1">Vehículos necesarios</p>
                <div className="h-9 flex items-center px-3 rounded-md border border-border/30 bg-muted/20 text-sm font-semibold">
                  {Math.ceil((parseInt(v.slots) || 1) / (parseInt(v.carCapacity) || 4))}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Conductor asignado</Label>
              <div className="mt-1">
                <SingleEmployeePicker
                  employees={employees}
                  value={v.driverEmployeeId || null}
                  onChange={(id) => onChange({ driverEmployeeId: id ?? "" })}
                  placeholder="Buscar conductor..."
                  emptyLabel="Sin asignar"
                  highlightDrivers
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Notas de transporte</Label>
              <Input
                value={v.transportNotes}
                onChange={e => onChange({ transportNotes: e.target.value })}
                placeholder="Ej: Recoger en oficina a las 7:30 AM"
                className="h-9 text-sm mt-1"
              />
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Advanced details (collapsed by default) ── */}
      <Collapsible defaultOpen={mode === "create"}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-border/30 bg-muted/20 hover:bg-muted/40 transition-colors group">
          <div className="flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground">Detalles adicionales</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <SectionCard icon={FileText} title="Notas e instrucciones">
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Notas internas</Label>
              <Textarea
                value={v.notes}
                onChange={e => onChange({ notes: e.target.value })}
                rows={2}
                placeholder="Opcional, visible solo para admins..."
                className="text-sm resize-none mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Instrucciones para el equipo</Label>
              <Textarea
                value={v.specialInstructions}
                onChange={e => onChange({ specialInstructions: e.target.value })}
                rows={2}
                placeholder="Ej: Llevar uniforme negro, llegar 15 min antes..."
                className="text-sm resize-none mt-1"
              />
            </div>
          </SectionCard>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Employee picker (CREATE mode only) ── */}
      {showEmployeePicker && (
        <SectionCard icon={Users} title="Asignar empleados">
          <EmployeeCombobox
            employees={employees}
            selected={v.selectedEmployees}
            onToggle={toggleEmployee}
            shifts={shifts}
            assignments={assignments}
            shiftDate={v.date}
            shiftStart={v.startTime}
            shiftEnd={v.endTime}
            maxHeight="150px"
            availabilityConfigs={availabilityConfigs}
            availabilityOverrides={availabilityOverrides}
            availabilityBlockMode="warning"
            onAddNewEmployee={onAddNewEmployee}
          />
        </SectionCard>
      )}
    </div>
  );
}
