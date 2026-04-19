import { Clock, Users, GripVertical, MapPin, AlertTriangle, Hand, Moon, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { EmployeeAvatarGroup, type AvatarGroupItem } from "@/components/ui/employee-avatar-group";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";
import type { Shift } from "./types";
import { getClientColor, formatShiftCode } from "./types";
import type { ShiftCoverageItem } from "@/hooks/useShiftCoverage";

export interface AssignedEmployee {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  gender?: string | null;
}

interface ShiftCardProps {
  shift: Shift;
  assignmentCount: number;
  assignedNames?: string[];
  /** Rich avatar data for assigned employees */
  assignedEmployees?: AssignedEmployee[];
  locationName?: string;
  clientName?: string;
  clientIds?: string[];
  onClick: () => void;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  showDate?: boolean;
  coverageStatus?: { percent: number; missing: number; extra: number } | null;
}

type ChipSpec = { label: string; tone: OpsStatusTone };

function getStatusChips(shift: Shift, assignmentCount: number): ChipSpec[] {
  const chips: ChipSpec[] = [];
  const totalSlots = shift.slots ?? 1;

  if (assignmentCount === 0) {
    chips.push({ label: "Sin asignar", tone: "critical" });
  } else if (assignmentCount < totalSlots) {
    const missing = totalSlots - assignmentCount;
    chips.push({ label: `${missing} vacante${missing > 1 ? "s" : ""}`, tone: "warning" });
  }

  if (shift.status !== "published" && shift.status !== "locked") {
    chips.push({ label: "Borrador", tone: "info" });
  }

  if (shift.status === "locked") {
    chips.push({ label: "Bloqueado", tone: "muted" });
  }

  return chips;
}

function isOvernight(startTime: string, endTime: string): boolean {
  return endTime.slice(0, 5) <= startTime.slice(0, 5) && endTime.slice(0, 5) !== "00:00";
}

function calcDuration(start: string, end: string): string {
  const today = "2000-01-01";
  const s = new Date(`${today}T${start}`);
  let e = new Date(`${today}T${end}`);
  if (e <= s) e = new Date(e.getTime() + 24 * 60 * 60 * 1000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export function ShiftCard({
  shift, assignmentCount, assignedNames = [], assignedEmployees = [], locationName, clientName, clientIds = [], onClick, compact, draggable, onDragStart, showDate, coverageStatus,
}: ShiftCardProps) {
  const color = getClientColor(shift.client_id, clientIds);
  const chips = getStatusChips(shift, assignmentCount);
  const overnight = isOvernight(shift.start_time, shift.end_time);
  const isLocked = shift.status === "locked";
  const totalSlots = shift.slots ?? 1;
  const fillPercent = Math.min(100, Math.round((assignmentCount / totalSlots) * 100));
  const isFull = assignmentCount >= totalSlots;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/shift-action", e.altKey ? "duplicate" : "move");
    e.dataTransfer.setData("application/shift-data", JSON.stringify({
      shiftId: shift.id, title: shift.title, start_time: shift.start_time,
      end_time: shift.end_time, slots: shift.slots, client_id: shift.client_id,
      location_id: shift.location_id, notes: shift.notes, claimable: shift.claimable, status: shift.status,
    }));
    if (e.altKey) e.dataTransfer.effectAllowed = "copy";
    onDragStart?.(e);
  };

  return (
    <div
      className={cn(
        "cursor-pointer transition-all group border-l-[3px] rounded-xl overflow-hidden bg-white/90 dark:bg-card/90 border border-border/20 hover:shadow-md hover:-translate-y-0.5",
        color.border,
        isLocked && "opacity-75",
        draggable && "hover:ring-1 hover:ring-primary/15"
      )}
      draggable={draggable && !isLocked}
      onDragStart={handleDragStart}
      onClick={onClick}
    >
      <div className={cn("px-3 py-2.5", compact && "px-2.5 py-2")}>
        <div className="flex items-start gap-1.5">
          {draggable && (
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/20 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Title row */}
            <div className="flex items-start justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {shift.shift_code && (
                  <span className="text-[9px] font-mono font-semibold text-primary/60 bg-primary/8 rounded-md px-1.5 py-0.5 shrink-0">
                    #{formatShiftCode(shift.shift_code)}
                  </span>
                )}
                <p className={cn("font-semibold truncate leading-tight", compact ? "text-[11px]" : "text-xs")}>
                  {shift.title}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {shift.claimable && <Hand className="h-3 w-3 text-violet-400" />}
                {overnight && <Moon className="h-3 w-3 text-indigo-400" />}
                {isLocked && <Lock className="h-3 w-3 text-muted-foreground/50" />}
              </div>
            </div>

            {/* Time + duration */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
              <span className="flex items-center gap-1 shrink-0 font-medium">
                <Clock className="h-3 w-3" />
                {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
              </span>
              <span className="text-[9px] text-muted-foreground/50 font-medium">
                {calcDuration(shift.start_time, shift.end_time)}
              </span>
            </div>

            {/* Date (when shown) */}
            {showDate && (
              <p className="text-[9px] text-muted-foreground/60 capitalize">
                {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
              </p>
            )}

            {/* Assigned employees preview — avatar stack */}
            {assignedEmployees.length > 0 ? (
              <EmployeeAvatarGroup
                employees={assignedEmployees}
                max={4}
                size="xs"
                showNames={assignedEmployees.length <= 2}
              />
            ) : assignedNames.length > 0 ? (
              <div className="space-y-px">
                {assignedNames.slice(0, 2).map((name, i) => (
                  <div key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                    <Users className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{name}</span>
                  </div>
                ))}
                {assignedNames.length > 2 && (
                  <span className="text-[9px] text-muted-foreground/40 ml-3.5">+{assignedNames.length - 2} más</span>
                )}
              </div>
            ) : null}

            {/* Capacity bar + badges */}
            <div className="space-y-1 pt-0.5">
              {/* Mini capacity bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      isFull ? "bg-emerald-400 dark:bg-emerald-500" :
                      assignmentCount === 0 ? "bg-rose-400 dark:bg-rose-500" :
                      "bg-amber-400 dark:bg-amber-500"
                    )}
                    style={{ width: `${fillPercent}%` }}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-muted-foreground/60 font-medium shrink-0">
                  {assignmentCount}/{totalSlots}
                </span>
              </div>

              {/* Status chips — unified ops vocabulary */}
              {(chips.length > 0 || (coverageStatus && coverageStatus.percent < 100)) && (
                <div className="flex items-center gap-1 flex-wrap">
                  {chips.map((c, i) => (
                    <OpsStatusChip key={i} label={c.label} tone={c.tone} size="sm" />
                  ))}
                  {coverageStatus && coverageStatus.percent < 100 && (
                    <OpsStatusChip
                      label={coverageStatus.missing > 0 ? `${coverageStatus.missing} sin fichar` : `${coverageStatus.percent}%`}
                      tone="warning"
                      size="sm"
                      leading={<AlertTriangle className="h-2.5 w-2.5" />}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
