/**
 * StaflySearchBar — buscador canónico.
 *
 * Mismo control en Desktop, iPad y móvil. Solo cambia el ancho.
 */

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { STAFLY_STATE } from "./tokens";

export interface StaflySearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}

export function StaflySearchBar({
  value,
  onChange,
  placeholder = "Buscar",
  className,
  autoFocus,
  "aria-label": ariaLabel,
}: StaflySearchBarProps) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-xl pl-9 pr-9 placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onChange("")}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground",
            STAFLY_STATE.focus
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
