import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Save, CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Shift, SelectOption } from "./types";

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
  onSave: (shiftId: string, updates: Partial<Shift> & { meeting_point?: string | null; special_instructions?: string | null; pay_type?: string; day_type?: string; shift_admin_id?: string | null }, oldShift: Shift) => Promise<void>;
}

export function ShiftEditDialog({
  shift, open, onOpenChange, clients, locations, onSave,
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
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (shift && open) {
      setTitle(shift.title);
      setDate(shift.date);
      setStartTime(shift.start_time.slice(0, 5));
      setEndTime(shift.end_time.slice(0, 5));
      setSlots(String(shift.slots ?? 1));
      setClientId(shift.client_id || "");
      setLocationId(shift.location_id || "");
      setNotes(shift.notes || "");
      setClaimable(shift.claimable);
      setMeetingPoint((shift as any).meeting_point || "");
      setSpecialInstructions((shift as any).special_instructions || "");
      setPayType((shift as any).pay_type || "hourly");
      setDayType((shift as any).day_type || "full_day");
      setShiftAdminId((shift as any).shift_admin_id || "");
    }
  }, [shift, open]);

  if (!shift) return null;
  if (shift.status === "locked") return null; // Locked shifts cannot be edited

  const handleClientChange = (v: string) => {
    const newId = v === "none" ? "" : v;
    setClientId(newId);
    if (newId) {
      const loc = locations.find(l => l.client_id === newId && l.address);
      if (loc?.address) setMeetingPoint(loc.address);
    }
  };

  const handleSave = async () => {
    if (!date) return;
    setSaving(true);
    try {
      await onSave(shift.id, {
        title: title.trim(),
        date,
        start_time: startTime,
        end_time: endTime,
        slots: parseInt(slots) || 1,
        client_id: clientId || null,
        location_id: locationId || null,
        notes: notes.trim() || null,
        claimable,
        meeting_point: meetingPoint.trim() || null,
        special_instructions: specialInstructions.trim() || null,
        pay_type: payType,
        day_type: payType === "daily" ? dayType : "full_day",
        shift_admin_id: shiftAdminId || null,
      }, shift);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Editar turno</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Nombre del turno</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Turno mañana" className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Fecha</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full h-9 text-sm justify-start font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {date ? format(parse(date, "yyyy-MM-dd", new Date()), "d MMM yyyy", { locale: es }) : "Seleccionar"}
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
            <div>
              <Label className="text-xs text-muted-foreground">Entrada</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Salida</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <Select value={clientId || "none"} onValueChange={handleClientChange}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Ubicación</Label>
              <Select value={locationId || "none"} onValueChange={v => setLocationId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">Plazas disponibles</Label>
              <Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" className="h-9 text-sm" />
            </div>
            <div className="flex items-center gap-2 h-9">
              <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="edit-claimable" />
              <Label htmlFor="edit-claimable" className="text-xs font-normal cursor-pointer">Permitir reclamo</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tipo de pago</Label>
            <Select value={payType} onValueChange={v => setPayType(v as "hourly" | "daily")}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">⏱ Por hora (reloj)</SelectItem>
                <SelectItem value="daily">📅 Por día (tarifa fija)</SelectItem>
              </SelectContent>
            </Select>
            {payType === "daily" && (
              <>
                <p className="text-[10px] text-muted-foreground mt-0.5">Tarifa diaria automática al consolidar.</p>
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">Jornada</Label>
                  <Select value={dayType} onValueChange={v => setDayType(v as "full_day" | "half_day")}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_day">☀️ Día completo ($200)</SelectItem>
                      <SelectItem value="half_day">🌤️ Medio día ($125)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notas adicionales</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcional..." className="text-sm resize-none" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">📍 Dirección / Punto de encuentro</Label>
            <Input value={meetingPoint} onChange={e => setMeetingPoint(e.target.value)} placeholder="Se autocompleta al seleccionar cliente..." className="h-9 text-sm" />
            {meetingPoint && clientId && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Puedes editar la dirección manualmente.</p>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">📋 Instrucciones adicionales</Label>
            <Textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} rows={2} placeholder="Ej: Llevar uniforme negro..." className="text-sm resize-none" />
          </div>
          <Button onClick={handleSave} disabled={saving || !date} className="w-full h-9 text-sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
