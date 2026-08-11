/**
 * StaflyEmptyState — estado vacío canónico.
 *
 * Un solo lenguaje de vacío en admin, portal y móvil.
 */

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAFLY_TEXT } from "./tokens";

export interface StaflyEmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function StaflyEmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
  className,
}: StaflyEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-fade-in",
        compact ? "py-8 gap-3" : "py-14 gap-4",
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl border border-border/50 bg-muted/40",
            compact ? "h-11 w-11" : "h-14 w-14"
          )}
        >
          <Icon className={cn("text-muted-foreground", compact ? "h-5 w-5" : "h-6 w-6")} />
        </div>
      )}
      <div className="max-w-xs space-y-1">
        <p className={cn(STAFLY_TEXT.sectionTitle, compact && "text-sm")}>{title}</p>
        {description && (
          <p className={cn(STAFLY_TEXT.meta, "leading-relaxed")}>{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
