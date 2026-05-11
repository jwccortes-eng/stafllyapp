import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight } from "lucide-react";
import { StatusPulseDot } from "./StatusPulseDot";
import { AGENDA_STATUS_LABEL_ES, AGENDA_TONE_CLASSES, toneFor, type AgendaItem } from "./types";

interface Props {
  item: AgendaItem;
  index?: number;
  /** First N items get staggered fade-in; pass `index < 8` only. */
  stagger?: boolean;
  density?: "comfortable" | "compact";
  onClick?: () => void;
  /** Inline secondary CTA (e.g. "Confirmar") */
  inlineActionLabel?: string;
  onInlineAction?: () => void;
  className?: string;
}

function dateLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return "Hoy";
  if (isTomorrow(d)) return "Mañana";
  return format(d, "EEE d MMM", { locale: es });
}

/** Compact timeline row: status dot + start time protagonist + title + subtitle + endTime muted. */
export function OperationalTimelineRow({
  item,
  index = 0,
  stagger = true,
  density = "comfortable",
  onClick,
  inlineActionLabel,
  onInlineAction,
  className,
}: Props) {
  const tone = toneFor(item.status, item.tone);
  const tcls = AGENDA_TONE_CLASSES[tone];
  const compact = density === "compact";
  const showStagger = stagger && index < 8;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full text-left rounded-2xl border border-border/40 bg-card",
        "transition-all duration-200 active:scale-[0.985]",
        "hover:border-border hover:bg-card/80",
        "flex items-stretch gap-3",
        compact ? "px-3 py-2" : "px-3 py-3",
        showStagger && "animate-fade-in",
        className,
      )}
      style={showStagger ? { animationDelay: `${index * 40}ms`, animationFillMode: "both" } : undefined}
    >
      {/* Left rail: dot + time */}
      <div className="flex flex-col items-center gap-1.5 shrink-0 pt-0.5">
        <StatusPulseDot
          status={item.status}
          tone={item.tone}
          pulse={item.status === "pending" || item.status === "needs_reacceptance"}
          size={compact ? "sm" : "md"}
        />
        <span className={cn(
          "font-mono font-bold tabular-nums leading-none text-foreground",
          compact ? "text-[13px]" : "text-[15px]",
        )}>
          {item.startTime}
        </span>
        {!compact && item.endTime && (
          <span className="text-[9.5px] text-muted-foreground/60 tabular-nums leading-none">
            {item.endTime}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <div className="flex items-center gap-2 min-w-0">
          <p className={cn(
            "font-semibold text-foreground truncate min-w-0 flex-1",
            compact ? "text-[12.5px]" : "text-[13.5px]",
          )}>
            {item.title}
          </p>
          <span className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
            tcls.chip,
          )}>
            {AGENDA_STATUS_LABEL_ES[item.status]}
          </span>
        </div>
        {(item.subtitle || item.date) && (
          <p className={cn(
            "text-muted-foreground/75 truncate leading-tight",
            compact ? "text-[10.5px] mt-0.5" : "text-[11.5px] mt-0.5",
          )}>
            {dateLabel(item.date)}
            {item.subtitle ? <> · {item.subtitle}</> : null}
          </p>
        )}
        {inlineActionLabel && onInlineAction && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onInlineAction(); }}
            className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[10.5px] font-bold text-primary hover:bg-primary/15 transition-colors"
          >
            {inlineActionLabel}
          </span>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight className="h-4 w-4 self-center text-muted-foreground/35 shrink-0" />
    </button>
  );
}
