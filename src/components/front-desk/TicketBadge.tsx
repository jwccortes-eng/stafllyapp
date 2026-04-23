import { Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  caseCode: string | null;
  status?: string | null;
  className?: string;
}

/** Floating elegant ticket pill, persistent across the kiosk session. */
export function TicketBadge({ caseCode, status, className }: Props) {
  if (!caseCode) return null;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur-md",
        className
      )}
    >
      <Ticket className="h-3.5 w-3.5" />
      <span className="tracking-wider tabular-nums">{caseCode}</span>
      {status && status !== "in_progress" && (
        <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide">
          {status === "resolved" ? "✓" : status === "pending_followup" ? "•" : status}
        </span>
      )}
    </div>
  );
}
