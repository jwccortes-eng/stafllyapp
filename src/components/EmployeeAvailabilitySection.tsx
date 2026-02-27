import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CalendarOff, CalendarCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEmployeeAvailability, getWeekdayLabel } from "@/hooks/useEmployeeAvailability";
import { toast } from "sonner";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

interface Props {
  employeeId: string;
  readOnly?: boolean;
}

export function EmployeeAvailabilitySection({ employeeId, readOnly = false }: Props) {
  const { configs, loading, saveConfig } = useEmployeeAvailability({ employeeId });
  const config = configs.find(c => c.employee_id === employeeId);

  const [defaultAvailable, setDefaultAvailable] = useState(true);
  const [blockedDays, setBlockedDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setDefaultAvailable(config.default_available);
      setBlockedDays(config.blocked_weekdays ?? []);
    } else {
      setDefaultAvailable(true);
      setBlockedDays([]);
    }
  }, [config]);

  const handleToggleDefault = async (checked: boolean) => {
    setDefaultAvailable(checked);
    if (readOnly) return;
    setSaving(true);
    const err = await saveConfig(employeeId, {
      default_available: checked,
      blocked_weekdays: blockedDays,
    });
    setSaving(false);
    if (err) toast.error("Error al guardar");
    else toast.success(checked ? "Disponible por defecto" : "No disponible por defecto");
  };

  const handleToggleDay = async (day: number) => {
    if (readOnly) return;
    const newBlocked = blockedDays.includes(day)
      ? blockedDays.filter(d => d !== day)
      : [...blockedDays, day];
    setBlockedDays(newBlocked);
    setSaving(true);
    const err = await saveConfig(employeeId, {
      default_available: defaultAvailable,
      blocked_weekdays: newBlocked,
    });
    setSaving(false);
    if (err) toast.error("Error al guardar");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {defaultAvailable ? (
            <CalendarCheck className="h-4 w-4 text-earning" />
          ) : (
            <CalendarOff className="h-4 w-4 text-destructive" />
          )}
          <Label className="text-xs font-medium">Disponible por defecto</Label>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          <Switch
            checked={defaultAvailable}
            onCheckedChange={handleToggleDefault}
            disabled={readOnly || saving}
          />
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">
          Días bloqueados recurrentes
        </Label>
        <p className="text-[10px] text-muted-foreground mb-3">
          Estos días se bloquearán automáticamente cada semana
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {WEEKDAYS.map(wd => {
            const isBlocked = blockedDays.includes(wd.value);
            return (
              <button
                key={wd.value}
                onClick={() => handleToggleDay(wd.value)}
                disabled={readOnly || saving}
                className={cn(
                  "h-9 w-11 rounded-lg text-[11px] font-medium border transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-primary/30",
                  isBlocked
                    ? "bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/20"
                    : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-accent",
                  readOnly && "cursor-not-allowed opacity-60"
                )}
              >
                {wd.label}
              </button>
            );
          })}
        </div>
        {blockedDays.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {blockedDays
              .sort((a, b) => a - b)
              .map(d => (
                <Badge key={d} variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                  {getWeekdayLabel(d)} bloqueado
                </Badge>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
