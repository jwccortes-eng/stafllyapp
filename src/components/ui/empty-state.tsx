import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center animate-fade-in",
      compact ? "py-8 gap-3" : "py-16 gap-4",
      className
    )}>
      <div className={cn(
        "rounded-2xl bg-muted/50 flex items-center justify-center",
        compact ? "h-12 w-12" : "h-16 w-16"
      )}>
        <Icon className={cn(
          "text-muted-foreground/40",
          compact ? "h-6 w-6" : "h-8 w-8"
        )} />
      </div>
      <div className="space-y-1 max-w-xs">
        <p className={cn(
          "font-semibold text-foreground font-heading",
          compact ? "text-sm" : "text-base"
        )}>{title}</p>
        {description && (
          <p className={cn(
            "text-muted-foreground leading-relaxed",
            compact ? "text-xs" : "text-sm"
          )}>{description}</p>
        )}
      </div>
      {actionLabel && onAction && (
        <Button
          size={compact ? "sm" : "default"}
          variant="outline"
          onClick={onAction}
          className="mt-1"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
