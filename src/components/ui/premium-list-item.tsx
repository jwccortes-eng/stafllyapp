import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * PremiumListItem — compact single-row identity item for the "Compact list" view.
 *
 * Pattern:
 *   [avatar]  Name · meta1 · meta2          [right slot]
 *
 * Designed to share visual language with PremiumTable rows but in a denser,
 * scannable list (good for mobile and side panels too).
 */

interface PremiumListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  /** Inline meta items, separated by middots. */
  meta?: Array<ReactNode | null | undefined | false>;
  /** Right-aligned content (badges, status, etc.). */
  trailing?: ReactNode;
  /** Description rendered below the title (truncated). */
  subtitle?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function PremiumListItem({
  leading,
  title,
  meta,
  trailing,
  subtitle,
  selected,
  onClick,
  className,
}: PremiumListItemProps) {
  const cleanMeta = meta?.filter(Boolean) as ReactNode[] | undefined;
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group flex items-center gap-3 px-3 py-2 border-b border-border/40 last:border-b-0 transition-colors",
        onClick && "cursor-pointer hover:bg-accent/40",
        selected && "bg-primary/[0.05]",
        className,
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground truncate leading-tight">
          {title}
        </div>
        {(cleanMeta && cleanMeta.length > 0) && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
            {cleanMeta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 truncate">
                {i > 0 && <span className="text-muted-foreground/40">·</span>}
                <span className="truncate">{m}</span>
              </span>
            ))}
          </div>
        )}
        {subtitle && (
          <div className="mt-0.5 text-[11px] text-muted-foreground/80 truncate">
            {subtitle}
          </div>
        )}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-1.5">{trailing}</div>}
    </div>
  );
}
