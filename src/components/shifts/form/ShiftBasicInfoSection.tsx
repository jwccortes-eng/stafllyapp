/**
 * ShiftBasicInfoSection — first card of the shift form.
 * Title, client, date, start/end, meeting time, slots.
 *
 * Memoized so typing in other sections doesn't re-render this one.
 */
import { memo } from "react";
import { Clock, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { SectionCard } from "./section-card";
import { PremiumClientSelector } from "../workspace/PremiumClientSelector";
import type { SelectOption } from "../types";

interface Props {
  mode: "create" | "edit";
  clientId: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingTime: string;
  slots: string;
  clients: SelectOption[];
  onChange: (patch: {
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

  return (
    <SectionCard icon={Hash} title="Información principal" subtitle="Lo esencial del turno: qué, quién y cuándo.">
      {mode === "create" && (
        <p className="text-[10px] text-muted-foreground/70 -mt-1">
          El código de turno (#0001) se asigna automáticamente. El nombre se genera desde cliente, tipo y hora — puedes añadir una etiqueta interna en Detalles adicionales.
        </p>
      )}

      <PremiumClientSelector
        clientId={clientId}
        clients={clients}
        onChange={(id) => onChange({ clientId: id })}
        onQuickAddClient={onQuickAddClient}
      />

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
