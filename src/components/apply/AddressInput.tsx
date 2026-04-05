import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Home, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

interface AddressData {
  address_line: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

interface Props {
  value: AddressData;
  onChange: (v: AddressData) => void;
  required?: boolean;
}

export function AddressInput({ value, onChange, required }: Props) {
  const [stateOpen, setStateOpen] = useState(false);
  const stateRef = useRef<HTMLDivElement>(null);

  const update = (field: keyof AddressData, v: string) =>
    onChange({ ...value, [field]: v });

  // Close state dropdown on outside click
  useEffect(() => {
    if (!stateOpen) return;
    const handler = (e: MouseEvent) => {
      if (stateRef.current && !stateRef.current.contains(e.target as Node)) setStateOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [stateOpen]);

  const filledCount = [value.address_line, value.address_city, value.address_state, value.address_zip].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Home className="h-4 w-4 text-muted-foreground" />
        Dirección
        {required && <span className="text-destructive">*</span>}
        {filledCount > 0 && filledCount < 4 && (
          <span className="text-[10px] text-muted-foreground ml-auto">{filledCount}/4 campos</span>
        )}
        {filledCount === 4 && (
          <span className="text-[10px] text-primary font-semibold ml-auto">✓ Completa</span>
        )}
      </label>

      <div className="space-y-2">
        {/* Street */}
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Calle, número, apto"
            value={value.address_line}
            onChange={(e) => update("address_line", e.target.value)}
            className="h-12 pl-10 text-base md:text-sm rounded-xl border-2 border-border/60 focus:border-primary/40 transition-colors"
            autoComplete="street-address"
          />
        </div>

        {/* City + State + ZIP in a responsive grid */}
        <div className="grid grid-cols-12 gap-2">
          {/* City — 5 cols */}
          <div className="col-span-5">
            <Input
              placeholder="Ciudad"
              value={value.address_city}
              onChange={(e) => update("address_city", e.target.value)}
              className="h-11 text-sm rounded-xl border-2 border-border/60 focus:border-primary/40 transition-colors"
              autoComplete="address-level2"
            />
          </div>

          {/* State selector — 4 cols */}
          <div className="col-span-4 relative" ref={stateRef}>
            <button
              type="button"
              onClick={() => setStateOpen(!stateOpen)}
              className={cn(
                "w-full h-11 flex items-center justify-between px-3 rounded-xl border-2 text-sm transition-colors",
                value.address_state
                  ? "border-border/60 text-foreground"
                  : "border-border/60 text-muted-foreground",
                stateOpen && "border-primary/40 ring-1 ring-primary/20"
              )}
            >
              <span className="truncate">{value.address_state || "Estado"}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform", stateOpen && "rotate-180")} />
            </button>
            {stateOpen && (
              <div className="absolute z-50 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg p-1 animate-fade-in">
                {US_STATES.map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => { update("address_state", st); setStateOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors",
                      value.address_state === st ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50 text-foreground"
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ZIP — 3 cols */}
          <div className="col-span-3">
            <Input
              placeholder="ZIP"
              value={value.address_zip}
              onChange={(e) => update("address_zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="h-11 text-sm rounded-xl border-2 border-border/60 focus:border-primary/40 transition-colors tabular-nums"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={5}
            />
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Tu dirección nos ayuda a asignarte trabajos cercanos
      </p>
    </div>
  );
}

export type { AddressData };
