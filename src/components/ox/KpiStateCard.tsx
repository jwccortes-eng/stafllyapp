import { RefreshCw, Loader2, AlertCircle, Settings2, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetricState } from "@/lib/ox/metric-state";

interface KpiStateCardProps {
  label: string;
  state: MetricState;
  onRetry?: () => void;
  onClick?: () => void;
  className?: string;
}

/**
 * P0 OX — a KPI that can never lie.
 * Renders loading / error / no_data / not_applicable / incomplete_configuration
 * as first-class states instead of collapsing everything into "0".
 * Touch targets are >= 44px.
 */
export function KpiStateCard({ label, state, onRetry, onClick, className }: KpiStateCardProps) {
  const clickable = !!onClick && state.kind === "zero_confirmed" && (state.value ?? 0) > 0;

  const body = () => {
    switch (state.kind) {
      case "loading":
        return (
          <div className="flex items-center gap-2 min-h-[44px]">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cargando…</span>
          </div>
        );
      case "error":
        return (
          <div className="min-h-[44px]">
            <p className="text-sm font-medium text-destructive">No pudimos cargar este dato.</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1.5 inline-flex items-center gap-1.5 min-h-[44px] px-3 -ml-3 text-sm font-semibold text-primary"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reintentar
              </button>
            )}
          </div>
        );
      case "no_data":
        return (
          <div className="flex items-start gap-2 min-h-[44px]">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground leading-snug">{state.message}</span>
          </div>
        );
      case "incomplete_configuration":
        return (
          <div className="flex items-start gap-2 min-h-[44px]">
            <Settings2 className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground leading-snug">{state.message}</span>
          </div>
        );
      case "not_applicable":
        return (
          <div className="flex items-start gap-2 min-h-[44px]">
            <MinusCircle className="h-4 w-4 text-muted-foreground/60 mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground leading-snug">{state.message}</span>
          </div>
        );
      case "zero_confirmed":
      default: {
        const n = state.value ?? 0;
        return (
          <div className="min-h-[44px]">
            <div className="flex items-baseline gap-1.5">
              <span className={cn(MT.metric, n > 0 ? "text-foreground" : "text-muted-foreground")}>
                {n}
              </span>
              <span className={cn(MT.caption, "font-medium text-muted-foreground")}>{state.unit}</span>
            </div>
            <p className={cn(MT.caption, "text-muted-foreground mt-1 leading-snug")}>{state.message}</p>
          </div>
        );
      }
    }
  };

  const Tag: React.ElementType = clickable ? "button" : "div";

  return (
    <Tag
      {...(clickable ? { type: "button", onClick } : {})}
      className={cn(
        "w-full text-left rounded-2xl border border-border/50 bg-card shadow-xs p-3.5",
        clickable && cn("active:scale-[0.98] transition-transform min-h-[88px]", FOCUS_RING),
        className,
      )}
    >
      <div className={cn(MT_EYEBROW, "text-muted-foreground mb-1.5")}>
        {label}
      </div>

      {body()}
    </Tag>
  );
}
