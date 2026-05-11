import { cn } from "@/lib/utils";
import { AGENDA_TONE_CLASSES, toneFor, type AgendaStatus, type AgendaTone } from "./types";

interface Props {
  status: AgendaStatus;
  tone?: AgendaTone;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Status indicator dot. Pulse should be reserved for "needs attention" states. */
export function StatusPulseDot({ status, tone, pulse, size = "sm", className }: Props) {
  const t = toneFor(status, tone);
  const dim = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  return (
    <span className={cn("relative inline-flex shrink-0", dim, className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-60 animate-ping",
            AGENDA_TONE_CLASSES[t].dot,
          )}
          aria-hidden
        />
      )}
      <span
        className={cn(
          "relative inline-block rounded-full",
          dim,
          AGENDA_TONE_CLASSES[t].dot,
        )}
      />
    </span>
  );
}
