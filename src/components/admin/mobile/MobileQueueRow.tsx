import { ReactNode, forwardRef } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MobileQueueRow — presentational tappable row for the Mobile Action Queue
 * pattern (extracted from PayrollReviewQueue / DailyClose / DailyOpsActionQueue).
 *
 * UI-only. Knows nothing about tenants, queries, routes, payroll, or business
 * logic. Each consumer maps its own data into these slots.
 */
export interface MobileQueueRowProps {
  onClick?: () => void;
  /** Optional icon/avatar block rendered on the left. */
  leading?: ReactNode;
  /** Optional small meta row (badges, "Paso N", etc) rendered above primary. */
  topMeta?: ReactNode;
  /** Main title line. Truncated/clamped by the component. */
  primary: ReactNode;
  /** Secondary line (description). 2-line clamp. */
  secondary?: ReactNode;
  /** Right-aligned slot (amount, count, status). */
  rightSlot?: ReactNode;
  /** Show chevron on the right. Default true. */
  showChevron?: boolean;
  /** Extra classes — useful for tone overrides (border/bg). */
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export const MobileQueueRow = forwardRef<HTMLButtonElement, MobileQueueRowProps>(
  function MobileQueueRow(
    {
      onClick,
      leading,
      topMeta,
      primary,
      secondary,
      rightSlot,
      showChevron = true,
      className,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "w-full text-left flex items-start gap-3 rounded-xl border border-border/60 bg-background/40",
          "px-3 py-2.5 active:scale-[0.99] active:bg-muted/40 transition-transform",
          "disabled:opacity-60 disabled:pointer-events-none",
          className,
        )}
        {...rest}
      >
        {leading && <div className="shrink-0 mt-0.5">{leading}</div>}
        <div className="min-w-0 flex-1">
          {topMeta && (
            <div className="flex items-center gap-2 flex-wrap mb-0.5">{topMeta}</div>
          )}
          <div className="text-sm font-semibold leading-tight text-foreground line-clamp-2">
            {primary}
          </div>
          {secondary && (
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {secondary}
            </div>
          )}
        </div>
        {rightSlot && (
          <div className="shrink-0 self-center text-right">{rightSlot}</div>
        )}
        {showChevron && (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
        )}
      </button>
    );
  },
);
