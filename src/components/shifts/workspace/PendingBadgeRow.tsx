/**
 * PendingBadgeRow — semaphore badges showing pending info on a shift.
 * Pure presentation; reads precomputed flags from `pending-flags.ts`.
 */
import { memo } from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingFlag, PendingTone } from "@/lib/shifts/pending-flags";

const TONE_STYLES: Record<PendingTone, { className: string; Icon: any }> = {
  urgent: {
    className:
      "bg-destructive/10 text-destructive border-destructive/30",
    Icon: AlertCircle,
  },
  warn: {
    className:
      "bg-[hsl(var(--status-pending)/0.1)] text-[hsl(var(--status-pending))] border-[hsl(var(--status-pending)/0.3)]",
    Icon: AlertTriangle,
  },
  info: {
    className:
      "bg-primary/10 text-primary border-primary/30",
    Icon: Info,
  },
  ready: {
    className:
      "bg-[hsl(142_76%_36%/0.1)] text-[hsl(142_76%_36%)] border-[hsl(142_76%_36%/0.3)]",
    Icon: CheckCircle2,
  },
};

interface Props {
  flags: PendingFlag[];
}

function PendingBadgeRowImpl({ flags }: Props) {
  if (!flags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => {
        const t = TONE_STYLES[f.tone];
        const Icon = t.Icon;
        return (
          <span
            key={f.key}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-medium leading-none",
              t.className,
            )}
          >
            <Icon className="h-2.5 w-2.5 shrink-0" />
            {f.label}
          </span>
        );
      })}
    </div>
  );
}

export const PendingBadgeRow = memo(PendingBadgeRowImpl);
