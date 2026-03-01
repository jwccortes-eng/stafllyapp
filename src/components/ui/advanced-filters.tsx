import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Filter, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterField {
  key: string;
  label: string;
  type: "select" | "date" | "text";
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export interface SortOption {
  label: string;
  value: string;
}

interface AdvancedFiltersProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  fields?: FilterField[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (v: string) => void;
  sortDirection?: "asc" | "desc";
  onSortDirectionChange?: (d: "asc" | "desc") => void;
  onClear?: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export function AdvancedFilters({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  fields = [],
  filterValues = {},
  onFilterChange,
  sortOptions = [],
  sortValue,
  onSortChange,
  sortDirection = "asc",
  onSortDirectionChange,
  onClear,
  hasActiveFilters = false,
  className,
}: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);

  const showAdvanced = fields.length > 0 || sortOptions.length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {showAdvanced && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filtros
                {hasActiveFilters && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        )}

        {hasActiveFilters && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Advanced panel */}
      {showAdvanced && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleContent>
            <div className="rounded-xl border bg-card/50 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {fields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                  {field.type === "select" && field.options ? (
                    <Select
                      value={filterValues[field.key] || "all"}
                      onValueChange={(v) => onFilterChange?.(field.key, v)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder={field.placeholder || "Todos"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {field.options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "date" ? (
                    <Input
                      type="date"
                      value={filterValues[field.key] || ""}
                      onChange={(e) => onFilterChange?.(field.key, e.target.value)}
                      className="h-9 text-sm"
                    />
                  ) : (
                    <Input
                      value={filterValues[field.key] || ""}
                      onChange={(e) => onFilterChange?.(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="h-9 text-sm"
                    />
                  )}
                </div>
              ))}

              {sortOptions.length > 0 && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Ordenar por</label>
                    <Select value={sortValue || ""} onValueChange={(v) => onSortChange?.(v)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                    <Select
                      value={sortDirection}
                      onValueChange={(v) => onSortDirectionChange?.(v as "asc" | "desc")}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asc">A → Z</SelectItem>
                        <SelectItem value="desc">Z → A</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
