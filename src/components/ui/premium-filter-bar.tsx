import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Search, X, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export interface ActiveFilterChip {
  key: string;
  label: ReactNode;
  onRemove: () => void;
}

interface PremiumFilterBarProps {
  /** Search term — pass undefined to hide the search input. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  /** Quick filter pills rendered inline next to the search. */
  quickFilters?: ReactNode;

  /** Optional advanced filter content. Rendered inside a popover. */
  advancedContent?: ReactNode;
  advancedActiveCount?: number;

  /** Active filter chips with × buttons. */
  activeChips?: ActiveFilterChip[];

  /** Total result count, shown next to "Reset". */
  resultCount?: number;

  /** Called when the user clicks "Reset filters". */
  onReset?: () => void;

  /** Right-side slot — typically ViewSwitcher / column-prefs / export. */
  rightSlot?: ReactNode;

  className?: string;
}

/**
 * PremiumFilterBar — canonical premium-gold filter pattern.
 *
 *   [Search]  [quick filters]   [advanced]   ·   [chips]   ·   [reset · count] [right slot]
 *
 * URL persistence is intentionally NOT handled here; pair with `useUrlFilters`
 * in the parent to make filters shareable.
 */
export function PremiumFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  quickFilters,
  advancedContent,
  advancedActiveCount = 0,
  activeChips,
  resultCount,
  onReset,
  rightSlot,
  className,
}: PremiumFilterBarProps) {
  const hasChips = activeChips && activeChips.length > 0;
  const showReset = (advancedActiveCount > 0 || hasChips) && onReset;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8 pr-7 h-8 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {quickFilters && (
          <div className="flex items-center gap-1.5 flex-wrap">{quickFilters}</div>
        )}

        {advancedContent && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {advancedActiveCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-4 px-1.5 text-[9px] font-bold bg-primary/15 text-primary border-0"
                  >
                    {advancedActiveCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-3">
              {advancedContent}
            </PopoverContent>
          </Popover>
        )}

        <div className="ml-auto flex items-center gap-2">
          {typeof resultCount === "number" && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {resultCount} {resultCount === 1 ? "result" : "results"}
            </span>
          )}
          {showReset && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={onReset}
            >
              <X className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
          {rightSlot}
        </div>
      </div>

      {hasChips && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeChips!.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full bg-primary/[0.08] text-primary border border-primary/15 px-2 py-0.5 text-[10px] font-medium"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="hover:text-primary/70"
                aria-label={`Remove filter ${typeof chip.label === "string" ? chip.label : ""}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
