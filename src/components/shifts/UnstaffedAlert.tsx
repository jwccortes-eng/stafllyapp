import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Heuristic: a shift is "unstaffed-needs-review" when it has required slots,
 * is in a state where assignments are expected (open / published), and has
 * zero assignments. This catches the import bug where Connecteam shifts land
 * with slots > 0 but no employees were matched.
 *
 * Read-only / visual only. Does NOT touch payroll, attendance, or schema.
 */
export function isUnstaffedNeedsReview(
  shift: { slots: number | null; status: string },
  assignmentCount: number,
): boolean {
  const slots = shift.slots ?? 0;
  if (slots <= 0) return false;
  if (assignmentCount > 0) return false;
  const s = (shift.status ?? "").toLowerCase();
  // Only published / open shifts deserve the alarm — drafts are expected to be empty.
  return s === "published" || s === "open" || s === "active";
}

interface UnstaffedAlertProps {
  shift: { slots: number | null; status: string };
  assignmentCount: number;
  /** "card" = compact chip for calendar/list. "detail" = full banner for ShiftDetail. */
  variant?: "card" | "detail";
  className?: string;
}

/**
 * Renders nothing if the shift is properly staffed (or shouldn't be flagged).
 * Otherwise:
 *  - variant="card"   → tiny inline pill ("0 staff · revisar")
 *  - variant="detail" → full warning banner with explanation
 */
export function UnstaffedAlert({
  shift,
  assignmentCount,
  variant = "card",
  className,
}: UnstaffedAlertProps) {
  if (!isUnstaffedNeedsReview(shift, assignmentCount)) return null;

  const slots = shift.slots ?? 0;

  if (variant === "card") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-destructive/40",
          "bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium",
          className,
        )}
        title={`${slots} cupo${slots > 1 ? "s" : ""} requerido${slots > 1 ? "s" : ""}, 0 asignados. Revisar importación/matching.`}
      >
        <AlertTriangle className="h-3 w-3" />
        0 staff · revisar
      </span>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-destructive/40",
        "bg-destructive/8 px-4 py-3",
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-destructive">
          Assignments faltantes — requiere revisión
        </p>
        <p className="text-xs text-destructive/80 mt-1 leading-relaxed">
          Este turno tiene <strong>{slots} cupo{slots > 1 ? "s" : ""} requerido{slots > 1 ? "s" : ""}</strong>{" "}
          pero <strong>0 empleados asignados</strong>. Si proviene de una importación
          (Connecteam, Migration), revisar el matching de empleados o reasignar manualmente.
        </p>
      </div>
    </div>
  );
}
