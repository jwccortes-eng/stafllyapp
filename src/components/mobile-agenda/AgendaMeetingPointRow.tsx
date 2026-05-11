import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaMeetingPoint } from "./types";

interface Props {
  point: AgendaMeetingPoint;
  className?: string;
  /** "compact" omits the caption and uses smaller padding */
  density?: "comfortable" | "compact";
}

/**
 * Reusable meeting-point row.
 * - If `time` exists, it is rendered as a protagonist secondary block beside the address.
 * - If no `time`, only the address is shown — never a placeholder.
 */
export function AgendaMeetingPointRow({ point, className, density = "comfortable" }: Props) {
  const hasTime = !!point.time;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-border/40 bg-muted/25",
        density === "compact" ? "px-2.5 py-2" : "px-3 py-2.5",
        className,
      )}
    >
      <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-background border border-border/50 flex items-center justify-center">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 leading-none mb-1">
          Punto de encuentro
        </p>
        <p className="text-[13px] font-semibold text-foreground leading-snug truncate">
          {point.address}
        </p>
        {density !== "compact" && point.caption && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
            {point.caption}
          </p>
        )}
      </div>
      {hasTime && (
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 leading-none mb-1">
            Hora
          </p>
          <p className="text-[15px] font-bold font-mono tabular-nums text-foreground leading-none">
            {point.time}
          </p>
        </div>
      )}
    </div>
  );
}
