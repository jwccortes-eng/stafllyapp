/**
 * StaflyLoadingState — esqueleto de carga canónico.
 *
 * Reemplaza spinners y skeletons ad-hoc. La silueta debe parecerse
 * al contenido final (cards, filas o métricas).
 */

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { STAFLY_CARD_BASE } from "./tokens";

export type StaflyLoadingVariant = "cards" | "rows" | "metrics";

export interface StaflyLoadingStateProps {
  variant?: StaflyLoadingVariant;
  count?: number;
  className?: string;
  label?: string;
}

export function StaflyLoadingState({
  variant = "cards",
  count = 4,
  className,
  label = "Cargando",
}: StaflyLoadingStateProps) {
  const items = Array.from({ length: count });

  if (variant === "metrics") {
    return (
      <div
        role="status"
        aria-label={label}
        className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3", className)}
      >
        {items.map((_, i) => (
          <div key={i} className={cn(STAFLY_CARD_BASE, "p-3")}>
            <Skeleton className="h-6 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div role="status" aria-label={label} className={cn("space-y-2", className)}>
      {items.map((_, i) => (
        <div
          key={i}
          className={cn(
            STAFLY_CARD_BASE,
            "flex items-center gap-3",
            variant === "rows" ? "p-3" : "p-4"
          )}
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
