import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  X,
  MapPin,
  Filter,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectOption } from "./types";

export interface ShiftFilterState {
  search: string;
  clientId: string;
  locationId: string;
  assignedStatus: string;
  publishStatus: string;
  claimableOnly: boolean;
  /** Phase 1 QW#3 — "Needs staffing": slots > assigned (computed in parent). */
  needsStaffingOnly?: boolean;
}

interface ShiftFiltersProps {
  filters: ShiftFilterState;
  onChange: (filters: ShiftFilterState) => void;
  clients: SelectOption[];
  locations?: SelectOption[];
  /** When false, hides the claimable filter option */
  allowClaims?: boolean;
}

export const EMPTY_FILTERS: ShiftFilterState = {
  search: "",
  clientId: "",
  locationId: "",
  assignedStatus: "",
  publishStatus: "",
  claimableOnly: false,
  needsStaffingOnly: false,
};

// ── Status dropdown model ──────────────────────────────────────────────────
// Single radio that maps to publishStatus + assignedStatus underneath, keeping
// existing filter logic untouched. Claimable / Needs staffing are independent
// flags (checkboxes) to preserve combinatorial behavior.
type StatusKey =
  | "all"
  | "unassigned"
  | "draft"
  | "published"
  | "locked";

const STATUS_LABELS: Record<StatusKey, string> = {
  all: "Todos los estados",
  unassigned: "Sin asignar",
  draft: "Borrador",
  published: "Publicado",
  locked: "Bloqueado",
};

function deriveStatusKey(f: ShiftFilterState): StatusKey {
  if (f.assignedStatus === "unassigned") return "unassigned";
  if (f.publishStatus === "draft") return "draft";
  if (f.publishStatus === "published") return "published";
  if (f.publishStatus === "locked") return "locked";
  return "all";
}

function applyStatusKey(f: ShiftFilterState, key: StatusKey): ShiftFilterState {
  // Reset the two status fields, then set what corresponds.
  const base = { ...f, assignedStatus: "", publishStatus: "" };
  switch (key) {
    case "unassigned": base.assignedStatus = "unassigned"; break;
    case "draft":      base.publishStatus = "draft"; break;
    case "published":  base.publishStatus = "published"; break;
    case "locked":     base.publishStatus = "locked"; break;
    case "all":
    default: break;
  }
  return base;
}

export function ShiftFilters({
  filters,
  onChange,
  clients,
  locations = [],
  allowClaims = true,
}: ShiftFiltersProps) {
  const update = (partial: Partial<ShiftFilterState>) => onChange({ ...filters, ...partial });

  const statusKey = deriveStatusKey(filters);

  const clientName = useMemo(
    () => clients.find(c => c.id === filters.clientId)?.name,
    [clients, filters.clientId],
  );
  const locationName = useMemo(
    () => locations.find(l => l.id === filters.locationId)?.name,
    [locations, filters.locationId],
  );

  // ── Active chip list (only filters that actually apply) ──
  type Chip = { key: string; label: string; onClear: () => void };
  const activeChips: Chip[] = [];
  if (filters.search.trim()) {
    activeChips.push({
      key: "search",
      label: `“${filters.search.trim()}”`,
      onClear: () => update({ search: "" }),
    });
  }
  if (filters.clientId && clientName) {
    activeChips.push({
      key: "client",
      label: `Cliente: ${clientName}`,
      onClear: () => update({ clientId: "" }),
    });
  }
  if (filters.locationId && locationName) {
    activeChips.push({
      key: "location",
      label: `Ubicación: ${locationName}`,
      onClear: () => update({ locationId: "" }),
    });
  }
  if (statusKey !== "all") {
    activeChips.push({
      key: "status",
      label: `Estado: ${STATUS_LABELS[statusKey]}`,
      onClear: () => onChange(applyStatusKey(filters, "all")),
    });
  }
  if (filters.needsStaffingOnly) {
    activeChips.push({
      key: "needs",
      label: "Necesita personal",
      onClear: () => update({ needsStaffingOnly: false }),
    });
  }
  if (allowClaims && filters.claimableOnly) {
    activeChips.push({
      key: "claim",
      label: "Reclamable",
      onClear: () => update({ claimableOnly: false }),
    });
  }

  const moreFlagsActive = (filters.needsStaffingOnly ? 1 : 0) + (allowClaims && filters.claimableOnly ? 1 : 0);

  return (
    <div className="space-y-1.5">
      {/* ── COMPACT FILTER BAR ── */}
      <div className="flex items-center gap-1.5 flex-wrap rounded-xl bg-white/60 dark:bg-card/40 border border-border/15 shadow-sm px-3 py-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
          <Input
            placeholder="Buscar turno..."
            value={filters.search}
            onChange={e => update({ search: e.target.value })}
            className="h-7 text-[11px] pl-7 w-[160px] rounded-lg bg-transparent border-border/20 focus:w-[220px] transition-all"
          />
        </div>

        <div className="h-4 w-px bg-border/20 mx-0.5" />

        {/* Client */}
        <Select value={filters.clientId || "all"} onValueChange={v => update({ clientId: v === "all" ? "" : v })}>
          <SelectTrigger className="h-7 text-[10px] w-[150px] rounded-lg bg-transparent border-border/20">
            <SelectValue placeholder="Todos los clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Location */}
        {locations.length > 0 && (
          <Select value={filters.locationId || "all"} onValueChange={v => update({ locationId: v === "all" ? "" : v })}>
            <SelectTrigger className="h-7 text-[10px] w-[150px] rounded-lg bg-transparent border-border/20">
              <MapPin className="h-3 w-3 mr-1 shrink-0" />
              <SelectValue placeholder="Todas las ubicaciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las ubicaciones</SelectItem>
              {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Status (radio dropdown) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 text-[10px] px-2.5 gap-1 rounded-lg border border-border/20",
                statusKey !== "all" && "bg-primary/10 text-primary border-primary/30",
              )}
            >
              <CircleDot className="h-3 w-3" />
              {STATUS_LABELS[statusKey]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[180px]">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Estado del turno
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={statusKey}
              onValueChange={(v) => onChange(applyStatusKey(filters, v as StatusKey))}
            >
              {(Object.keys(STATUS_LABELS) as StatusKey[]).map(k => (
                <DropdownMenuRadioItem key={k} value={k} className="text-xs">
                  {STATUS_LABELS[k]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* More filters */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 text-[10px] px-2.5 gap-1 rounded-lg border border-border/20",
                moreFlagsActive > 0 && "bg-primary/10 text-primary border-primary/30",
              )}
            >
              <Filter className="h-3 w-3" />
              Más filtros{moreFlagsActive > 0 ? ` · ${moreFlagsActive}` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Filtros adicionales
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={!!filters.needsStaffingOnly}
              onCheckedChange={(v) => update({ needsStaffingOnly: !!v })}
              className="text-xs"
            >
              Necesita personal
            </DropdownMenuCheckboxItem>
            {allowClaims && (
              <DropdownMenuCheckboxItem
                checked={!!filters.claimableOnly}
                onCheckedChange={(v) => update({ claimableOnly: !!v })}
                className="text-xs"
              >
                Reclamable
              </DropdownMenuCheckboxItem>
            )}
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground px-2 py-1.5 rounded"
            >
              Limpiar todos
            </button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── ACTIVE FILTER CHIPS (only when any filter is active) ── */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap px-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Filtros activos
          </span>
          {activeChips.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-medium hover:bg-primary/15 transition-colors"
            >
              <span>{chip.label}</span>
              <X className="h-2.5 w-2.5 opacity-70" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-1"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  );
}
