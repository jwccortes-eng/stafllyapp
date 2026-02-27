import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * PageHeader — 5 premium variants for consistent heading across the app.
 *
 * Variant 1: Icon box + Title + Subtitle (default for most pages)
 * Variant 2: Title + Badge + Subtitle (payroll / period pages)
 * Variant 3: Clean minimal title + subtitle (detail / sub-pages)
 * Variant 4: Eyebrow + Title + Subtitle + decorative underline (analytics / overview)
 * Variant 5: Shield-style icon + Title + Subtitle (admin / security pages)
 */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: "1" | "2" | "3" | "4" | "5";
  badge?: string;
  eyebrow?: string;
  /** Slot for action buttons on the right */
  rightSlot?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  variant = "1",
  badge,
  eyebrow,
  rightSlot,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          {/* Variant 4 eyebrow */}
          {variant === "4" && eyebrow && (
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">
              {eyebrow}
            </p>
          )}

          <div className="flex items-center gap-2.5">
            {/* Variant 1 & 5: Icon box */}
            {(variant === "1" || variant === "5") && Icon && (
              <div
                className={cn(
                  "h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center shrink-0",
                  variant === "5"
                    ? "bg-primary/10 ring-1 ring-primary/20"
                    : "bg-primary/8"
                )}
              >
                <Icon className="h-[18px] w-[18px] md:h-5 md:w-5 text-primary" strokeWidth={2} />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold font-heading tracking-tight text-foreground leading-tight">
                  {title}
                </h1>

                {/* Variant 2: Badge next to title */}
                {variant === "2" && badge && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/8 text-primary border-0"
                  >
                    {badge}
                  </Badge>
                )}
              </div>

              {subtitle && (
                <p className="text-xs md:text-sm text-muted-foreground mt-0.5 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Variant 4: Decorative underline */}
          {variant === "4" && (
            <div className="mt-3 flex items-center gap-2">
              <div className="h-[3px] w-10 rounded-full bg-primary" />
              <div className="h-[3px] w-3 rounded-full bg-primary/30" />
            </div>
          )}
        </div>

        {/* Right slot for actions */}
        {rightSlot && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  );
}
