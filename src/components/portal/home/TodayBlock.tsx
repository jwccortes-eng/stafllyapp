/**
 * TodayBlock — secondary "today's shift" detail card, only rendered when
 * the NBA is *not* already covering the today shift.
 *
 * DS3a pilot: now uses ShiftRouteHeader (compact / worker variant).
 * Visual contract preserved: day chip, Entrada protagonist, Termina aprox.,
 * title, client/location row, meeting point row, chevron affordance.
 */
import type { NbaShift } from "@/lib/portal/next-best-action";
import { formatDisplayName } from "@/lib/format-helpers";
import { ShiftRouteHeader } from "@/components/stafly-ui";

interface Props {
  shift: NbaShift;
}

export function TodayBlock({ shift }: Props) {
  return (
    <ShiftRouteHeader
      variant="worker"
      density="compact"
      to="/portal/shifts"
      title={formatDisplayName(shift.title)}
      date={shift.date}
      startTime={shift.start_time ?? ""}
      endTime={shift.end_time ?? null}
      clientName={shift.client_name ? formatDisplayName(shift.client_name) : null}
      jobSiteName={shift.location_name ? formatDisplayName(shift.location_name) : null}
      meetingPoint={shift.meeting_point ? formatDisplayName(shift.meeting_point) : null}
    />
  );
}
