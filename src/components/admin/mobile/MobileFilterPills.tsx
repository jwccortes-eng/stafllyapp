/**
 * MobileFilterPills — shared mobile-only filter chip rail.
 *
 * Implements the "Mobile Filter Pills" pattern documented in
 * `docs/MOBILE_ACTION_QUEUE.md`. Renders a single-row horizontal scroll of
 * pill chips, hidden on `md` and up so each consumer can keep its own
 * desktop `TabsList` unchanged.
 *
 * Pure presentational. No queries, no router/state coupling — consumers keep
 * driving the active value through their existing `Tabs` (`value` /
 * `onValueChange`) or local state. Reverting is a one-line swap back to a
 * `TabsList`.
 *
 * Rules preserved from the documented pattern:
 * - `role="tablist"` + per-chip `role="tab"` + `aria-selected`.
 * - Active chip = filled primary; inactive = card/border-only.
 * - Count badge shown only when > 0, visual cap at `99+`.
 * - Tap target 32px (`h-8`), `whitespace-nowrap`.
 * - `overflow-x-auto no-scrollbar`, inner `w-max`.
 * - No semantic changes vs desktop tabs.
 */

import { cn } from "@/lib/utils";

export interface MobileFilterPillItem<TKey extends string = string> {
  key: TKey;
  label: string;
  /** Optional count badge — rendered only when > 0. */
  count?: number;
}

interface MobileFilterPillsProps<TKey extends string = string> {
  items: ReadonlyArray<MobileFilterPillItem<TKey>>;
  value: TKey;
  onChange: (next: TKey) => void;
  /** Accessible label for the tablist. */
  ariaLabel: string;
  /** Optional class override on the outer scroll container. */
  className?: string;
}

export function MobileFilterPills<TKey extends string = string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: MobileFilterPillsProps<TKey>) {
  return (
    <div
      className={cn(
        "md:hidden -mx-3 px-3 overflow-x-auto no-scrollbar",
        className,
      )}
    >
      <div
        className="flex items-center gap-1.5 pb-1 w-max"
        role="tablist"
        aria-label={ariaLabel}
      >
        {items.map((item) => {
          const active = item.key === value;
          const count = item.count ?? 0;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.key)}
              className={cn(
                "h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-foreground/80 border-border/60",
              )}
            >
              <span>{item.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold inline-flex items-center justify-center tabular-nums",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MobileFilterPills;
