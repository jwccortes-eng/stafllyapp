import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, UserX, EyeOff, Lock, MapPin, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectOption } from "./types";

export interface ShiftFilterState {
  search: string;
  clientId: string;
  locationId: string;
  assignedStatus: string;
  publishStatus: string;
  claimableOnly: boolean;
}

interface ShiftFiltersProps {
  filters: ShiftFilterState;
  onChange: (filters: ShiftFilterState) => void;
  clients: SelectOption[];
  locations?: SelectOption[];
}

export const EMPTY_FILTERS: ShiftFilterState = {
  search: "",
  clientId: "",
  locationId: "",
  assignedStatus: "",
  publishStatus: "",
  claimableOnly: false,
};

export function ShiftFilters({ filters, onChange, clients, locations = [] }: ShiftFiltersProps) {
  const activeCount = [
    filters.search, filters.clientId, filters.locationId,
    filters.assignedStatus, filters.publishStatus,
    filters.claimableOnly ? "1" : "",
  ].filter(Boolean).length;

  const update = (partial: Partial<ShiftFilterState>) => onChange({ ...filters, ...partial });

  const toggleQuickFilter = (key: keyof ShiftFilterState, value: string) => {
    update({ [key]: filters[key] === value ? "" : value });
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap rounded-xl bg-white/60 dark:bg-card/40 border border-border/15 shadow-sm px-3 py-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
        <Input
          placeholder="Buscar turno..."
          value={filters.search}
          onChange={e => update({ search: e.target.value })}
          className="h-7 text-[11px] pl-7 w-[140px] rounded-lg bg-transparent border-border/20 focus:w-[200px] transition-all"
        />
      </div>

      <div className="h-4 w-px bg-border/20 mx-0.5" />

      {/* Quick toggles */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 text-[10px] px-2.5 gap-1 rounded-lg transition-all",
          filters.assignedStatus === "unassigned"
            ? "bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
        )}
        onClick={() => toggleQuickFilter("assignedStatus", "unassigned")}
      >
        <UserX className="h-3 w-3" />
        Sin asignar
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 text-[10px] px-2.5 gap-1 rounded-lg transition-all",
          filters.publishStatus === "draft"
            ? "bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
        )}
        onClick={() => toggleQuickFilter("publishStatus", "draft")}
      >
        <EyeOff className="h-3 w-3" />
        Borrador
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 text-[10px] px-2.5 gap-1 rounded-lg transition-all",
          filters.publishStatus === "locked"
            ? "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
        )}
        onClick={() => toggleQuickFilter("publishStatus", "locked")}
      >
        <Lock className="h-3 w-3" />
        Bloqueado
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 text-[10px] px-2.5 gap-1 rounded-lg transition-all",
          filters.claimableOnly
            ? "bg-violet-100 text-violet-600 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
        )}
        onClick={() => update({ claimableOnly: !filters.claimableOnly })}
      >
        <Hand className="h-3 w-3" />
        Reclamable
      </Button>

      <div className="h-4 w-px bg-border/20 mx-0.5" />

      {/* Client select */}
      <Select value={filters.clientId || "all"} onValueChange={v => update({ clientId: v === "all" ? "" : v })}>
        <SelectTrigger className="h-7 text-[10px] w-[140px] rounded-lg bg-transparent border-border/20">
          <SelectValue placeholder="Todos los clientes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los clientes</SelectItem>
          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Location select */}
      {locations.length > 0 && (
        <Select value={filters.locationId || "all"} onValueChange={v => update({ locationId: v === "all" ? "" : v })}>
          <SelectTrigger className="h-7 text-[10px] w-[140px] rounded-lg bg-transparent border-border/20">
            <MapPin className="h-3 w-3 mr-1 shrink-0" />
            <SelectValue placeholder="Todas las ubicaciones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las ubicaciones</SelectItem>
            {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* Reset */}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2 text-muted-foreground/40 rounded-lg ml-auto" onClick={() => onChange(EMPTY_FILTERS)}>
          <X className="h-3 w-3 mr-0.5" /> Limpiar ({activeCount})
        </Button>
      )}
    </div>
  );
}
