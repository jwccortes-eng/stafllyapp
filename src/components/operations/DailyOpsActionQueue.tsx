/**
 * DailyOpsActionQueue — "Qué resolver ahora".
 *
 * Read-only. Renders prioritized action cards from buildActionQueue().
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Car,
  ChevronRight,
  Clock,
  Inbox,
  MapPin,
  UserMinus,
  Users,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionItem, ActionKind } from "@/lib/operations/daily-ops-grouping";
import { ACTION_KIND_LABEL } from "@/lib/operations/daily-ops-grouping";

const ICON: Record<ActionKind, React.ReactNode> = {
  missing_driver: <Car className="h-4 w-4" />,
  transport_short: <Car className="h-4 w-4" />,
  missing_staff: <Users className="h-4 w-4" />,
  missing_clock_in: <Clock className="h-4 w-4" />,
  missing_clock_out: <AlertTriangle className="h-4 w-4" />,
  missing_location: <MapPin className="h-4 w-4" />,
  pending_closeout: <CheckCircle2 className="h-4 w-4" />,
  pending_claims: <Inbox className="h-4 w-4" />,
  extra_worker: <UserMinus className="h-4 w-4" />,
};

const TONE = {
  critical: "border-destructive/30 bg-destructive/5 text-destructive",
  high: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  info: "border-primary/20 bg-primary/5 text-primary",
} as const;

interface Props {
  items: ActionItem[];
  onOperate: (shiftId: string) => void;
  compact?: boolean;
}

export function DailyOpsActionQueue({ items, onOperate, compact }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-6 text-center">
        <CheckCircle2 className="h-5 w-5 mx-auto text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-semibold mt-2 text-foreground">
          Todo bajo control por ahora.
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          No hay acciones urgentes en la operación de hoy.
        </p>
      </div>
    );
  }
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2")}>
      {items.map((it) => (
        <div
          key={it.id}
          className={cn(
            "rounded-2xl border p-3.5 flex items-start gap-3",
            TONE[it.urgency],
          )}
        >
          <div className="mt-0.5 shrink-0">{ICON[it.kind]}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-semibold border-current"
              >
                {ACTION_KIND_LABEL[it.kind]}
              </Badge>
              <span className="text-[11px] text-muted-foreground truncate">
                {it.subtitle}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground mt-1 truncate">
              {it.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{it.message}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 shrink-0"
            onClick={() => onOperate(it.shiftId)}
          >
            Operar
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
