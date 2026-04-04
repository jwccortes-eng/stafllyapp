import { useState, useEffect, useCallback } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Loader2, Save, CalendarIcon, Clock, Building2, MapPin, Users,
  StickyNote, CreditCard, Compass, FileText, X, Car, QrCode,
  ChevronDown, Settings2,
} from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { ShiftQRSection } from "./ShiftQRSection";
import type { Shift, SelectOption, Employee } from "./types";

interface LocationOption extends SelectOption {
  address?: string;
  client_id?: string | null;
}

interface ShiftEditDialogProps {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: SelectOption[];
  locations: LocationOption[];
  employees?: Employee[];
  assignments?: { shift_id: string; employee_id: string; status: string }[];
  onSave: (shiftId: string, updates: Partial<Shift> & Record<string, any>, oldShift: Shift) => Promise<void>;
}

function SectionCard({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
        <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-3 w-3 text-primary" />
        </div>
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

export function ShiftEditDialog({
  shift, open, onOpenChange, clients, locations, employees = [], assignments = [], onSave,
}: ShiftEditDialogProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [slots, setSlots] = useState("1");
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [claimable, setClaimable] = useState(false);
  const [meetingPoint, setMeetingPoint] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [payType, setPayType] = useState<"hourly" | "daily">("hourly");
  const [dayType, setDayType] = useState<"full_day" | "half_day">("full_day");
  const [shiftAdminId, setShiftAdminId] = useState("");
  const [clockMethod, setClockMethod] = useState<"mobile" | "kiosk" | "both">("both");
  // Transportation
  const [transportRequired, setTransportRequired] = useState(false);
  const [carCapacity, setCarCapacity] = useState("4");
  const [transportNotes, setTransportNotes] = useState("");
  const [driverEmployeeId, setDriverEmployeeId] = useState("");
  // QR
  const [qrAttendanceMode, setQrAttendanceMode] = useState("disabled");
  const [qrToken, setQrToken] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (shift && open) {
      const s = shift as any;
      setTitle(s.title);
      setDate(s.date);
      setStartTime(s.start_time.slice(0, 5));
      setEndTime(s.end_time.slice(0, 5));
      setSlots(String(s.slots ?? 1));
      setClientId(s.client_id || "");
      setLocationId(s.location_id || "");
      setNotes(s.notes || "");
      setClaimable(s.claimable);
      setMeetingPoint(s.meeting_point || "");
      setSpecialInstructions(s.special_instructions || "");
      setPayType(s.pay_type || "hourly");
      setDayType(s.day_type || "full_day");
      setShiftAdminId(s.shift_admin_id || "");
      setClockMethod(s.clock_method || "both");
      setTransportRequired(!!s.transportation_required);
      setCarCapacity(String(s.car_capacity ?? 4));
      setTransportNotes(s.transportation_notes || "");
      setDriverEmployeeId(s.driver_employee_id || "");
      setQrAttendanceMode(s.qr_attendance_mode || "disabled");
      setQrToken(s.qr_token || null);
    }
  }, [shift, open]);

  if (!shift) return null;
  if (shift.status === "locked") return null;

  const handleClientChange = (v: string) => {
    const newId = v === "none" ? "" : v;
    setClientId(newId);
    if (newId) {
      const loc = locations.find(l => l.client_id === newId && l.address);
      if (loc?.address) setMeetingPoint(loc.address);
    }
  };

  // Compute assigned employee IDs for admin validation
  const shiftAssignedIds = shift ? assignments.filter(a => a.shift_id === shift.id && a.status !== "rejected" && a.status !== "removed").map(a => a.employee_id) : [];
  const adminIsAssigned = !shiftAdminId || shiftAssignedIds.includes(shiftAdminId);
  const adminMissing = !shiftAdminId && shiftAssignedIds.length > 0;

  const handleSave = async () => {
    if (!date) return;
    // Hard rule: if employees are assigned, admin must be set and must be one of them
    if (shiftAssignedIds.length > 0 && !shiftAdminId) {
      toast.error("Selecciona un admin del turno antes de guardar. El responsable operativo es obligatorio.");
      return;
    }
    if (shiftAdminId && shiftAssignedIds.length > 0 && !shiftAssignedIds.includes(shiftAdminId)) {
      toast.error("El admin del turno debe ser uno de los empleados asignados.");
      return;
    }
    setSaving(true);
    try {
      await onSave(shift.id, {
        title: title.trim(), date, start_time: startTime, end_time: endTime,
        slots: parseInt(slots) || 1, client_id: clientId || null,
        location_id: locationId || null, notes: notes.trim() || null, claimable,
        meeting_point: meetingPoint.trim() || null,
        special_instructions: specialInstructions.trim() || null,
        pay_type: payType, day_type: payType === "daily" ? dayType : "full_day",
        shift_admin_id: shiftAdminId || null,
        clock_method: clockMethod,
        transportation_required: transportRequired,
        car_capacity: parseInt(carCapacity) || 4,
        transportation_notes: transportNotes.trim() || null,
        driver_employee_id: driverEmployeeId || null,
        qr_attendance_mode: qrAttendanceMode,
      }, shift);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] p-0 gap-0 overflow-hidden flex flex-col rounded-2xl border-border/30 shadow-xl">
        {/* Hero header */}
        <div className="relative px-5 pt-5 pb-4 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 -translate-y-12 translate-x-12 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold font-[var(--font-heading)]">Editar turno</h2>
              <button onClick={() => onOpenChange(false)} className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Modifica los detalles del turno</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">

          {/* ── Basic info ── */}
          <SectionCard icon={StickyNote} title="Información básica">
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Nombre del turno <span className="text-muted-foreground/40">(opcional)</span></Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Evento corporativo, Servicio VIP..." className="h-9 text-sm mt-1" />
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">El código de turno se asigna automáticamente.</p>
            </div>
          </SectionCard>

          {/* ── Schedule ── */}
          <SectionCard icon={Clock} title="Horario">
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Fecha</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full h-9 text-sm justify-start font-normal mt-1", !date && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {date ? format(parse(date, "yyyy-MM-dd", new Date()), "EEEE d 'de' MMMM yyyy", { locale: es }) : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date ? parse(date, "yyyy-MM-dd", new Date()) : undefined}
                    onSelect={d => { if (d) { setDate(format(d, "yyyy-MM-dd")); setDatePickerOpen(false); } }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground font-medium">Entrada</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground font-medium">Salida</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
            </div>
          </SectionCard>

          {/* ── Assignment ── */}
          <SectionCard icon={Building2} title="Asignación">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground font-medium">Cliente</Label>
                <Select value={clientId || "none"} onValueChange={handleClientChange}>
                  <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{formatDisplayText(c.name, "name")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground font-medium">Ubicación</Label>
                <Select value={locationId || "none"} onValueChange={v => setLocationId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label className="text-[11px] text-muted-foreground font-medium">Plazas disponibles</Label>
                <Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" className="h-9 text-sm mt-1" />
              </div>
              <div className="flex items-center gap-2 h-9">
                <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="edit-claimable" />
                <Label htmlFor="edit-claimable" className="text-xs font-normal cursor-pointer">Permitir reclamo</Label>
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <Compass className="h-3 w-3" /> Dirección / Punto de encuentro
              </Label>
              <Input value={meetingPoint} onChange={e => setMeetingPoint(e.target.value)} placeholder="Se autocompleta con el cliente, o escribe manualmente..." className="h-9 text-sm mt-1" />
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">Se prefillea desde el cliente pero puedes cambiarla.</p>
            </div>
          </SectionCard>

          {/* ── Payment ── */}
          <SectionCard icon={CreditCard} title="Tipo de pago">
            <Select value={payType} onValueChange={v => setPayType(v as "hourly" | "daily")}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">⏱ Por hora (reloj)</SelectItem>
                <SelectItem value="daily">📅 Por día (tarifa fija)</SelectItem>
              </SelectContent>
            </Select>
            {payType === "daily" && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground">Tarifa diaria automática al consolidar.</p>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Jornada</Label>
                  <Select value={dayType} onValueChange={v => setDayType(v as "full_day" | "half_day")}>
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

          {/* ── Clock & QR (always visible) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SectionCard icon={Clock} title="Método de fichaje">
              <Select value={clockMethod} onValueChange={v => setClockMethod(v as "mobile" | "kiosk" | "both")}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">📱🖥 Ambos (Móvil + Kiosk)</SelectItem>
                  <SelectItem value="mobile">📱 Solo Móvil</SelectItem>
                  <SelectItem value="kiosk">🖥 Solo Kiosk</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Define desde dónde pueden fichar los empleados.</p>
            </SectionCard>

            <SectionCard icon={QrCode} title="Asistencia por QR">
              <ShiftQRSection
                shiftId={shift.id}
                qrToken={qrToken}
                qrAttendanceMode={qrAttendanceMode}
                onUpdate={(updates) => {
                  if (updates.qr_attendance_mode !== undefined) setQrAttendanceMode(updates.qr_attendance_mode);
                  if (updates.qr_token !== undefined) setQrToken(updates.qr_token);
                }}
              />
            </SectionCard>
          </div>

          {/* ── Roles: Admin (required when employees assigned) ── */}
          <SectionCard icon={Users} title={shiftAssignedIds.length > 0 ? "Admin del turno *" : "Admin del turno"}>
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">
                Responsable operativo {shiftAssignedIds.length > 0 && <span className="text-destructive">*</span>}
              </Label>
              {(() => {
                const adminCandidates = shiftAssignedIds.length > 0
                  ? employees.filter(e => shiftAssignedIds.includes(e.id))
                  : employees;
                return (
                  <>
                    <Select value={shiftAdminId || "none"} onValueChange={v => setShiftAdminId(v === "none" ? "" : v)}>
                      <SelectTrigger className={cn("h-9 text-sm mt-1", adminMissing && "border-destructive/50 ring-1 ring-destructive/20")}>
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {adminCandidates.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {shiftAssignedIds.length === 0 && (
                      <p className="text-[10px] text-amber-500 mt-0.5">⚠ Asigna empleados primero para seleccionar admin.</p>
                    )}
                    {adminMissing && (
                      <p className="text-[10px] text-destructive mt-0.5 font-medium">⛔ Obligatorio: selecciona un responsable antes de guardar.</p>
                    )}
                    {shiftAdminId && !adminIsAssigned && shiftAssignedIds.length > 0 && (
                      <p className="text-[10px] text-destructive mt-0.5 font-medium">⛔ El admin seleccionado no está asignado al turno.</p>
                    )}
                  </>
                );
              })()}
              <p className="text-[10px] text-muted-foreground mt-0.5">Confirma asistencia del equipo.</p>
            </div>
          </SectionCard>

          <SectionCard icon={Car} title="Transporte">
            <div className="flex items-center gap-2">
              <Checkbox checked={transportRequired} onCheckedChange={c => setTransportRequired(!!c)} id="edit-transport" />
              <Label htmlFor="edit-transport" className="text-xs font-normal cursor-pointer">¿Este turno requiere transporte?</Label>
            </div>
            {transportRequired && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground font-medium">Capacidad por vehículo</Label>
                    <Input type="number" min="1" value={carCapacity} onChange={e => setCarCapacity(e.target.value)} className="h-9 text-sm mt-1" />
                  </div>
                  <div className="flex flex-col justify-end">
                    <p className="text-[11px] text-muted-foreground font-medium mb-1">Vehículos necesarios</p>
                    <div className="h-9 flex items-center px-3 rounded-md border border-border/30 bg-muted/20 text-sm font-semibold">
                      {Math.ceil((parseInt(slots) || 1) / (parseInt(carCapacity) || 4))}
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Conductor asignado</Label>
                  <Select value={driverEmployeeId || "none"} onValueChange={v => setDriverEmployeeId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Notas de transporte</Label>
                  <Input value={transportNotes} onChange={e => setTransportNotes(e.target.value)} placeholder="Ej: Recoger en oficina a las 7:30 AM" className="h-9 text-sm mt-1" />
                </div>
              </>
            )}
          </SectionCard>

          {/* ── Advanced options (collapsed by default) ── */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-border/30 bg-muted/20 hover:bg-muted/40 transition-colors group">
              <div className="flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground">Opciones avanzadas</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <SectionCard icon={FileText} title="Detalles adicionales">
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Notas</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcional..." className="text-sm resize-none mt-1" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Instrucciones especiales</Label>
                  <Textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} rows={2} placeholder="Ej: Llevar uniforme negro..." className="text-sm resize-none mt-1" />
                </div>
              </SectionCard>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/30 bg-muted/10">
          <Button onClick={handleSave} disabled={saving || !date} className="w-full h-10 text-sm gap-2 rounded-xl font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
