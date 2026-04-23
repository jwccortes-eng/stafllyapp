import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * BulkActionsBar — sticky-ish action bar shown when ≥1 row is selected.
 *
 * Premium pattern: appears as a floating chip strip just under the filter bar.
 * Compact, single line, semantic primary actions on the right, "Clear" on the left.
 */

interface BulkActionsBarProps {
  /** Number of selected rows. Bar is hidden when 0. */
  selectedCount: number;
  /** Total available rows (for "X of Y" hint). */
  totalCount?: number;
  /** Singular/plural noun for selection (e.g. "worker"). */
  noun?: string;
  /** Called when user clicks the × / Clear button. */
  onClear: () => void;
  /** Action buttons (right side). */
  actions: ReactNode;
  className?: string;
}

export function BulkActionsBar({
  selectedCount,
  totalCount,
  noun = "item",
  onClear,
  actions,
  className,
}: BulkActionsBarProps) {
  if (selectedCount <= 0) return null;
  const label = `${selectedCount} ${selectedCount === 1 ? noun : `${noun}s`} selected`;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] px-3 py-2 shadow-sm",
        className,
      )}
      role="region"
      aria-label="Bulk actions"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <div className="text-xs font-medium text-foreground">
          {label}
          {typeof totalCount === "number" && (
            <span className="text-muted-foreground/70 ml-1">
              of {totalCount}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap justify-end">{actions}</div>
    </div>
  );
}
