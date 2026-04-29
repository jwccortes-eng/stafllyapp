import { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_SURFACE, CARD_TAPPABLE } from "./mobile-admin-tokens";

interface MobileEntityCardProps {
  /** Avatar / icon slot */
  leading?: ReactNode;
  /** Primary line (e.g. name, title) */
  title: ReactNode;
  /** Secondary line (e.g. role, hint) */
  subtitle?: ReactNode;
  /** Right-aligned primary value (numbers, badges) */
  trailing?: ReactNode;
  /** Optional footer row for status / warning chips */
  footer?: ReactNode;
  /** If onClick is provided, card becomes tappable with chevron affordance */
  onClick?: () => void;
  /** Visual emphasis */
  tone?: "default" | "warning" | "danger";
  className?: string;
}

const TONE_RING: Record<NonNullable<MobileEntityCardProps["tone"]>, string> = {
  default: "",
  warning: "ring-1 ring-amber-500/30",
  danger: "ring-1 ring-destructive/40",
};

export function MobileEntityCard({
  leading,
  title,
  subtitle,
  trailing,
  footer,
  onClick,
  tone = "default",
  className,
}: MobileEntityCardProps) {
  const tappable = !!onClick;
  const Comp = tappable ? "button" : "div";

  return (
    <Comp
      type={tappable ? "button" : undefined}
      onClick={onClick}
      className={cn(
        CARD_SURFACE,
        "w-full text-left p-3.5",
        TONE_RING[tone],
        tappable && CARD_TAPPABLE,
        tappable && "hover:border-border",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-tight truncate">
              {subtitle}
            </div>
          )}
        </div>
        {trailing && (
          <div className="shrink-0 text-right tabular-nums">{trailing}</div>
        )}
        {tappable && !trailing && (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </div>
      {footer && (
        <div className="mt-2.5 pt-2.5 border-t border-border/40 flex flex-wrap items-center gap-1.5">
          {footer}
        </div>
      )}
    </Comp>
  );
}
