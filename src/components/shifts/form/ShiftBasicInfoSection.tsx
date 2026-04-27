/**
 * ShiftBasicInfoSection — first card of the shift form.
 * Title, client, date, start/end, meeting time, slots.
 *
 * Memoized so typing in other sections doesn't re-render this one.
 */
import { memo, useState } from "react";
import { CalendarIcon, Clock, Hash, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { SectionCard } from "./section-card";
import type { SelectOption } from "../types";

interface Props {
  mode: "create" | "edit";
  title: string;
  clientId: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingTime: string;
  slots: string;
  clients: SelectOption[];
  onChange: (patch: {
    title?: string;
    clientId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    meetingTime?: string;
    slots?: string;
  }) => void;
  onQuickAddClient?: (name: string) => Promise<void>;
}

function ShiftBasicInfoSectionImpl({
  mode,
  title,
  clientId,
  date,
  startTime,
  endTime,
  meetingTime,
  slots,
  clients,
  onChange,
  onQuickAddClient,
}: Props) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [adding, setAdding] = useState(false);

  const submitNew = async () => {
    if (!newClientName.trim() || !onQuickAddClient) return;
    setAdding(true);
    try {
      await onQuickAddClient(newClientName.trim());
      setNewClientName("");
      setShowAddClient(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <SectionCard icon={Hash} title="Información principal" subtitle="Lo esencial del turno: qué, quién y cuándo.">
      <div>
        <Label className="text-[11px] text-muted-foreground font-medium">
          Título del turno <span className="text-muted-foreground/40">(opcional)</span>
        </Label>
        <Input
          value={title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Ej: Evento corporativo, Servicio VIP…"
          className="h-9 text-sm mt-1"
        />
        {mode === "create" && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            El código de turno (#0001) se asigna automáticamente.
          </p>
        )}
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground font-medium">Cliente</Label>
        <div className="flex gap-1 mt-1">
          <Select
            value={clientId || "none"}
            onValueChange={(v) => onChange({ clientId: v === "none" ? "" : v })}
          >
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
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
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
                    onKeyDown={(e) => e.key === "Enter" && submitNew()}
                  />
                  <Button size="sm" className="h-8 px-3 text-xs" onClick={submitNew} disabled={adding || !newClientName.trim()}>
                    {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Crear"}
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
              className={cn(
                "w-full h-9 text-sm justify-start font-normal mt-1",
                !date && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {date
                ? format(parse(date, "yyyy-MM-dd", new Date()), "EEEE d 'de' MMMM yyyy", { locale: es })
                : "Seleccionar"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date ? parse(date, "yyyy-MM-dd", new Date()) : undefined}
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
            value={startTime}
            onChange={(e) => onChange({ startTime: e.target.value })}
            className="h-9 text-sm mt-1"
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">Salida</Label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => onChange({ endTime: e.target.value })}
            className="h-9 text-sm mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" /> Convocatoria <span className="text-muted-foreground/40">(opcional)</span>
          </Label>
          <Input
            type="time"
            value={meetingTime}
            onChange={(e) => onChange({ meetingTime: e.target.value })}
            className="h-9 text-sm mt-1"
            placeholder="--:--"
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">Plazas</Label>
          <Input
            type="number"
            min="1"
            value={slots}
            onChange={(e) => onChange({ slots: e.target.value })}
            className="h-9 text-sm mt-1"
          />
        </div>
      </div>
    </SectionCard>
  );
}

export const ShiftBasicInfoSection = memo(ShiftBasicInfoSectionImpl);
