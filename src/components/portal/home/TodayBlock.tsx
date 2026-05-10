/**
 * TodayBlock — secondary "today's shift" detail card, only rendered when
 * the NBA is *not* already covering the today shift (i.e., kind not in
 * clocked_in / clock_in_now / next_shift_today / confirm_shift).
 *
 * Renders a compact view of the next shift's day/time/place with a CTA.
 */
import { Link } from "react-router-dom";
import { Clock, MapPin, Briefcase, Navigation, ChevronRight } from "lucide-react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";
import type { NbaShift } from "@/lib/portal/next-best-action";
import { formatDisplayName } from "@/lib/format-helpers";
import { cn } from "@/lib/utils";

interface Props {
  shift: NbaShift;
}

export function TodayBlock({ shift }: Props) {
  const d = parseISO(shift.date);
  const today = isToday(d);
  const tomorrow = isTomorrow(d);

  return (
    <Link
      to="/portal/shifts"
      className="block rounded-2xl bg-card border border-border/50 px-4 py-3 active:scale-[0.99] transition-all shadow-sm"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {today && (
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-primary/12 text-primary tracking-wide">
              Today
            </span>
          )}
          {tomorrow && (
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-accent/40 text-accent-foreground tracking-wide">
              Tomorrow
            </span>
          )}
          {!today && !tomorrow && (
            <span className="text-[11px] font-semibold text-muted-foreground capitalize">
              {format(d, "EEE d MMM")}
            </span>
          )}
          <span className="text-[13px] font-bold text-foreground tabular-nums">
            {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
      </div>

      <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
        {formatDisplayName(shift.title)}
      </p>

      {(shift.location_name || shift.client_name) && (
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
          {shift.client_name && (
            <span className="flex items-center gap-1 truncate">
              <Briefcase className="h-3 w-3 shrink-0 text-primary/40" />
              <span className="truncate">{formatDisplayName(shift.client_name)}</span>
            </span>
          )}
          {shift.location_name && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0 text-primary/40" />
              <span className="truncate">{formatDisplayName(shift.location_name)}</span>
            </span>
          )}
        </div>
      )}

      {shift.meeting_point && (
        <div className={cn(
          "flex items-center gap-1.5 mt-2 text-[11px] text-primary/80",
          "bg-primary/[0.05] rounded-lg px-3 py-1.5",
        )}>
          <Navigation className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium">{formatDisplayName(shift.meeting_point)}</span>
        </div>
      )}
    </Link>
  );
}
