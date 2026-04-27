/**
 * SectionCard — premium card wrapper used by all shift form sections.
 *
 * Variants:
 *   - default: standard form card
 *   - hero:    accented border (used by Job Site as the protagonist)
 *   - muted:   informational state (collapsed sub-blocks)
 */
import { memo } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  icon?: any;
  title: string;
  subtitle?: string;
  required?: boolean;
  variant?: "default" | "hero" | "muted";
  /** Optional right-aligned slot in the header (badges, toggles…) */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function SectionCardImpl({
  icon: Icon,
  title,
  subtitle,
  required,
  variant = "default",
  action,
  children,
  className,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card overflow-hidden transition-colors",
        variant === "hero" && "border-primary/30 shadow-sm",
        variant === "muted" && "border-border/30 bg-muted/20",
        variant === "default" && "border-border/40",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-3 px-4 py-3",
          (subtitle || variant === "hero") ? "pb-2" : "",
          "border-b border-border/30",
          variant === "hero" && "bg-primary/[0.04]",
          variant === "muted" && "bg-transparent border-b-0 pb-0",
        )}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {Icon && (
            <div
              className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                variant === "hero" ? "bg-primary/15" : "bg-muted/60",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", variant === "hero" ? "text-primary" : "text-muted-foreground")} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className={cn("text-[13px] font-semibold leading-tight", variant === "hero" && "text-foreground")}>
                {title}
              </span>
              {required && <span className="text-destructive text-xs leading-none">*</span>}
            </div>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children !== null && children !== undefined && (
        <div className={cn("p-4 space-y-3", variant === "muted" && "pt-3")}>{children}</div>
      )}
    </div>
  );
}

export const SectionCard = memo(SectionCardImpl);
