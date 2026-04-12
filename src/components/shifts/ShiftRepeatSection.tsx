import { useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Repeat, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, parse, addDays, eachDayOfInterval, isBefore, isAfter, startOfDay,
  getDay,
} from "date-fns";
import { es } from "date-fns/locale";

export type RepeatMode = "weekdays" | "range" | "next_n";

export interface RepeatConfig {
  enabled: boolean;
  mode: RepeatMode;
  /** For weekdays mode: 0=Sun,1=Mon,...6=Sat */
  selectedDays: number[];
  /** Start of repeat window (inclusive). Defaults to the shift date. */
  rangeStart: string;
  /** End of repeat window (inclusive) */
  rangeEnd: string;
  /** For next_n mode */
  nextNDays: number;
  /** Whether to copy employee assignments to repeated shifts */
  copyAssignments: boolean;
}

export const DEFAULT_REPEAT: RepeatConfig = {
  enabled: false,
  mode: "weekdays",
  selectedDays: [],
  rangeStart: "",
  rangeEnd: "",
  nextNDays: 5,
  copyAssignments: false,
};

interface ShiftRepeatSectionProps {
  /** The base shift date (yyyy-MM-dd) */
  shiftDate: string;
  config: RepeatConfig;
  onChange: (config: RepeatConfig) => void;
}

const DAY_LABELS = [
  { value: 1, label: "L" },
  { value: 2, label: "M" },
  { value: 3, label: "Mi" },
  { value: 4, label: "J" },
  { value: 5, label: "V" },
  { value: 6, label: "S" },
  { value: 0, label: "D" },
];

const MODE_LABELS: Record<RepeatMode, string> = {
  weekdays: "Días de la semana",
  range: "Rango de fechas",
  next_n: "Próximos N días",
};

/** Compute concrete dates from repeat config + base date */
export function computeRepeatDates(baseDate: string, config: RepeatConfig): string[] {
  if (!config.enabled || !baseDate) return [];

  const base = parse(baseDate, "yyyy-MM-dd", new Date());

  if (config.mode === "weekdays") {
    if (config.selectedDays.length === 0) return [];
    const start = config.rangeStart
      ? parse(config.rangeStart, "yyyy-MM-dd", new Date())
      : base;
    const end = config.rangeEnd
      ? parse(config.rangeEnd, "yyyy-MM-dd", new Date())
      : addDays(start, 13); // default 2 weeks
    if (isAfter(start, end)) return [];

    const allDays = eachDayOfInterval({ start, end });
    return allDays
      .filter(d => config.selectedDays.includes(getDay(d)))
      .filter(d => format(d, "yyyy-MM-dd") !== baseDate) // exclude base date
      .map(d => format(d, "yyyy-MM-dd"));
  }

  if (config.mode === "range") {
    if (!config.rangeStart || !config.rangeEnd) return [];
    const start = parse(config.rangeStart, "yyyy-MM-dd", new Date());
    const end = parse(config.rangeEnd, "yyyy-MM-dd", new Date());
    if (isAfter(start, end)) return [];

    return eachDayOfInterval({ start, end })
      .filter(d => format(d, "yyyy-MM-dd") !== baseDate)
      .map(d => format(d, "yyyy-MM-dd"));
  }

  if (config.mode === "next_n") {
    const n = Math.max(1, Math.min(config.nextNDays, 60));
    return Array.from({ length: n }, (_, i) => format(addDays(base, i + 1), "yyyy-MM-dd"));
  }

  return [];
}

export function ShiftRepeatSection({ shiftDate, config, onChange }: ShiftRepeatSectionProps) {
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);

  const update = (partial: Partial<RepeatConfig>) => onChange({ ...config, ...partial });

  const toggleDay = (day: number) => {
    const next = config.selectedDays.includes(day)
      ? config.selectedDays.filter(d => d !== day)
      : [...config.selectedDays, day];
    update({ selectedDays: next });
  };

  const repeatDates = useMemo(
    () => computeRepeatDates(shiftDate, config),
    [shiftDate, config]
  );

  if (!shiftDate) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Repeat className="h-3 w-3 text-violet-500" />
          </div>
          <span className="text-[11px] font-semibold text-foreground">Repetir turno</span>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={v => update({ enabled: v })}
        />
      </div>

      {config.enabled && (
        <div className="p-4 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-1">
            {(["weekdays", "range", "next_n"] as RepeatMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => update({ mode })}
                className={cn(
                  "text-[10px] font-medium px-3 py-1.5 rounded-lg transition-all",
                  config.mode === mode
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          {/* Weekdays mode */}
          {config.mode === "weekdays" && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                {DAY_LABELS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => toggleDay(value)}
                    className={cn(
                      "h-8 w-8 rounded-lg text-[11px] font-semibold transition-all",
                      config.selectedDays.includes(value)
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Desde</Label>
                  <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-8 text-[11px] justify-start mt-0.5">
                        <CalendarIcon className="h-3 w-3 mr-1.5" />
                        {config.rangeStart
                          ? format(parse(config.rangeStart, "yyyy-MM-dd", new Date()), "d MMM", { locale: es })
                          : format(parse(shiftDate, "yyyy-MM-dd", new Date()), "d MMM", { locale: es })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={config.rangeStart ? parse(config.rangeStart, "yyyy-MM-dd", new Date()) : parse(shiftDate, "yyyy-MM-dd", new Date())}
                        onSelect={d => { if (d) { update({ rangeStart: format(d, "yyyy-MM-dd") }); setStartPickerOpen(false); } }}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Hasta</Label>
                  <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-8 text-[11px] justify-start mt-0.5">
                        <CalendarIcon className="h-3 w-3 mr-1.5" />
                        {config.rangeEnd
                          ? format(parse(config.rangeEnd, "yyyy-MM-dd", new Date()), "d MMM", { locale: es })
                          : "Seleccionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={config.rangeEnd ? parse(config.rangeEnd, "yyyy-MM-dd", new Date()) : undefined}
                        onSelect={d => { if (d) { update({ rangeEnd: format(d, "yyyy-MM-dd") }); setEndPickerOpen(false); } }}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}

          {/* Range mode */}
          {config.mode === "range" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Desde</Label>
                <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 text-[11px] justify-start mt-0.5">
                      <CalendarIcon className="h-3 w-3 mr-1.5" />
                      {config.rangeStart
                        ? format(parse(config.rangeStart, "yyyy-MM-dd", new Date()), "d MMM yyyy", { locale: es })
                        : "Inicio"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={config.rangeStart ? parse(config.rangeStart, "yyyy-MM-dd", new Date()) : undefined}
                      onSelect={d => { if (d) { update({ rangeStart: format(d, "yyyy-MM-dd") }); setStartPickerOpen(false); } }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Hasta</Label>
                <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 text-[11px] justify-start mt-0.5">
                      <CalendarIcon className="h-3 w-3 mr-1.5" />
                      {config.rangeEnd
                        ? format(parse(config.rangeEnd, "yyyy-MM-dd", new Date()), "d MMM yyyy", { locale: es })
                        : "Fin"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={config.rangeEnd ? parse(config.rangeEnd, "yyyy-MM-dd", new Date()) : undefined}
                      onSelect={d => { if (d) { update({ rangeEnd: format(d, "yyyy-MM-dd") }); setEndPickerOpen(false); } }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Next N days mode */}
          {config.mode === "next_n" && (
            <div>
              <Label className="text-[10px] text-muted-foreground">Próximos días consecutivos</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={config.nextNDays}
                onChange={e => update({ nextNDays: parseInt(e.target.value) || 1 })}
                className="h-8 text-sm w-24 mt-0.5"
              />
            </div>
          )}

          {/* Copy assignments toggle */}
          <div className="flex items-center gap-2 pt-1 border-t border-border/20">
            <Switch
              checked={config.copyAssignments}
              onCheckedChange={v => update({ copyAssignments: v })}
              className="scale-90"
            />
            <Label className="text-[10px] text-muted-foreground cursor-pointer">
              Copiar asignaciones de empleados a los turnos repetidos
            </Label>
          </div>

          {/* Preview */}
          {repeatDates.length > 0 && (
            <div className="rounded-lg bg-muted/30 border border-border/20 p-3">
              <p className="text-[10px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <Info className="h-3 w-3 text-primary" />
                Se crearán {repeatDates.length} turno{repeatDates.length !== 1 ? "s" : ""} adicionales en borrador
              </p>
              <div className="flex flex-wrap gap-1">
                {repeatDates.slice(0, 14).map(d => (
                  <span
                    key={d}
                    className="text-[9px] bg-primary/10 text-primary font-medium rounded-md px-2 py-0.5 capitalize"
                  >
                    {format(parse(d, "yyyy-MM-dd", new Date()), "EEE d MMM", { locale: es })}
                  </span>
                ))}
                {repeatDates.length > 14 && (
                  <span className="text-[9px] text-muted-foreground font-medium px-1">
                    +{repeatDates.length - 14} más
                  </span>
                )}
              </div>
            </div>
          )}

          {config.enabled && repeatDates.length === 0 && (
            <p className="text-[10px] text-muted-foreground/60 italic">
              Configura los días para ver la previsualización
            </p>
          )}
        </div>
      )}
    </div>
  );
}
