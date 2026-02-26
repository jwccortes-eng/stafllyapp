import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorBlockProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ErrorBlock({
  title = "Algo salió mal",
  message = "No pudimos cargar los datos. Intenta de nuevo.",
  onRetry,
  compact = false,
  className,
}: ErrorBlockProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center animate-fade-in",
      compact ? "py-8 gap-3" : "py-16 gap-4",
      className
    )}>
      <div className={cn(
        "rounded-2xl bg-destructive/10 flex items-center justify-center",
        compact ? "h-12 w-12" : "h-16 w-16"
      )}>
        <AlertTriangle className={cn(
          "text-destructive",
          compact ? "h-6 w-6" : "h-8 w-8"
        )} />
      </div>
      <div className="space-y-1 max-w-xs">
        <p className={cn(
          "font-semibold text-foreground font-heading",
          compact ? "text-sm" : "text-base"
        )}>{title}</p>
        <p className={cn(
          "text-muted-foreground",
          compact ? "text-xs" : "text-sm"
        )}>{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size={compact ? "sm" : "default"} onClick={onRetry} className="mt-1">
          <RefreshCw className="h-4 w-4 mr-2" />
          Reintentar
        </Button>
      )}
    </div>
  );
}
