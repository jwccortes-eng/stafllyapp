/**
 * OpsShiftCard — Daily Operations card.
 *
 * Wraps `ShiftRouteHeader` (admin, compact) with a coverage label + clock
 * indicator chips + bucket/alert chip + a single primary CTA. Read-only.
 *
 * Phase A: indicator chips are inline below the header. Phase B will swap
 * them for the canonical OpsCoverageBar/OpsClockChip/OpsAlertChip.
 */
import { ShiftRouteHeader } from "@/components/stafly-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, AlertTriangle, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUCKET_LABEL,
  BUCKET_TONE,
} from "@/lib/operations/derive-shift-ops-state";
import type { TodayOpsShift } from "@/hooks/useTodayOperations";

interface Props {
  shift: TodayOpsShift;
  onOperate?: (shiftId: string) => void;
}

const TONE_BADGE: Record<
  "neutral" | "info" | "success" | "warning" | "danger",
  string
> = {
  neutral: "bg-muted text-muted-foreground border-border/40",
  info: "bg-primary/10 text-primary border-primary/20",
  success:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  warning:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
};

const ALERT_TONE: Record<"info" | "warn" | "urgent", string> = {
  info: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  urgent: "text-destructive",
};

export function OpsShiftCard({ shift, onOperate }: Props) {
  const { ops } = shift;
  const tone = BUCKET_TONE[ops.bucket];
  const coverageLabel = `${ops.assigned_active}/${ops.required}`;

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <ShiftRouteHeader
        variant="admin"
        density="compact"
        title={shift.title || "Untitled shift"}
        shiftCode={shift.shift_code}
        clientName={shift.client_name}
        jobSiteName={shift.job_site_name}
        meetingPoint={shift.meeting_point}
        meetingTime={shift.meeting_time}
        date={shift.date}
        startTime={shift.start_time}
        endTime={shift.end_time}
        coverageLabel={`Coverage ${coverageLabel}`}
        statusLabel={BUCKET_LABEL[ops.bucket]}
        statusTone={
          tone === "success"
            ? "success"
            : tone === "warning"
              ? "warning"
              : tone === "danger"
                ? "danger"
                : tone === "info"
                  ? "info"
                  : "neutral"
        }
        pulse={ops.bucket === "in_progress"}
        className="border-0 shadow-none rounded-none"
      />

      <div className="px-4 pb-3 pt-1 flex flex-wrap items-center gap-2">
        <Chip icon={<Users className="h-3 w-3" />} label={`${ops.assigned_active}/${ops.required} assigned`} tone={ops.assigned_active < ops.required ? "warning" : "neutral"} />
        <Chip icon={<Clock className="h-3 w-3" />} label={`${ops.clocked_in} clocked in`} tone={ops.clocked_in > 0 ? "info" : "neutral"} />
        {ops.open_clocks > 0 && (
          <Chip icon={<Clock className="h-3 w-3" />} label={`${ops.open_clocks} open`} tone="warning" />
        )}
        {ops.missing_clock_outs > 0 && (
          <Chip
            icon={<AlertTriangle className="h-3 w-3" />}
            label={`${ops.missing_clock_outs} missing clock-out`}
            tone="danger"
          />
        )}
        {ops.not_started > 0 && ops.bucket !== "closed" && (
          <Chip
            icon={<AlertTriangle className="h-3 w-3" />}
            label={`${ops.not_started} not started`}
            tone={ops.alert_level === "urgent" ? "danger" : "warning"}
          />
        )}
        {shift.pending_claims > 0 && (
          <Chip
            icon={<Inbox className="h-3 w-3" />}
            label={`${shift.pending_claims} ${shift.pending_claims === 1 ? "solicitud" : "solicitudes"}`}
            tone="warning"
          />
        )}
      </div>

      <div className="px-4 pb-3 pt-0 flex items-center justify-between gap-2 border-t border-border/40">
        <p className={cn("text-[11px]", ALERT_TONE[ops.alert_level])}>
          {ops.reason}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1"
          onClick={() => onOperate?.(shift.id)}
        >
          Operate shift
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone: "neutral" | "info" | "warning" | "danger";
}) {
  const map: Record<typeof tone, string> = {
    neutral: TONE_BADGE.neutral,
    info: TONE_BADGE.info,
    warning: TONE_BADGE.warning,
    danger: TONE_BADGE.danger,
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium border text-[10.5px] px-2 py-0.5 rounded-full",
        map[tone],
      )}
    >
      {icon}
      {label}
    </Badge>
  );
}
