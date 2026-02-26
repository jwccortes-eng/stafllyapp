import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save } from "lucide-react";
import type { Shift, SelectOption } from "./types";

interface ShiftEditDialogProps {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: SelectOption[];
  locations: SelectOption[];
  onSave: (shiftId: string, updates: Partial<Shift>, oldShift: Shift) => Promise<void>;
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
  const [saving, setSaving] = useState(false);

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
    }
  }, [shift, open]);

  if (!shift) return null;

  const handleSave = async () => {
    if (!title.trim() || !date) return;
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
      }, shift);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar turno</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Fecha *</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><Label>Inicio</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <div><Label>Fin</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cliente</Label>
              <Select value={clientId || "none"} onValueChange={v => setClientId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ubicación</Label>
              <Select value={locationId || "none"} onValueChange={v => setLocationId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguna</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Plazas</Label><Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" /></div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="edit-claimable" />
              <Label htmlFor="edit-claimable" className="text-sm">Reclamable</Label>
            </div>
          </div>
          <div><Label>Notas</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          <Button onClick={handleSave} disabled={saving || !title.trim() || !date} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
