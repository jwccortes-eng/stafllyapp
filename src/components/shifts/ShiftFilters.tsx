import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, X, UserX, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectOption } from "./types";

export interface ShiftFilterState {
  search: string;
  clientId: string;       // "" = all
  assignedStatus: string; // "" | "assigned" | "unassigned"
  publishStatus: string;  // "" | "published" | "draft"
}

interface ShiftFiltersProps {
  filters: ShiftFilterState;
  onChange: (filters: ShiftFilterState) => void;
  clients: SelectOption[];
}

export const EMPTY_FILTERS: ShiftFilterState = {
  search: "",
  clientId: "",
  assignedStatus: "",
  publishStatus: "",
};

export function ShiftFilters({ filters, onChange, clients }: ShiftFiltersProps) {
  const activeCount = [filters.search, filters.clientId, filters.assignedStatus, filters.publishStatus].filter(Boolean).length;

  const update = (partial: Partial<ShiftFilterState>) => onChange({ ...filters, ...partial });

  const toggleQuickFilter = (key: keyof ShiftFilterState, value: string) => {
    update({ [key]: filters[key] === value ? "" : value });
  };

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {/* Filter label */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="font-medium">Filtros</span>
        {activeCount > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-bold rounded-full bg-primary/10 text-primary border-0">{activeCount}</Badge>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
        <Input
          placeholder="Buscar turno..."
          value={filters.search}
          onChange={e => update({ search: e.target.value })}
          className="h-8 text-xs pl-7 w-[160px] rounded-full bg-white/60 dark:bg-card/60 border-border/30"
        />
      </div>

      {/* Quick toggle: Unassigned */}
      <Button
        variant={filters.assignedStatus === "unassigned" ? "default" : "outline"}
        size="sm"
        className={cn(
          "h-8 text-xs px-3 gap-1.5 rounded-full border-border/30",
          filters.assignedStatus === "unassigned" 
            ? "bg-rose-100 text-rose-600 hover:bg-rose-200 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800" 
            : "bg-white/60 dark:bg-card/60"
        )}
        onClick={() => toggleQuickFilter("assignedStatus", "unassigned")}
      >
        <UserX className="h-3 w-3" />
        Sin asignar
      </Button>

      {/* Quick toggle: Unpublished / Draft */}
      <Button
        variant={filters.publishStatus === "draft" ? "default" : "outline"}
        size="sm"
        className={cn(
          "h-8 text-xs px-3 gap-1.5 rounded-full border-border/30",
          filters.publishStatus === "draft" 
            ? "bg-amber-100 text-amber-600 hover:bg-amber-200 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" 
            : "bg-white/60 dark:bg-card/60"
        )}
        onClick={() => toggleQuickFilter("publishStatus", "draft")}
      >
        <EyeOff className="h-3 w-3" />
        Borrador
      </Button>

      {/* Client/Job select */}
      <Select value={filters.clientId || "all"} onValueChange={v => update({ clientId: v === "all" ? "" : v })}>
        <SelectTrigger className="h-8 text-xs w-[150px] rounded-full bg-white/60 dark:bg-card/60 border-border/30">
          <SelectValue placeholder="Todos los clientes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los clientes</SelectItem>
          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Reset */}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs px-2.5 text-muted-foreground/50 rounded-full" onClick={() => onChange(EMPTY_FILTERS)}>
          <X className="h-3 w-3 mr-1" /> Limpiar
        </Button>
      )}
    </div>
  );
}
