import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface OpsToolbarProps {
  /** Left cluster — typically view switchers, date navigation */
  left?: ReactNode;
  /** Center cluster — search, date range pickers */
  center?: ReactNode;
  /** Right cluster — primary actions, settings */
  right?: ReactNode;
  /** Filter chips rendered on a second row when present */
  chips?: ReactNode;
  className?: string;
  /** Sticky to top of scroll container (default: true) */
  sticky?: boolean;
}

/**
 * OpsToolbar — unified, sticky toolbar for operations pages.
 *
 * Visual contract:
 *  - Single row (left / center / right) at h-12, optional chip row below
 *  - Subtle bottom border, no card chrome — sits flush against KPI strip
 *  - Backdrop-blur when sticky → preserves scrollable context behind
 *
 * Used by Shifts, Time Clock, Clients to give a coherent operational shell.
 */
export function OpsToolbar({
  left,
  center,
  right,
  chips,
  className,
  sticky = true,
}: OpsToolbarProps) {
  return (
    <div
      className={cn(
        "z-20 -mx-4 px-4 md:mx-0 md:px-0",
        sticky && "sticky top-0 bg-background/85 backdrop-blur-md",
        "border-b border-border/60",
        className,
      )}
    >
      <div className="flex h-12 items-center gap-2 md:gap-3">
        {left && <div className="flex items-center gap-1.5 min-w-0">{left}</div>}
        {center && (
          <div className="flex flex-1 items-center justify-center gap-1.5 min-w-0">
            {center}
          </div>
        )}
        {right && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">{right}</div>
        )}
      </div>
      {chips && (
        <div className="flex flex-wrap items-center gap-1.5 pb-2 -mt-1">
          {chips}
        </div>
      )}
    </div>
  );
}
