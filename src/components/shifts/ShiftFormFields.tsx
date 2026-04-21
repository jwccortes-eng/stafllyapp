/**
 * ShiftFormFields — single source of truth for all operational shift fields.
 *
 * Used by BOTH the create dialog (Shifts.tsx) and the edit dialog
 * (ShiftEditDialog.tsx). Guarantees field/validation parity between the two
 * flows: any new field added here is immediately available in create AND edit.
 *
 * Design choice: this is a **controlled component**. The owning dialog still
 * keeps its own form state (so create can have repeat/quickAdd inline workflows
 * and edit can do material-change detection), but renders the field tree
 * through this single component. Field markup, layout and validation messaging
 * cannot drift apart anymore.
 */
import { useState } from "react";
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
  CalendarIcon,
  Clock,
  Building2,
  Users,
  Hash,
  CreditCard,
  FileText,
  Car,
  Compass,
  Plus,
  Loader2,
  ChevronDown,
  Settings2,
  QrCode,
  ScanLine,
} from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { SingleEmployeePicker } from "./SingleEmployeePicker";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { ShiftQRSection } from "./ShiftQRSection";
import ShiftLocationsSection from "./ShiftLocationsSection";
import type { Employee, SelectOption, Shift, Assignment } from "./types";
import {
  SHIFT_ATTENDANCE_MODE_LABELS,
  SHIFT_ATTENDANCE_MODE_HINTS,
  defaultAttendanceModeForPayType,
  type ShiftAttendanceMode,
} from "@/lib/shift-attendance-mode";

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
  /** Operational attendance mode (clock vs arrival vs hybrid). */
  attendanceMode: ShiftAttendanceMode;
  /** Optional operational call time (HH:MM); falls back to startTime for punctuality. */
  meetingTime: string;
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

  /** Quick-add inline (passing nothing hides the +button) */
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

  /** Validation hint: when truthy, admin field shows an error border + message */
  adminError?: string | null;
}

function SectionCard({
  icon: Icon,
  title,
  required,
  children,
}: {
  icon: any;
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
        <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-3 w-3 text-primary" />
        </div>
        <span className="text-[11px] font-semibold text-foreground">
          {title}
          {required && <span className="text-destructive ml-0.5">*</span>}
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
    const patch: Partial<ShiftFormState> = { clientId: id };
    if (id) {
      const loc = locations.find((l) => l.client_id === id && l.address);
      if (loc?.address) patch.meetingPoint = loc.address;
    }
    onChange(patch);
  };

  const handleLocationChange = (newLocId: string) => {
    const id = newLocId === "none" ? "" : newLocId;
    const patch: Partial<ShiftFormState> = { locationId: id };
    if (id) {
      const loc = locations.find((l) => l.id === id);
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
      setNewClientName("");
      setShowAddClient(false);
    } finally {
      setAddingClient(false);
    }
  };

  const handleQuickAddLocationLocal = async () => {
    if (!newLocationName.trim() || !onQuickAddLocation) return;
    setAddingLocation(true);
    try {
      await onQuickAddLocation(newLocationName.trim(), newLocationAddress.trim());
      setNewLocationName("");
      setNewLocationAddress("");
      setShowAddLocation(false);
    } finally {
      setAddingLocation(false);
    }
  };

  // Admin candidate logic — when employees are assigned, restrict to that pool
  const shiftAssignedIds =
    mode === "edit" && shift
      ? assignments
          .filter((a) => a.shift_id === shift.id && a.status !== "rejected" && a.status !== "removed")
          .map((a) => a.employee_id)
      : v.selectedEmployees;
  const adminCandidates =
    shiftAssignedIds.length > 0 ? employees.filter((e) => shiftAssignedIds.includes(e.id)) : employees;

  const toggleEmployee = (id: string) => {
    const isSelected = v.selectedEmployees.includes(id);
    onChange({
      selectedEmployees: isSelected ? v.selectedEmployees.filter((x) => x !== id) : [...v.selectedEmployees, id],
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
            onChange={(e) => onChange({ title: e.target.value })}
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
                onSelect={(d) => {
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
              onChange={(e) => onChange({ startTime: e.target.value })}
              className="h-9 text-sm mt-1"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Salida</Label>
            <Input
              type="time"
              value={v.endTime}
              onChange={(e) => onChange({ endTime: e.target.value })}
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
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {formatDisplayText(c.name, "name")}
                    </SelectItem>
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
                        onChange={(e) => setNewClientName(e.target.value)}
                        placeholder="Nombre del cliente"
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleQuickAddClientLocal()}
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
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
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
                        onChange={(e) => setNewLocationName(e.target.value)}
                        placeholder="Nombre"
                        className="h-8 text-sm"
                      />
                      <Input
                        value={newLocationAddress}
                        onChange={(e) => setNewLocationAddress(e.target.value)}
                        placeholder="Dirección (opcional)"
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleQuickAddLocationLocal()}
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
              onChange={(e) => onChange({ slots: e.target.value })}
              className="h-9 text-sm mt-1"
            />
          </div>
          {allowClaims && (
            <div className="flex items-center gap-2 h-9">
              <Checkbox
                checked={v.claimable}
                onCheckedChange={(c) => onChange({ claimable: !!c })}
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
            onChange={(e) => onChange({ meetingPoint: e.target.value })}
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
        <Select
          value={v.payType}
          onValueChange={(val) => {
            const newPayType = val as "hourly" | "daily";
            // Auto-suggest attendance mode if user hasn't customized it (still on the
            // default of the previous pay type). Daily → arrival, Hourly → clock.
            const currentDefault = defaultAttendanceModeForPayType(v.payType);
            const patch: any = { payType: newPayType };
            if (v.attendanceMode === currentDefault) {
              patch.attendanceMode = defaultAttendanceModeForPayType(newPayType);
            }
            onChange(patch);
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
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
              <Select value={v.dayType} onValueChange={(val) => onChange({ dayType: val as "full_day" | "half_day" })}>
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_day">☀️ Día completo</SelectItem>
                  <SelectItem value="half_day">🌤️ Medio día</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Attendance Mode + Meeting Time (operational presence) ── */}
      <SectionCard icon={ScanLine} title="Control de asistencia">
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">Modo</Label>
          <Select
            value={v.attendanceMode}
            onValueChange={(val) => onChange({ attendanceMode: val as ShiftAttendanceMode })}
          >
            <SelectTrigger className="h-9 text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clock">⏱ {SHIFT_ATTENDANCE_MODE_LABELS.clock}</SelectItem>
              <SelectItem value="arrival">📍 {SHIFT_ATTENDANCE_MODE_LABELS.arrival}</SelectItem>
              <SelectItem value="hybrid">🔀 {SHIFT_ATTENDANCE_MODE_LABELS.hybrid}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground mt-0.5">{SHIFT_ATTENDANCE_MODE_HINTS[v.attendanceMode]}</p>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" /> Hora de convocatoria (opcional)
          </Label>
          <Input
            type="time"
            value={v.meetingTime}
            onChange={(e) => onChange({ meetingTime: e.target.value })}
            className="h-9 text-sm mt-1"
            placeholder="--:--"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Si se define, se usa para calcular puntualidad en lugar de la hora de inicio del turno.
          </p>
        </div>
      </SectionCard>

      {/* ── Clock method + QR (QR only in edit, needs shift.id) ── */}
      <div
        className={cn(
          "grid gap-3",
          mode === "edit" && shift && onQrUpdate ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        )}
      >
        <SectionCard icon={Clock} title="Método de fichaje">
          <Select
            value={v.clockMethod}
            onValueChange={(val) => onChange({ clockMethod: val as "mobile" | "kiosk" | "both" })}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
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
      <SectionCard icon={Users} title="Admin del turno" required={shiftAssignedIds.length > 0}>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">
            Responsable operativo {shiftAssignedIds.length > 0 && <span className="text-destructive">*</span>}
          </Label>
          <Select
            value={v.shiftAdminId || "none"}
            onValueChange={(val) => onChange({ shiftAdminId: val === "none" ? "" : val })}
          >
            <SelectTrigger
              className={cn("h-9 text-sm mt-1", adminError && "border-destructive/50 ring-1 ring-destructive/20")}
            >
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin asignar</SelectItem>
              {adminCandidates.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </SelectItem>
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
          {adminError && <p className="text-[10px] text-destructive mt-0.5 font-medium">⛔ {adminError}</p>}
        </div>
      </SectionCard>

      {/* ── Transportation ── */}
      <SectionCard icon={Car} title="Transporte">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={v.transportRequired}
            onCheckedChange={(c) => onChange({ transportRequired: !!c })}
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
                  onChange={(e) => onChange({ carCapacity: e.target.value })}
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
                onChange={(e) => onChange({ transportNotes: e.target.value })}
                placeholder="Ej: Recoger en oficina a las 7:30 AM"
                className="h-9 text-sm mt-1"
              />
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Advanced details (open by default in CREATE so users see it once) ── */}
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
                onChange={(e) => onChange({ notes: e.target.value })}
                rows={2}
                placeholder="Opcional, visible solo para admins..."
                className="text-sm resize-none mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Instrucciones para el equipo</Label>
              <Textarea
                value={v.specialInstructions}
                onChange={(e) => onChange({ specialInstructions: e.target.value })}
                rows={2}
                placeholder="Ej: Llevar uniforme negro, llegar 15 min antes..."
                className="text-sm resize-none mt-1"
              />
            </div>
          </SectionCard>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Employee picker (CREATE mode only — edit has its own assignment UI) ── */}
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

/** Empty form state with sensible defaults; used by both create and edit. */
export const EMPTY_SHIFT_FORM_STATE: ShiftFormState = {
  title: "",
  date: "",
  startTime: "08:00",
  endTime: "17:00",
  slots: "1",
  clientId: "",
  locationId: "",
  notes: "",
  claimable: false,
  meetingPoint: "",
  specialInstructions: "",
  payType: "hourly",
  dayType: "full_day",
  shiftAdminId: "",
  clockMethod: "both",
  attendanceMode: "clock",
  meetingTime: "",
  transportRequired: false,
  carCapacity: "4",
  transportNotes: "",
  driverEmployeeId: "",
  selectedEmployees: [],
};

/** Map a Shift row from DB → ShiftFormState (used by edit dialog). */
export function shiftToFormState(shift: Shift): ShiftFormState {
  const s = shift as any;
  return {
    title: s.title ?? "",
    date: s.date ?? "",
    startTime: (s.start_time ?? "08:00").slice(0, 5),
    endTime: (s.end_time ?? "17:00").slice(0, 5),
    slots: String(s.slots ?? 1),
    clientId: s.client_id ?? "",
    locationId: s.location_id ?? "",
    notes: s.notes ?? "",
    claimable: !!s.claimable,
    meetingPoint: s.meeting_point ?? "",
    specialInstructions: s.special_instructions ?? "",
    payType: (s.pay_type as "hourly" | "daily") ?? "hourly",
    dayType: (s.day_type as "full_day" | "half_day") ?? "full_day",
    shiftAdminId: s.shift_admin_id ?? "",
    clockMethod: (s.clock_method as "mobile" | "kiosk" | "both") ?? "both",
    attendanceMode:
      (s.attendance_mode as ShiftAttendanceMode | undefined) ?? defaultAttendanceModeForPayType(s.pay_type),
    meetingTime: s.meeting_time ? String(s.meeting_time).slice(0, 5) : "",
    transportRequired: !!s.transportation_required,
    carCapacity: String(s.car_capacity ?? 4),
    transportNotes: s.transportation_notes ?? "",
    driverEmployeeId: s.driver_employee_id ?? "",
    selectedEmployees: [],
  };
}

/** Map ShiftFormState → DB row payload (column names). */
export function formStateToShiftPayload(s: ShiftFormState, allowClaims: boolean): Record<string, any> {
  return {
    title: s.title.trim(),
    date: s.date,
    start_time: s.startTime,
    end_time: s.endTime,
    slots: parseInt(s.slots) || 1,
    client_id: s.clientId || null,
    location_id: s.locationId || null,
    notes: s.notes.trim() || null,
    claimable: allowClaims ? s.claimable : false,
    meeting_point: s.meetingPoint.trim() || null,
    special_instructions: s.specialInstructions.trim() || null,
    pay_type: s.payType,
    day_type: s.payType === "daily" ? s.dayType : "full_day",
    shift_admin_id: s.shiftAdminId || null,
    clock_method: s.clockMethod,
    attendance_mode: s.attendanceMode,
    meeting_time: s.meetingTime ? s.meetingTime : null,
    transportation_required: s.transportRequired,
    car_capacity: parseInt(s.carCapacity) || 4,
    transportation_notes: s.transportNotes.trim() || null,
    driver_employee_id: s.driverEmployeeId || null,
  };
}
