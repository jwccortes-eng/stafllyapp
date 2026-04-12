import { useState, useMemo, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Settings2 } from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import type { SelectOption } from "./types";

interface LocationOption extends SelectOption {
  client_id?: string | null;
}

interface QuickCreateData {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  client_id: string;
  location_id: string;
  slots: number;
}

interface QuickCreatePopoverProps {
  /** Target date (yyyy-MM-dd) */
  date: string;
  clients: SelectOption[];
  locations: LocationOption[];
  /** Called to create a draft shift directly */
  onQuickCreate: (data: QuickCreateData) => Promise<void>;
  /** Called to open the full create dialog with pre-filled data */
  onOpenFull: (prefill: QuickCreateData) => void;
  children: React.ReactNode;
}

export function QuickCreatePopover({
  date, clients, locations, onQuickCreate, onOpenFull, children,
}: QuickCreatePopoverProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [slots, setSlots] = useState("1");
  const [saving, setSaving] = useState(false);

  // Reset form when popover opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setStartTime("08:00");
      setEndTime("17:00");
      setClientId("");
      setLocationId("");
      setSlots("1");
    }
  }, [open]);

  // Auto-select location when client has exactly 1
  const clientLocations = useMemo(() => {
    if (!clientId) return [];
    return locations.filter(l => l.client_id === clientId);
  }, [clientId, locations]);

  const needsLocationChoice = clientLocations.length > 1;
  const autoLocation = clientLocations.length === 1 ? clientLocations[0] : null;

  useEffect(() => {
    if (autoLocation) {
      setLocationId(autoLocation.id);
    } else if (clientLocations.length === 0) {
      setLocationId("");
    }
  }, [autoLocation, clientLocations.length]);

  const handleClientChange = (v: string) => {
    setClientId(v === "none" ? "" : v);
    setLocationId("");
  };

  const getData = (): QuickCreateData => ({
    title: title.trim() || "Turno",
    date,
    start_time: startTime,
    end_time: endTime,
    client_id: clientId,
    location_id: locationId,
    slots: parseInt(slots) || 1,
  });

  const handleCreate = async () => {
    // If client has multiple locations and none selected, force full dialog
    if (needsLocationChoice && !locationId) {
      onOpenFull(getData());
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onQuickCreate(getData());
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFull = () => {
    onOpenFull(getData());
    setOpen(false);
  };

  const dateLabel = useMemo(() => {
    try {
      return format(parse(date, "yyyy-MM-dd", new Date()), "EEE d MMM", { locale: es });
    } catch { return date; }
  }, [date]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 rounded-xl shadow-lg border-border/30"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border/20 bg-muted/20 rounded-t-xl">
          <p className="text-[11px] font-semibold capitalize">
            Nuevo turno · {dateLabel}
          </p>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Title */}
          <div>
            <Label className="text-[10px] text-muted-foreground">Título</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Turno"
              className="h-8 text-[11px] mt-0.5"
              autoFocus
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Entrada</Label>
              <Input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="h-8 text-[11px] mt-0.5"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Salida</Label>
              <Input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="h-8 text-[11px] mt-0.5"
              />
            </div>
          </div>

          {/* Client */}
          <div>
            <Label className="text-[10px] text-muted-foreground">Cliente</Label>
            <Select value={clientId || "none"} onValueChange={handleClientChange}>
              <SelectTrigger className="h-8 text-[11px] mt-0.5">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {formatDisplayText(c.name, "name")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location — only show if client has multiple */}
          {needsLocationChoice && (
            <div>
              <Label className="text-[10px] text-muted-foreground">Ubicación</Label>
              <Select value={locationId || "none"} onValueChange={v => setLocationId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-[11px] mt-0.5">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar</SelectItem>
                  {clientLocations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Auto-selected location label */}
          {autoLocation && (
            <p className="text-[9px] text-muted-foreground/60">
              📍 {autoLocation.name} (auto)
            </p>
          )}

          {/* Slots */}
          <div>
            <Label className="text-[10px] text-muted-foreground">Plazas</Label>
            <Input
              type="number"
              min={1}
              value={slots}
              onChange={e => setSlots(e.target.value)}
              className="h-8 text-[11px] w-20 mt-0.5"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-2.5 border-t border-border/20 flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1 h-8 text-[11px] gap-1.5 rounded-lg"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Crear borrador
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] gap-1 rounded-lg px-2.5"
            onClick={handleOpenFull}
          >
            <Settings2 className="h-3 w-3" />
            Más
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
