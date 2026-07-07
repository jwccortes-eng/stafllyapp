/**
 * OpsFilterBanner — visual chip shown when a page hydrates a filter/date from
 * `/app/ops` deep-link query params. Presentational only, no data fetching.
 * Renders nothing when `active` is false.
 */
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
  label: string;
  onClear: () => void;
  className?: string;
}

export function OpsFilterBanner({ active, label, onClear, className }: Props) {
  if (!active) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-semibold text-foreground truncate">
          Filtro activo desde Ops Cockpit
        </span>
        <span className="text-muted-foreground truncate">· {label}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-[11px]"
        onClick={onClear}
      >
        <X className="h-3 w-3" />
        Limpiar filtro
      </Button>
    </div>
  );
}

export default OpsFilterBanner;
