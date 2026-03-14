import { useState } from "react";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isAfter } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarOff, CalendarCheck, ChevronLeft, ChevronRight, Loader2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
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

export default function MyAvailability() {
  const { employeeId } = useAuth();
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);

  const currentWeekStart = startOfWeek(addDays(today, weekOffset * 7), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: currentWeekEnd });

  const dateFrom = format(currentWeekStart, "yyyy-MM-dd");
  const dateTo = format(currentWeekEnd, "yyyy-MM-dd");

  const {
    configs, overrides, loading, saveConfig, saveOverride, deleteOverride, isAvailable,
  } = useEmployeeAvailability({ employeeId: employeeId ?? undefined, dateFrom, dateTo });

  const config = configs.find(c => c.employee_id === employeeId);
  const defaultAvailable = config?.default_available ?? true;
  const blockedDays = config?.blocked_weekdays ?? [];

  const [saving, setSaving] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  if (!employeeId) return null;

  const handleToggleDefault = async (checked: boolean) => {
    setSaving(true);
    const err = await saveConfig(employeeId, { default_available: checked, blocked_weekdays: blockedDays });
    setSaving(false);
    if (err) toast.error("Error al guardar");
    else toast.success(checked ? "Disponible por defecto" : "No disponible por defecto");
  };

  const handleToggleDay = async (day: number) => {
    const newBlocked = blockedDays.includes(day)
      ? blockedDays.filter(d => d !== day)
      : [...blockedDays, day];
    setSaving(true);
    const err = await saveConfig(employeeId, { default_available: defaultAvailable, blocked_weekdays: newBlocked });
    setSaving(false);
    if (err) toast.error("Error al guardar");
  };

  const handleDateOverride = async (dateStr: string, makeAvailable: boolean) => {
    setSaving(true);
    const err = await saveOverride(employeeId, dateStr, makeAvailable, overrideReason || undefined, "employee");
    setSaving(false);
    setOverrideReason("");
    setSelectedDate(null);
    if (err) toast.error("Error al guardar");
    else toast.success(makeAvailable ? "Marcado como disponible" : "Marcado como no disponible");
  };

  const handleRemoveOverride = async (dateStr: string) => {
    setSaving(true);
    const err = await deleteOverride(employeeId, dateStr);
    setSaving(false);
    if (err) toast.error("Error al eliminar");
    else toast.success("Excepción eliminada");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Mi Disponibilidad</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configura tu disponibilidad semanal y marca excepciones por día.
        </p>
      </div>

      {/* Default availability toggle */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {defaultAvailable ? (
              <div className="h-8 w-8 rounded-xl bg-earning/10 flex items-center justify-center">
                <CalendarCheck className="h-4 w-4 text-earning" />
              </div>
            ) : (
              <div className="h-8 w-8 rounded-xl bg-destructive/10 flex items-center justify-center">
                <CalendarOff className="h-4 w-4 text-destructive" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">Disponible por defecto</p>
              <p className="text-[11px] text-muted-foreground">
                {defaultAvailable ? "Estás disponible a menos que bloquees un día" : "No estás disponible a menos que marques un día"}
              </p>
            </div>
          </div>
          <Switch
            checked={defaultAvailable}
            onCheckedChange={handleToggleDefault}
            disabled={saving}
          />
        </div>

        <Separator />

        {/* Recurring weekday blocks */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1">Días bloqueados recurrentes</p>
          <p className="text-[10px] text-muted-foreground mb-3">
            Se bloquean automáticamente cada semana
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {WEEKDAYS.map(wd => {
              const isBlocked = blockedDays.includes(wd.value);
              return (
                <button
                  key={wd.value}
                  onClick={() => handleToggleDay(wd.value)}
                  disabled={saving}
                  className={cn(
                    "h-10 w-12 rounded-xl text-xs font-semibold border transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30",
                    isBlocked
                      ? "bg-destructive/10 border-destructive/30 text-destructive"
                      : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-accent"
                  )}
                >
                  {wd.label}
                </button>
              );
            })}
          </div>
          {blockedDays.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {blockedDays.sort((a, b) => a - b).map(d => (
                <Badge key={d} variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                  {getWeekdayLabel(d)} bloqueado
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Weekly calendar with overrides */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(o => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-semibold text-foreground capitalize">
            {format(currentWeekStart, "d MMM", { locale: es })} – {format(currentWeekEnd, "d MMM yyyy", { locale: es })}
          </p>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(o => o + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isPast = !isAfter(day, today) && !isSameDay(day, today);
            const availability = isAvailable(employeeId, dateStr);
            const hasOverride = overrides.some(o => o.employee_id === employeeId && o.date === dateStr);
            const isSelected = selectedDate === dateStr;
            const isToday = isSameDay(day, today);

            return (
              <button
                key={dateStr}
                onClick={() => {
                  if (isPast) return;
                  setSelectedDate(isSelected ? null : dateStr);
                  setOverrideReason("");
                }}
                disabled={isPast}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl p-2 transition-all text-center border",
                  isPast && "opacity-40 cursor-not-allowed",
                  isSelected && "ring-2 ring-primary",
                  availability.available
                    ? "bg-earning/5 border-earning/20"
                    : "bg-destructive/5 border-destructive/20",
                  isToday && "ring-1 ring-primary/50"
                )}
              >
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  {format(day, "EEE", { locale: es })}
                </span>
                <span className={cn(
                  "text-sm font-bold",
                  availability.available ? "text-earning" : "text-destructive"
                )}>
                  {format(day, "d")}
                </span>
                {hasOverride && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {/* Override action panel */}
        {selectedDate && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3 animate-fade-in">
            <p className="text-xs font-semibold text-foreground">
              {format(new Date(selectedDate + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
            </p>
            {(() => {
              const availability = isAvailable(employeeId, selectedDate);
              const hasOverride = overrides.some(o => o.employee_id === employeeId && o.date === selectedDate);
              return (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Estado actual: <span className={cn("font-medium", availability.available ? "text-earning" : "text-destructive")}>
                      {availability.available ? "Disponible" : "No disponible"}
                    </span>
                    {availability.reason && ` — ${availability.reason}`}
                  </p>
                  <Textarea
                    placeholder="Motivo (opcional)"
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    className="text-xs h-16 resize-none"
                  />
                  <div className="flex gap-2">
                    {availability.available ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 text-xs"
                        disabled={saving}
                        onClick={() => handleDateOverride(selectedDate, false)}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> No puedo este día
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 text-xs bg-earning hover:bg-earning/90 text-white"
                        disabled={saving}
                        onClick={() => handleDateOverride(selectedDate, true)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Sí puedo este día
                      </Button>
                    )}
                    {hasOverride && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={saving}
                        onClick={() => handleRemoveOverride(selectedDate)}
                      >
                        Quitar excepción
                      </Button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-earning/30" /> Disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/30" /> No disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Excepción
        </span>
      </div>
    </div>
  );
}
