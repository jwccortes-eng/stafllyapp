import { LayoutGrid, List, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type ViewMode = "table" | "cards" | "compact";

interface ViewSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Optional list of allowed modes (defaults to all). */
  modes?: ViewMode[];
  className?: string;
}

const MODE_META: Record<ViewMode, { Icon: typeof List; label: string }> = {
  table: { Icon: List, label: "Table" },
  cards: { Icon: LayoutGrid, label: "Cards" },
  compact: { Icon: Rows3, label: "Compact" },
};

/**
 * Segmented control to switch between Table / Cards / Compact list views.
 */
export function ViewSwitcher({ value, onChange, modes = ["table", "cards", "compact"], className }: ViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className={cn(
        "inline-flex items-center rounded-lg border border-border/50 bg-background/60 p-0.5",
        className,
      )}
    >
      {modes.map((mode) => {
        const { Icon, label } = MODE_META[mode];
        const active = value === mode;
        return (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button
                role="tab"
                aria-selected={active}
                aria-label={label}
                onClick={() => onChange(mode)}
                className={cn(
                  "h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
