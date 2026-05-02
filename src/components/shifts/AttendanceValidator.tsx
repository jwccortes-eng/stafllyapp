/**
 * AttendanceValidator
 *
 * Single component used by ShiftDetailDialog (desktop) and
 * MobileShiftOperationsSheet (mobile) to render per-worker:
 *   - clock-in/out time (if a time_entry exists)
 *   - validation buttons (Present / Late / Absent / Excused)
 *
 * Writes to `shift_assignments.attendance_status`. NEVER touches
 * `time_entries` or payroll. RLS already restricts who can update.
 */
import { useState } from "react";
import { Check, Clock, AlertTriangle, X, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ATTENDANCE_OPTIONS,
  type AttendanceValidationStatus,
} from "@/lib/shifts/assignment-coverage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AttendanceValidatorProps {
  assignmentId: string;
  workerName: string;
  /** ISO clock-in (if worker actually clocked in). Display-only. */
  clockInAt?: string | null;
  clockOutAt?: string | null;
  attendanceStatus: AttendanceValidationStatus | null | undefined;
  validatedAt?: string | null;
  canEdit: boolean;
  onChanged?: (next: AttendanceValidationStatus) => void;
  /** Compact = mobile (icon-only buttons + dropdown). */
  compact?: boolean;
}

function formatClock(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

const STATUS_STYLES: Record<AttendanceValidationStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  late: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  absent: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  excused: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
};

export function AttendanceValidator({
  assignmentId,
  workerName,
  clockInAt,
  clockOutAt,
  attendanceStatus,
  canEdit,
  onChanged,
  compact = false,
}: AttendanceValidatorProps) {
  const [busy, setBusy] = useState<AttendanceValidationStatus | null>(null);
  const current: AttendanceValidationStatus = (attendanceStatus ?? "pending") as AttendanceValidationStatus;

  const setStatus = async (next: AttendanceValidationStatus) => {
    if (!canEdit || busy) return;
    setBusy(next);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("shift_assignments")
      .update({
        attendance_status: next,
        attendance_validated_by: user?.id ?? null,
        attendance_validated_at: new Date().toISOString(),
      } as any)
      .eq("id", assignmentId);
    setBusy(null);
    if (error) {
      toast.error(`Couldn't update ${workerName}: ${error.message}`);
      return;
    }
    onChanged?.(next);
    toast.success(`${workerName} marked ${next}`);
  };

  const PrimaryBtn = ({
    value,
    icon: Icon,
    label,
  }: {
    value: AttendanceValidationStatus;
    icon: typeof Check;
    label: string;
  }) => {
    const active = current === value;
    const isLoading = busy === value;
    return (
      <Button
        type="button"
        size="sm"
        variant={active ? "default" : "outline"}
        disabled={!canEdit || (busy !== null && !isLoading)}
        onClick={() => setStatus(value)}
        className={cn(
          "h-8 rounded-lg gap-1 text-xs font-medium",
          active && value === "present" && "bg-emerald-600 hover:bg-emerald-600/90 text-white border-emerald-600",
          active && value === "late" && "bg-amber-500 hover:bg-amber-500/90 text-white border-amber-500",
          active && value === "absent" && "bg-rose-600 hover:bg-rose-600/90 text-white border-rose-600",
          compact && "h-9 px-2.5",
        )}
        aria-label={label}
        aria-pressed={active}
      >
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        {!compact && <span>{label}</span>}
      </Button>
    );
  };

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{workerName}</span>
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border border-transparent",
              STATUS_STYLES[current],
            )}
          >
            {current}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
          <Clock className="h-3 w-3" />
          <span>
            {clockInAt ? formatClock(clockInAt) : "no clock-in"}
            {clockOutAt ? ` → ${formatClock(clockOutAt)}` : ""}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <PrimaryBtn value="present" icon={Check} label="Present" />
        <PrimaryBtn value="late" icon={AlertTriangle} label="Late" />
        <PrimaryBtn value="absent" icon={X} label="Absent" />
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg"
                disabled={busy !== null}
                aria-label="More attendance options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ATTENDANCE_OPTIONS.map(opt => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={cn(current === opt.value && "font-semibold")}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
