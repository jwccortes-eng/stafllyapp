/**
 * NextActionCard — premium "Próxima acción recomendada" card.
 *
 * Pure presentational. Receives a WorkerNextAction (computed by the pure
 * helper selectWorkerNextAction) plus a CTA dispatcher that knows how to
 * open the existing flows (tab change, invite dialog, etc).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  type WorkerNextAction,
  type NextActionTone,
  nextActionStatusLabel,
} from "@/lib/worker-next-action";

interface Props {
  action: WorkerNextAction;
  onAction?: (action: WorkerNextAction) => void;
  className?: string;
}

const TONE_STYLE: Record<NextActionTone, {
  card: string;
  icon: string;
  iconBg: string;
  badge: string;
  cta: string;
  Icon: typeof AlertCircle;
}> = {
  critical: {
    card: "border-destructive/30 bg-destructive/[0.04]",
    icon: "text-destructive",
    iconBg: "bg-destructive/10",
    badge: "bg-destructive/10 text-destructive border-destructive/30",
    cta: "",
    Icon: AlertCircle,
  },
  attention: {
    card: "border-warning/30 bg-warning/[0.04]",
    icon: "text-warning",
    iconBg: "bg-warning/10",
    badge: "bg-warning/10 text-warning border-warning/30",
    cta: "",
    Icon: AlertTriangle,
  },
  followup: {
    card: "border-primary/30 bg-primary/[0.03]",
    icon: "text-primary",
    iconBg: "bg-primary/10",
    badge: "bg-primary/10 text-primary border-primary/30",
    cta: "",
    Icon: Clock,
  },
  ready: {
    card: "border-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-950/10",
    icon: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    cta: "",
    Icon: CheckCircle2,
  },
};

export function NextActionCard({ action, onAction, className }: Props) {
  const style = TONE_STYLE[action.tone];
  const Icon = style.Icon;
  const isReady = action.tone === "ready";

  return (
    <Card className={cn("border", style.card, className)}>
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", style.iconBg)}>
            <Icon className={cn("h-5 w-5", style.icon)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Próxima acción
              </span>
              <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-semibold", style.badge)}>
                {nextActionStatusLabel(action.tone)}
              </Badge>
            </div>
            <div className="mt-0.5 text-[15px] font-bold leading-tight text-foreground">
              {action.label}
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground leading-snug">
              {action.helper}
            </p>
          </div>

          {!isReady && action.cta !== "none" && onAction && (
            <Button
              size="sm"
              className="h-8 text-[11px] gap-1.5 shrink-0 self-center"
              onClick={() => onAction(action)}
            >
              {action.ctaLabel}
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
