/**
 * SmartDateInput — premium, US-formatted (MM/DD/YYYY) date input with
 * flexible parsing, suggestion dropdown, and optional calendar picker.
 *
 * Boundaries:
 *  - Receives/emits ISO YYYY-MM-DD via `value` / `onChange`.
 *  - Displays MM/DD/YYYY only.
 *  - No DB/RLS/payroll/shift logic touched — purely presentation.
 */
import * as React from "react";
import { Calendar as CalendarIcon, X, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  formatDateUS,
  parseDateUS,
  validateDateUS,
  getSmartDateSuggestions,
  type SmartDateSuggestion,
} from "@/lib/date-format";

export interface SmartDateInputProps {
  /** ISO YYYY-MM-DD or empty string */
  value: string;
  /** Called with ISO YYYY-MM-DD or empty string */
  onChange: (isoValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  showCalendar?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  id?: string;
  name?: string;
  /** Optional min/max in ISO */
  minIso?: string;
  maxIso?: string;
}

export const SmartDateInput = React.forwardRef<HTMLInputElement, SmartDateInputProps>(
  function SmartDateInput(
    {
      value,
      onChange,
      placeholder = "MM/DD/YYYY",
      disabled,
      required,
      allowClear = true,
      showCalendar = true,
      className,
      inputClassName,
      minIso,
      maxIso,
      id,
      name,
      ...aria
    },
    ref,
  ) {
    const [text, setText] = React.useState<string>(() => formatDateUS(value));
    const [open, setOpen] = React.useState(false);
    const [calOpen, setCalOpen] = React.useState(false);
    const [activeIdx, setActiveIdx] = React.useState(0);
    const [touched, setTouched] = React.useState(false);
    const wrapRef = React.useRef<HTMLDivElement>(null);

    // Sync external value -> display text when not focused.
    React.useEffect(() => {
      setText(formatDateUS(value));
    }, [value]);

    const suggestions: SmartDateSuggestion[] = React.useMemo(
      () => getSmartDateSuggestions(text),
      [text],
    );

    const hasError =
      touched && text.trim().length > 0 && !validateDateUS(text);

    const commitIso = (iso: string) => {
      onChange(iso);
      setText(formatDateUS(iso));
      setOpen(false);
      setTouched(true);
    };

    const handleBlur = () => {
      setTouched(true);
      // Defer to allow click on suggestion
      setTimeout(() => {
        setOpen(false);
        const raw = text.trim();
        if (!raw) {
          if (value) onChange("");
          return;
        }
        const iso = parseDateUS(raw);
        if (iso) {
          if (iso !== value) onChange(iso);
          setText(formatDateUS(iso));
        }
        // If invalid, leave text as-is so user sees error and can fix.
      }, 120);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (open && suggestions[activeIdx]) {
          e.preventDefault();
          commitIso(suggestions[activeIdx].iso);
        } else {
          const iso = parseDateUS(text);
          if (iso) {
            e.preventDefault();
            commitIso(iso);
          }
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };

    const clear = () => {
      setText("");
      onChange("");
      setTouched(true);
      setOpen(false);
    };

    const calendarSelected = value
      ? (() => {
          const [y, m, d] = value.split("-").map(Number);
          return new Date(y, m - 1, d);
        })()
      : undefined;

    return (
      <div ref={wrapRef} className={cn("relative", className)}>
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            name={name}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-label={aria["aria-label"] ?? "Fecha (MM/DD/YYYY)"}
            aria-invalid={hasError || undefined}
            aria-expanded={open}
            aria-autocomplete="list"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActiveIdx(0);
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn(
              "pr-16",
              hasError && "border-destructive focus-visible:ring-destructive/30",
              inputClassName,
            )}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {allowClear && text && !disabled && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clear}
                aria-label="Borrar fecha"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/60"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {showCalendar && (
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label="Abrir calendario"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 disabled:opacity-40"
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={calendarSelected}
                    onSelect={(d) => {
                      if (d) {
                        const iso = `${d.getFullYear()}-${(d.getMonth() + 1)
                          .toString()
                          .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
                        commitIso(iso);
                        setCalOpen(false);
                      }
                    }}
                    disabled={(d) => {
                      if (minIso && d < new Date(minIso)) return true;
                      if (maxIso && d > new Date(maxIso)) return true;
                      return false;
                    }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {open && suggestions.length > 0 && !disabled && (
          <div
            role="listbox"
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border/60 bg-popover shadow-lg"
          >
            {suggestions.map((s, i) => (
              <button
                key={s.iso + s.label}
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitIso(s.iso)}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
                  i === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                )}
              >
                <span className="font-medium">{s.label}</span>
                <span className="text-xs text-muted-foreground font-mono">{s.display}</span>
              </button>
            ))}
          </div>
        )}

        {hasError && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
            <AlertCircle className="h-3 w-3" /> Usa el formato MM/DD/YYYY
          </p>
        )}
      </div>
    );
  },
);
