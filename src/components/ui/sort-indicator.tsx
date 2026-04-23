import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc" | null;

interface SortIndicatorProps {
  direction: SortDirection;
  className?: string;
}

/**
 * Small visual indicator for sortable columns.
 * Shows a neutral arrow when not sorted, directional arrow when active.
 */
export function SortIndicator({ direction, className }: SortIndicatorProps) {
  if (direction === "asc") {
    return <ArrowUp className={cn("h-3 w-3 text-primary", className)} aria-label="sorted ascending" />;
  }
  if (direction === "desc") {
    return <ArrowDown className={cn("h-3 w-3 text-primary", className)} aria-label="sorted descending" />;
  }
  return <ArrowUpDown className={cn("h-3 w-3 text-muted-foreground/40", className)} aria-label="sortable" />;
}
