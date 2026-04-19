import { useShiftRoleSlots } from "@/hooks/useServiceRequests";
import { ROLE_LABELS, type ServiceRequestRoleType } from "@/lib/service-requests/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

interface Props {
  shiftId: string;
}

/**
 * Shows the typed role slots of a shift created from a service request.
 * Confirms visually that the staffing plan (e.g. 10 waiters + 1 captain) is preserved
 * and trackable per role inside the shift.
 */
export function ShiftRoleSlotsPanel({ shiftId }: Props) {
  const { data, isLoading } = useShiftRoleSlots(shiftId);

  if (isLoading) return <Skeleton className="h-12 w-full" />;
  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Shift not created from a request — no typed role slots.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {data.map((s: any) => (
        <div
          key={s.id}
          className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
        >
          <span className="flex items-center gap-1.5">
            <Users className="size-3 text-muted-foreground" />
            <span className="font-medium">
              {s.role_label || ROLE_LABELS[s.role_type as ServiceRequestRoleType]}
            </span>
          </span>
          <span className="tabular-nums font-semibold">{s.quantity}</span>
        </div>
      ))}
    </div>
  );
}
