import { CalendarDays, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
}

export function AgendaEmptyState({
  title,
  description,
  icon: Icon = CalendarDays,
  className,
}: Props) {
  return (
    <div className={cn("text-center py-12 space-y-3", className)}>
      <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/30 border border-border/15 flex items-center justify-center">
        <Icon className="h-7 w-7 text-muted-foreground/30" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground/70 max-w-[260px] mx-auto leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
