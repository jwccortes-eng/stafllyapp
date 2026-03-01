import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

const ACTION_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "create", label: "Creaciones" },
  { value: "update", label: "Ediciones" },
  { value: "approve,reject,close,reopen,publish,paid", label: "Aprobaciones" },
  { value: "export,print", label: "Exportaciones" },
  { value: "email", label: "Emails" },
  { value: "page_view,record_view", label: "Vistas" },
];

interface AuditFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  activeFilter: string;
  onFilterChange: (v: string) => void;
  compact?: boolean;
}

export default function AuditFilters({
  search,
  onSearchChange,
  activeFilter,
  onFilterChange,
  compact = false,
}: AuditFiltersProps) {
  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar actividad..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
        {search && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onSearchChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1">
        {ACTION_CHIPS.map((chip) => (
          <Button
            key={chip.value}
            variant={activeFilter === chip.value ? "default" : "outline"}
            size="sm"
            className="h-6 text-[10px] px-2 rounded-full"
            onClick={() => onFilterChange(chip.value)}
          >
            {chip.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
