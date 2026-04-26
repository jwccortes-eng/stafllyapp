/**
 * ShiftFormFields — single source of truth for all operational shift fields.
 *
 * Used by BOTH the create dialog (Shifts.tsx) and the edit dialog
 * (ShiftEditDialog.tsx). Guarantees field/validation parity between the two
 * flows: any new field added here is immediately available in create AND edit.
 *
 * FASE 1 (UX): orden operativo natural de secciones, sin cambios de payload.
 * 1) Identidad → 2) Lugar → 3) Equipo → 4) Transporte → 5) Pago →
 * 6) Fichaje → 7) Admin del turno → 8) Notas → 9) Resumen final
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
  QrCode,
  ScanLine,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  MapPin,
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
  // Premium structured locations (Phase 1B). Optional, opt-in upgrade.
  meetingPointLocationId: string | null;
  jobSiteLocationId: string | null;
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

  /** Required to enable premium structured locations (Phase 1B). When omitted the section is hidden. */
  companyId?: string | null;
}

function SectionCard({
  icon: Icon,
  title,
  required,
  step,
  children,
}: {
  icon: any;
  title: string;
  required?: boolean;
  step?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
        {step !== undefined && (
          <div className="h-5 w-5 rounded-md bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">
            {step}
          </div>
        )}
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
  companyId = null,
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

  // ── Computed summary signals ────────────────────────────────────────────
  const slotsNum = parseInt(v.slots) || 0;
  const capacityNum = parseInt(v.carCapacity) || 5;
  const ridesNeeded = v.transportRequired ? Math.ceil(Math.max(slotsNum, 1) / Math.max(capacityNum, 1)) : 0;
  const adminMissing = shiftAssignedIds.length > 0 && !v.shiftAdminId;
  const adminInvalid =
    !!v.shiftAdminId && shiftAssignedIds.length > 0 && !shiftAssignedIds.includes(v.shiftAdminId);
  const driverMissing = v.transportRequired && !v.driverEmployeeId;
  const noLocation = !v.locationId && !v.meetingPoint.trim() && !v.meetingPointLocationId && !v.jobSiteLocationId;

  return (
    <div className="space-y-3">
      {/* ── 1. IDENTIDAD ── */}
      <SectionCard icon={Hash} title="Identidad del turno" step={1}>
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

        <div>
          <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" /> Hora de convocatoria <span className="text-muted-foreground/40">(opcional)</span>
          </Label>
          <Input
            type="time"
            value={v.meetingTime}
            onChange={(e) => onChange({ meetingTime: e.target.value })}
            className="h-9 text-sm mt-1"
            placeholder="--:--"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Si se define, se usa para calcular puntualidad en lugar de la hora de inicio.
          </p>
        </div>
      </SectionCard>

      {/* ── 2. LUGAR ── */}
      <SectionCard icon={MapPin} title="Lugar" step={2}>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">Ubicación / Job site</Label>
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
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Lugar real donde se ejecuta el servicio.
          </p>
        </div>

        {/* Premium structured locations (Phase 1B): Job site + Meeting point estructurados */}
        {companyId && (
          <ShiftLocationsSection
            companyId={companyId}
            meetingPointLocationId={v.meetingPointLocationId}
            jobSiteLocationId={v.jobSiteLocationId}
            onChange={(patch) => {
              const next: Partial<ShiftFormState> = {};
              if (patch.meetingPointLocationId !== undefined) next.meetingPointLocationId = patch.meetingPointLocationId;
              if (patch.jobSiteLocationId !== undefined) next.jobSiteLocationId = patch.jobSiteLocationId;
              if (patch.meetingPointText !== undefined && patch.meetingPointText) next.meetingPoint = patch.meetingPointText;
              onChange(next);
            }}
          />
        )}

        <div>
          <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <Compass className="h-3 w-3" /> Punto de encuentro / Meeting point
          </Label>
          <Input
            value={v.meetingPoint}
            onChange={(e) => onChange({ meetingPoint: e.target.value })}
            placeholder="Dirección, link de Google Maps o lugar..."
            className="h-9 text-sm mt-1"
          />
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Dónde se reúne el equipo antes de operar. Pegar links de Google Maps con parser automático llega en Fase 2.
          </p>
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <FileText className="h-3 w-3" /> Indicaciones para llegar / Directions
          </Label>
          <Textarea
            value={v.specialInstructions}
            onChange={(e) => onChange({ specialInstructions: e.target.value })}
            rows={2}
            placeholder="Ej: Entrar por la puerta lateral, parking en sótano 2..."
            className="text-sm resize-none mt-1"
          />
        </div>
      </SectionCard>

      {/* ── 3. EQUIPO ── */}
      <SectionCard icon={Users} title="Equipo" step={3}>
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

        {showEmployeePicker && (
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium mb-1 block">Asignar empleados</Label>
            <EmployeeCombobox
              employees={employees}
              selected={v.selectedEmployees}
              onToggle={toggleEmployee}
              shifts={shifts}
              assignments={assignments}
              shiftDate={v.date}
              shiftStart={v.startTime}
              shiftEnd={v.endTime}
              maxHeight="180px"
              availabilityConfigs={availabilityConfigs}
              availabilityOverrides={availabilityOverrides}
              availabilityBlockMode="warning"
              onAddNewEmployee={onAddNewEmployee}
            />
          </div>
        )}
      </SectionCard>

      {/* ── 4. TRANSPORTE ── */}
      <SectionCard icon={Car} title="Transporte" step={4}>
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
                  {ridesNeeded}
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

      {/* ── 5. PAGO ── */}
      <SectionCard icon={CreditCard} title="Pago" step={5}>
        <Select
          value={v.payType}
          onValueChange={(val) => {
            const newPayType = val as "hourly" | "daily";
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
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                Editable después de la creación, incluso después del turno.
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/15">
          <CreditCard className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-snug">
            <span className="font-semibold text-foreground">Tasa base:</span> el perfil del empleado.
            Lo definido aquí <span className="font-semibold">solo sobrescribe este turno</span>.
          </p>
        </div>
      </SectionCard>

      {/* ── 6. FICHAJE / ASISTENCIA ── */}
      <SectionCard icon={ScanLine} title="Fichaje / Asistencia" step={6}>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">Modo de asistencia</Label>
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
          <Label className="text-[11px] text-muted-foreground font-medium">Método de fichaje</Label>
          <Select
            value={v.clockMethod}
            onValueChange={(val) => onChange({ clockMethod: val as "mobile" | "kiosk" | "both" })}
          >
            <SelectTrigger className="h-9 text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">📱🖥 Ambos (Móvil + Kiosk)</SelectItem>
              <SelectItem value="mobile">📱 Solo Móvil</SelectItem>
              <SelectItem value="kiosk">🖥 Solo Kiosk</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "edit" && shift && onQrUpdate && (
          <div className="pt-1 border-t border-border/20">
            <div className="flex items-center gap-1.5 mb-2 mt-2">
              <QrCode className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-semibold text-foreground">Asistencia por QR</span>
            </div>
            <ShiftQRSection
              shiftId={shift.id}
              qrToken={qrToken ?? null}
              qrAttendanceMode={qrAttendanceMode ?? "disabled"}
              onUpdate={onQrUpdate}
            />
          </div>
        )}
      </SectionCard>

      {/* ── 7. ADMIN DEL TURNO (después del staffing) ── */}
      <SectionCard icon={Users} title="Admin del turno" required={shiftAssignedIds.length > 0} step={7}>
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
              Asigna primero el equipo; el admin debe ser uno de los empleados asignados.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Confirma asistencia del equipo. Debe ser uno de los empleados asignados.
            </p>
          )}
          {adminError && <p className="text-[10px] text-destructive mt-0.5 font-medium">⛔ {adminError}</p>}
        </div>
      </SectionCard>

      {/* ── 8. NOTAS INTERNAS ── */}
      <SectionCard icon={FileText} title="Notas internas" step={8}>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">
            Notas internas <span className="text-muted-foreground/40">(solo admins)</span>
          </Label>
          <Textarea
            value={v.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={2}
            placeholder="Información operativa visible solo para admins..."
            className="text-sm resize-none mt-1"
          />
        </div>
      </SectionCard>

      {/* ── 9. RESUMEN FINAL ── */}
      <SectionCard icon={ListChecks} title="Resumen final" step={9}>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg border border-border/30 bg-muted/10 p-2">
            <div className="text-[10px] text-muted-foreground">Plazas</div>
            <div className="font-semibold text-foreground">{slotsNum || "—"}</div>
          </div>
          <div className="rounded-lg border border-border/30 bg-muted/10 p-2">
            <div className="text-[10px] text-muted-foreground">Asignados</div>
            <div className="font-semibold text-foreground">{shiftAssignedIds.length}</div>
          </div>
          <div className="rounded-lg border border-border/30 bg-muted/10 p-2">
            <div className="text-[10px] text-muted-foreground">Vehículos</div>
            <div className="font-semibold text-foreground">{v.transportRequired ? ridesNeeded : "—"}</div>
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          {!v.date && (
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> Falta la fecha del turno.
            </div>
          )}
          {noLocation && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(var(--status-pending))]">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> No se ha definido lugar ni punto de encuentro.
            </div>
          )}
          {adminMissing && (
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> Falta seleccionar el admin del turno (obligatorio con equipo asignado).
            </div>
          )}
          {adminInvalid && (
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> El admin seleccionado no está dentro del equipo asignado.
            </div>
          )}
          {driverMissing && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(var(--status-pending))]">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> Transporte activado pero sin conductor asignado.
            </div>
          )}
          {showEmployeePicker && shiftAssignedIds.length > 0 && shiftAssignedIds.length < slotsNum && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(var(--status-pending))]">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              Cobertura parcial: {shiftAssignedIds.length} de {slotsNum} plazas cubiertas.
            </div>
          )}
          {!adminMissing && !adminInvalid && !driverMissing && v.date && !noLocation && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(142_76%_36%)]">
              <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" /> Listo para guardar.
            </div>
          )}
        </div>
      </SectionCard>
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
  carCapacity: "5",
  transportNotes: "",
  driverEmployeeId: "",
  selectedEmployees: [],
  meetingPointLocationId: null,
  jobSiteLocationId: null,
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
    carCapacity: String(s.car_capacity ?? 5),
    transportNotes: s.transportation_notes ?? "",
    driverEmployeeId: s.driver_employee_id ?? "",
    selectedEmployees: [],
    meetingPointLocationId: s.meeting_point_location_id ?? null,
    jobSiteLocationId: s.job_site_location_id ?? null,
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
    car_capacity: parseInt(s.carCapacity) || 5,
    transportation_notes: s.transportNotes.trim() || null,
    driver_employee_id: s.driverEmployeeId || null,
    meeting_point_location_id: s.meetingPointLocationId || null,
    job_site_location_id: s.jobSiteLocationId || null,
  };
}
