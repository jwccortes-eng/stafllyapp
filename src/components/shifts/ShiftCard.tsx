import { Clock, GripVertical, Hand, Moon, Lock, MapPin, CalendarDays, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { EmployeeAvatarGroup } from "@/components/ui/employee-avatar-group";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";
import type { Shift } from "./types";
import { getClientColor, formatShiftCode } from "./types";

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

/**
 * Map shift+staffing state to a single ops tone.
 * Mirrors the logic used in ShiftDetailDialog header for visual coherence.
 */
function getShiftTone(
  shift: Shift,
  assignmentCount: number,
): { tone: OpsStatusTone; label: string } {
  const totalSlots = shift.slots ?? 1;

  if (shift.status === "locked") return { tone: "muted", label: "Bloqueado" };
  if (shift.status === "cancelled" || shift.status === "canceled")
    return { tone: "critical", label: "Cancelado" };

  if (assignmentCount === 0) return { tone: "critical", label: "Sin asignar" };
  if (assignmentCount < totalSlots) {
    const missing = totalSlots - assignmentCount;
    return { tone: "warning", label: `${missing} vacante${missing > 1 ? "s" : ""}` };
  }

  if (shift.status !== "published") return { tone: "info", label: "Borrador" };
  return { tone: "success", label: "Cubierto" };
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
  shift,
  assignmentCount,
  assignedNames = [],
  assignedEmployees = [],
  locationName,
  clientName,
  clientIds = [],
  onClick,
  compact,
  draggable,
  onDragStart,
  showDate,
  coverageStatus,
}: ShiftCardProps) {
  const color = getClientColor(shift.client_id, clientIds);
  const primary = getShiftTone(shift, assignmentCount);
  const overnight = isOvernight(shift.start_time, shift.end_time);
  const isLocked = shift.status === "locked";
  const totalSlots = shift.slots ?? 1;
  const fillPercent = Math.min(100, Math.round((assignmentCount / totalSlots) * 100));
  const isFull = assignmentCount >= totalSlots;
  const isEmpty = assignmentCount === 0;

  // Capacity bar tone — uses semantic tokens (matches OpsStatusChip language)
  const barTone = isFull
    ? "bg-earning"
    : isEmpty
    ? "bg-destructive/70"
    : "bg-warning";

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/shift-action", e.altKey ? "duplicate" : "move");
    e.dataTransfer.setData(
      "application/shift-data",
      JSON.stringify({
        shiftId: shift.id,
        title: shift.title,
        start_time: shift.start_time,
        end_time: shift.end_time,
        slots: shift.slots,
        client_id: shift.client_id,
        location_id: shift.location_id,
        notes: shift.notes,
        claimable: shift.claimable,
        status: shift.status,
      }),
    );
    if (e.altKey) e.dataTransfer.effectAllowed = "copy";
    onDragStart?.(e);
  };

  return (
    <div
      className={cn(
        "group cursor-pointer relative rounded-xl border border-border/40 bg-card",
        "transition-[transform,box-shadow,border-color] duration-150",
        "hover:-translate-y-px hover:shadow-sm hover:border-border/70",
        isLocked && "opacity-70",
      )}
      draggable={draggable && !isLocked}
      onDragStart={handleDragStart}
      onClick={onClick}
    >
      {/* Client accent — whisper-thin identity rail, never competes */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-3 bottom-3 w-[1.5px] rounded-r-full",
          color.dot,
          "opacity-40 group-hover:opacity-60 transition-opacity",
        )}
      />

      <div className={cn("pl-3 pr-3 py-2.5", compact && "pl-2.5 pr-2.5 py-2")}>
        {/* Row 1 — title + code + status */}
        <div className="flex items-center gap-2 min-w-0">
          {draggable && (
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/25 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -ml-0.5" />
          )}
          {shift.shift_code && (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70 bg-muted/50 rounded px-1.5 py-px shrink-0">
              {formatShiftCode(shift.shift_code)}
            </span>
          )}
          <p
            className={cn(
              "font-semibold text-foreground truncate flex-1 leading-tight",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {shift.title}
          </p>
          <OpsStatusChip label={primary.label} tone={primary.tone} size="sm" />
        </div>

        {/* Row 2 — meta line: time · duration · client · location */}
        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/85 min-w-0">
          <Clock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          <span className="font-medium tabular-nums shrink-0">
            {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
          </span>
          <span className="text-muted-foreground/40 shrink-0">·</span>
          <span className="tabular-nums text-muted-foreground/70 shrink-0">
            {calcDuration(shift.start_time, shift.end_time)}
          </span>
          {clientName && (
            <>
              <span className="text-muted-foreground/40 shrink-0">·</span>
              <span className="truncate">{clientName}</span>
            </>
          )}
        </div>

        {/* Row 2.5 — date (when shown across views) */}
        {showDate && (
          <p className="text-[10px] text-muted-foreground/60 capitalize mt-0.5">
            {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
          </p>
        )}

        {/* Row 3 — location (only if no client shown above to avoid duplication) */}
        {locationName && !clientName && (
          <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground/70 min-w-0">
            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="truncate">{locationName}</span>
          </div>
        )}

        {/* Row 4 — capacity bar + ratio + signals */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-[3px] bg-muted/60 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-300", barTone)}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground/70 font-medium shrink-0">
            {assignmentCount}/{totalSlots}
          </span>
          {/* Signal icons — desaturated, sober */}
          <div className="flex items-center gap-1 shrink-0">
            {shift.claimable && (
              <Hand className="h-3 w-3 text-muted-foreground/55" aria-label="Claimable" />
            )}
            {overnight && (
              <Moon className="h-3 w-3 text-muted-foreground/55" aria-label="Overnight" />
            )}
            {isLocked && (
              <Lock className="h-3 w-3 text-muted-foreground/55" aria-label="Locked" />
            )}
          </div>
        </div>

        {/* Row 5 — assigned avatars (only when present) */}
        {assignedEmployees.length > 0 ? (
          <div className="mt-2">
            <EmployeeAvatarGroup
              employees={assignedEmployees}
              max={5}
              size="xs"
              showNames={false}
            />
          </div>
        ) : assignedNames.length > 0 ? (
          <p className="mt-2 text-[10px] text-muted-foreground/60 truncate">
            {assignedNames.slice(0, 3).join(" · ")}
            {assignedNames.length > 3 && ` +${assignedNames.length - 3}`}
          </p>
        ) : null}

        {/* Row 6 — coverage warning, only when off target */}
        {coverageStatus && coverageStatus.percent < 100 && coverageStatus.missing > 0 && (
          <div className="mt-1.5">
            <OpsStatusChip
              label={`${coverageStatus.missing} sin fichar`}
              tone="warning"
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
