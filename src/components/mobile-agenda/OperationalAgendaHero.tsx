import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationalTimeBlock } from "./OperationalTimeBlock";
import { AgendaMeetingPointRow } from "./AgendaMeetingPointRow";
import { StatusPulseDot } from "./StatusPulseDot";
import {
  AGENDA_STATUS_LABEL_ES,
  AGENDA_TONE_CLASSES,
  toneFor,
  type AgendaAction,
  type AgendaItem,
} from "./types";

interface Props {
  /** Small uppercase label above hero (e.g. "Tu próxima jornada") */
  eyebrow?: string;
  item: AgendaItem;
  /** Default "Termina aprox." */
  endTimeLabel?: string;
  /** Default "Entrada" */
  startTimeLabel?: string;
  primaryAction?: AgendaAction;
  secondaryAction?: AgendaAction;
  tertiaryAction?: AgendaAction;
  /** Card body click — usually opens detail drawer. */
  onClick?: () => void;
  className?: string;
}

function fmtDate(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return "Hoy";
  if (isTomorrow(d)) return "Mañana";
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

function durationCaption(start?: string, end?: string | null): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // overnight
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `≈ ${h}h ${m}m estimadas`;
  if (h) return `≈ ${h}h estimadas`;
  return `≈ ${m}m estimados`;
}

function variantToBtnVariant(v?: AgendaAction["variant"]) {
  switch (v) {
    case "destructive": return "destructive" as const;
    case "ghost": return "ghost" as const;
    case "secondary": return "secondary" as const;
    case "primary":
    default: return "default" as const;
  }
}

/**
 * Hero card for "next operational event".
 * - startTime is the visual protagonist.
 * - endTime is muted ("Termina aprox.").
 * - meetingPoint is highlighted as its own row when present.
 */
export function OperationalAgendaHero({
  eyebrow = "Tu próxima jornada",
  item,
  endTimeLabel = "Termina aprox.",
  startTimeLabel = "Entrada",
  primaryAction,
  secondaryAction,
  tertiaryAction,
  onClick,
  className,
}: Props) {
  const tone = toneFor(item.status, item.tone);
  const tcls = AGENDA_TONE_CLASSES[tone];
  const dur = durationCaption(item.startTime, item.endTime ?? undefined);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/40",
        "bg-gradient-to-br",
        tcls.glow,
        "shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.18)]",
        "animate-fade-in",
        className,
      )}
    >
      {/* Decorative top ring */}
      <div
        className={cn(
          "absolute -top-24 -right-20 h-56 w-56 rounded-full blur-3xl opacity-40 pointer-events-none",
          tcls.dot,
        )}
        aria-hidden
      />

      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        className={cn(
          "relative p-4 space-y-4",
          onClick && "transition-transform active:scale-[0.99] cursor-pointer",
        )}
      >
        {/* Eyebrow + status */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/85">
            {eyebrow}
          </span>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            tcls.chip,
          )}>
            <StatusPulseDot
              status={item.status}
              tone={item.tone}
              pulse={item.status === "pending" || item.status === "needs_reacceptance"}
            />
            {AGENDA_STATUS_LABEL_ES[item.status]}
          </span>
        </div>

        {/* Hero time */}
        <div className="flex items-end justify-between gap-3">
          <OperationalTimeBlock
            label={startTimeLabel}
            time={item.startTime}
            caption={fmtDate(item.date)}
            size="hero"
          />
          {item.endTime && (
            <OperationalTimeBlock
              label={endTimeLabel}
              time={item.endTime}
              caption={dur}
              size="sm"
              align="right"
              className="pb-1 opacity-80"
            />
          )}
        </div>

        {/* Title + subtitle */}
        <div className="space-y-0.5">
          <p className="text-[15px] font-bold text-foreground leading-tight">
            {item.title}
          </p>
          {item.subtitle && (
            <p className="text-[12px] text-muted-foreground/85 leading-snug truncate">
              {item.subtitle}
            </p>
          )}
        </div>

        {/* Meeting point */}
        {item.meetingPoint && (
          <AgendaMeetingPointRow point={item.meetingPoint} />
        )}

        {/* Actions */}
        {(primaryAction || secondaryAction || tertiaryAction) && (
          <div
            className="flex items-center gap-2 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {primaryAction && (
              <Button
                variant={variantToBtnVariant(primaryAction.variant)}
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled || primaryAction.loading}
                className="flex-1 h-11 rounded-xl text-[13px] font-bold gap-1.5"
              >
                {primaryAction.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  primaryAction.icon && <primaryAction.icon className="h-4 w-4" />
                )}
                {primaryAction.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                variant={variantToBtnVariant(secondaryAction.variant ?? "ghost")}
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled || secondaryAction.loading}
                className={cn(
                  "h-11 rounded-xl text-[13px] font-bold",
                  primaryAction ? "px-4" : "flex-1",
                )}
              >
                {secondaryAction.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  secondaryAction.label
                )}
              </Button>
            )}
            {tertiaryAction && (
              <Button
                variant={variantToBtnVariant(tertiaryAction.variant ?? "ghost")}
                onClick={tertiaryAction.onClick}
                disabled={tertiaryAction.disabled || tertiaryAction.loading}
                className="h-11 rounded-xl text-[13px] font-bold px-3"
              >
                {tertiaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
