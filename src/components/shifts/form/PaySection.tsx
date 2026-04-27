/**
 * PaySection — pay override toggle + pay type/day type + hierarchy hint.
 */
import { memo } from "react";
import { CreditCard } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import { defaultAttendanceModeForPayType, type ShiftAttendanceMode } from "@/lib/shift-attendance-mode";
import type { LocationOption } from "../ShiftFormFields";

interface Props {
  payType: "hourly" | "daily";
  dayType: "full_day" | "half_day";
  payOverride: boolean;
  attendanceMode: ShiftAttendanceMode;
  locationId: string;
  locations: LocationOption[];
  onChange: (patch: {
    payType?: "hourly" | "daily";
    dayType?: "full_day" | "half_day";
    payOverride?: boolean;
    attendanceMode?: ShiftAttendanceMode;
  }) => void;
}

function PaySectionImpl({
  payType,
  dayType,
  payOverride,
  attendanceMode,
  locationId,
  locations,
  onChange,
}: Props) {
  const selectedLoc = locationId ? locations.find((l) => l.id === locationId) : null;
  const clientSuggestion = selectedLoc?.default_pay_type as "hourly" | "daily" | undefined;
  const suggestionLabel =
    clientSuggestion === "daily" ? "Por día" : clientSuggestion === "hourly" ? "Por hora" : null;

  return (
    <SectionCard icon={CreditCard} title="Pago" subtitle="Override excepcional para este turno (no afecta el perfil base).">
      <div className="rounded-lg border border-border bg-card p-2.5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[12px] font-semibold text-foreground">Override de pago</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {payOverride
                ? "Override activo — los valores de abajo aplican solo a este turno."
                : "Este turno usa la regla base del perfil del empleado."}
            </p>
          </div>
          <Switch checked={payOverride} onCheckedChange={(c) => onChange({ payOverride: !!c })} />
        </div>
        {suggestionLabel && !payOverride && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/60">
            <span className="text-[10px] text-muted-foreground">Sugerencia del cliente:</span>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5">{suggestionLabel}</Badge>
          </div>
        )}
      </div>

      <div className={cn("space-y-2 transition-opacity", !payOverride && "opacity-60")}>
        <div>
          <Label className="text-[11px] text-muted-foreground font-medium">Tipo de pago</Label>
          <Select
            value={payType}
            disabled={!payOverride}
            onValueChange={(val) => {
              const newPayType = val as "hourly" | "daily";
              const currentDefault = defaultAttendanceModeForPayType(payType);
              const patch: Parameters<typeof onChange>[0] = { payType: newPayType };
              if (attendanceMode === currentDefault) {
                patch.attendanceMode = defaultAttendanceModeForPayType(newPayType);
              }
              onChange(patch);
            }}
          >
            <SelectTrigger className="h-9 text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Por hora (reloj)</SelectItem>
              <SelectItem value="daily">Por día (tarifa fija)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {payType === "daily" && (
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Jornada</Label>
            <Select
              value={dayType}
              disabled={!payOverride}
              onValueChange={(val) => onChange({ dayType: val as "full_day" | "half_day" })}
            >
              <SelectTrigger className="h-9 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_day">Día completo</SelectItem>
                <SelectItem value="half_day">Medio día</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export const PaySection = memo(PaySectionImpl);
