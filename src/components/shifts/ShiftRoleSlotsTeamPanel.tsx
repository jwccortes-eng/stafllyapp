import { ROLE_LABELS, type ServiceRequestRoleType } from "@/lib/service-requests/types";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { cn } from "@/lib/utils";
import { Users, CheckCircle2, AlertCircle } from "lucide-react";
import type { ShiftRoleSlot } from "@/lib/service-requests/role-slot-utils";

interface SlotAssignment {
  id: string;
  employee_id: string;
  status: string;
  role_slot_id: string | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  gender?: string | null;
}

interface Props {
  slots: ShiftRoleSlot[];
  assignments: SlotAssignment[];
  employees: Employee[];
}

const ACTIVE = new Set(["pending", "confirmed", "review", "needs_reacceptance"]);

/**
 * Live, in-shift staffing plan view: one row per typed role slot from the
 * originating service request, showing capacity (filled / total) and the
 * specific employees that fill each role. Lets admins immediately see if
 * a converted shift still respects the original role plan
 * (e.g. "10 Waiters · 1 Captain") instead of a single anonymous bucket.
 */
export function ShiftRoleSlotsTeamPanel({ slots, assignments, employees }: Props) {
  if (slots.length === 0) return null;

  const orderedSlots = [...slots].sort((a, b) => a.sort_order - b.sort_order);
  const slotIds = new Set(orderedSlots.map(s => s.id));

  const unassignedToSlot = assignments.filter(a =>
    ACTIVE.has(a.status) && (!a.role_slot_id || !slotIds.has(a.role_slot_id))
  );

  const empById = new Map(employees.map(e => [e.id, e]));

  return (
    <div className="rounded-xl border border-primary/15 bg-primary/[0.02] p-2 space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <p className="text-[8px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
          <Users className="h-2.5 w-2.5" /> Plan de roles
        </p>
        <span className="text-[8px] font-semibold text-muted-foreground">
          {orderedSlots.length} {orderedSlots.length === 1 ? "rol" : "roles"}
        </span>
      </div>

      {orderedSlots.map(slot => {
        const filled = assignments.filter(
          a => a.role_slot_id === slot.id && ACTIVE.has(a.status),
        );
        const remaining = Math.max(0, slot.quantity - filled.length);
        const isFull = remaining === 0;
        const isOver = filled.length > slot.quantity;
        const label = slot.role_label || ROLE_LABELS[slot.role_type as ServiceRequestRoleType] || slot.role_type;

        return (
          <div
            key={slot.id}
            className={cn(
              "rounded-lg border px-2 py-1.5 transition-colors",
              isFull && !isOver && "border-earning/25 bg-earning/[0.04]",
              isOver && "border-warning/30 bg-warning/[0.04]",
              !isFull && !isOver && "border-border/30 bg-background/60",
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {isFull && !isOver ? (
                  <CheckCircle2 className="h-3 w-3 text-earning shrink-0" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-warning/70 shrink-0" />
                )}
                <span className="text-[10.5px] font-semibold truncate">{label}</span>
              </div>
              <span className={cn(
                "text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-full",
                isFull && !isOver && "bg-earning/15 text-earning",
                isOver && "bg-warning/15 text-warning",
                !isFull && !isOver && "bg-muted text-muted-foreground",
              )}>
                {filled.length}/{slot.quantity}
              </span>
            </div>

            {filled.length > 0 ? (
              <div className="flex items-center gap-1 flex-wrap pl-4">
                {filled.map(a => {
                  const emp = empById.get(a.employee_id);
                  if (!emp) return null;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-1 px-1 py-0.5 rounded-md bg-background/80 border border-border/30"
                      title={`${emp.first_name} ${emp.last_name}`}
                    >
                      <EmployeeAvatar
                        firstName={emp.first_name}
                        lastName={emp.last_name}
                        avatarUrl={emp.avatar_url}
                        gender={emp.gender}
                        size="xs"
                      />
                      <span className="text-[9px] font-medium truncate max-w-[80px]">
                        {emp.first_name}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[9px] text-muted-foreground italic pl-4">
                Sin asignar — faltan {remaining}
              </p>
            )}
          </div>
        );
      })}

      {unassignedToSlot.length > 0 && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-2 py-1">
          <p className="text-[9px] text-muted-foreground">
            <span className="font-semibold">{unassignedToSlot.length}</span> asignación(es) extra fuera del plan
          </p>
        </div>
      )}
    </div>
  );
}
