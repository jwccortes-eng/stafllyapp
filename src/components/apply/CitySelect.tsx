import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { MapPin, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

// Common US metro areas — extend as needed
const CITY_OPTIONS = [
  // NYC
  { value: "Manhattan, NY", group: "New York" },
  { value: "Brooklyn, NY", group: "New York" },
  { value: "Queens, NY", group: "New York" },
  { value: "Bronx, NY", group: "New York" },
  { value: "Staten Island, NY", group: "New York" },
  { value: "Long Island, NY", group: "New York" },
  { value: "Westchester, NY", group: "New York" },
  { value: "Jersey City, NJ", group: "New Jersey" },
  { value: "Newark, NJ", group: "New Jersey" },
  // Florida
  { value: "Miami, FL", group: "Florida" },
  { value: "Fort Lauderdale, FL", group: "Florida" },
  { value: "West Palm Beach, FL", group: "Florida" },
  { value: "Orlando, FL", group: "Florida" },
  { value: "Tampa, FL", group: "Florida" },
  // Texas
  { value: "Houston, TX", group: "Texas" },
  { value: "Dallas, TX", group: "Texas" },
  { value: "Austin, TX", group: "Texas" },
  { value: "San Antonio, TX", group: "Texas" },
  // California
  { value: "Los Angeles, CA", group: "California" },
  { value: "San Francisco, CA", group: "California" },
  { value: "San Diego, CA", group: "California" },
  // Other
  { value: "Chicago, IL", group: "Other" },
  { value: "Atlanta, GA", group: "Other" },
  { value: "Washington, DC", group: "Other" },
  { value: "Boston, MA", group: "Other" },
  { value: "Philadelphia, PA", group: "Other" },
  { value: "Seattle, WA", group: "Other" },
  { value: "Denver, CO", group: "Other" },
  { value: "Las Vegas, NV", group: "Other" },
  // LATAM
  { value: "Bogotá", group: "Colombia" },
  { value: "Medellín", group: "Colombia" },
  { value: "Cali", group: "Colombia" },
  { value: "Barranquilla", group: "Colombia" },
  { value: "Ciudad de México", group: "México" },
  { value: "Guadalajara", group: "México" },
  { value: "Monterrey", group: "México" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function CitySelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return CITY_OPTIONS;
    const q = search.toLowerCase();
    return CITY_OPTIONS.filter(c => c.value.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof CITY_OPTIONS>();
    for (const c of filtered) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">Ciudad / Zona</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={cn(
            "flex items-center w-full h-12 rounded-xl border border-input bg-background px-3 text-left text-base md:text-sm transition-colors",
            !value && "text-muted-foreground"
          )}>
            <MapPin className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
            <span className="flex-1 truncate">{value || "Selecciona tu ciudad"}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground ml-1 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="p-2 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar ciudad..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs rounded-lg"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {[...grouped.entries()].map(([group, cities]) => (
              <div key={group}>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-2 pt-2 pb-1">{group}</p>
                {cities.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { onChange(c.value); setOpen(false); setSearch(""); }}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors",
                      value === c.value ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
                    )}
                  >
                    {c.value}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground">No encontrada</p>
                <button
                  onClick={() => { onChange(search.trim()); setOpen(false); setSearch(""); }}
                  className="text-xs text-primary font-medium mt-1 hover:underline"
                >
                  Usar "{search.trim()}"
                </button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
