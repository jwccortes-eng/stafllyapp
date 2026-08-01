/**
 * PendingBadgeRow — semaphore badges showing pending info on a shift.
 * Pure presentation; reads precomputed flags from `pending-flags.ts`.
 */
import { memo } from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAMILY_CLASSES } from "@/lib/status/status-registry";
import type { PendingFlag, PendingTone } from "@/lib/shifts/pending-flags";

// OX-2 — el color proviene de la familia semántica canónica.
const TONE_STYLES: Record<PendingTone, { className: string; Icon: any }> = {
  urgent: { className: FAMILY_CLASSES.critical, Icon: AlertCircle },
  warn: { className: FAMILY_CLASSES.warning, Icon: AlertTriangle },
  info: { className: FAMILY_CLASSES.progress, Icon: Info },
  ready: { className: FAMILY_CLASSES.positive, Icon: CheckCircle2 },
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
