import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, X, UserX, EyeOff } from "lucide-react";
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
    <div className="flex items-center gap-2 flex-wrap">
      {/* Filter label */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span className="font-medium">Filtros</span>
        {activeCount > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-bold">{activeCount}</Badge>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          placeholder="Buscar turno..."
          value={filters.search}
          onChange={e => update({ search: e.target.value })}
          className="h-7 text-xs pl-7 w-[150px]"
        />
      </div>

      {/* Quick toggle: Unassigned */}
      <Button
        variant={filters.assignedStatus === "unassigned" ? "default" : "outline"}
        size="sm"
        className={cn(
          "h-7 text-xs px-2.5 gap-1.5",
          filters.assignedStatus === "unassigned" && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
          "h-7 text-xs px-2.5 gap-1.5",
          filters.publishStatus === "draft" && "bg-warning text-warning-foreground hover:bg-warning/90"
        )}
        onClick={() => toggleQuickFilter("publishStatus", "draft")}
      >
        <EyeOff className="h-3 w-3" />
        Borrador
      </Button>

      {/* Client/Job select */}
      <Select value={filters.clientId || "all"} onValueChange={v => update({ clientId: v === "all" ? "" : v })}>
        <SelectTrigger className="h-7 text-xs w-[140px]">
          <SelectValue placeholder="Todos los clientes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los clientes</SelectItem>
          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Reset */}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground" onClick={() => onChange(EMPTY_FILTERS)}>
          <X className="h-3 w-3 mr-1" /> Limpiar
        </Button>
      )}
    </div>
  );
}
