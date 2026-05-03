import { AlertTriangle, Users, Copy, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  slots: number;
  assigned: number;
  pending: number;
  rejected: number;
  specialInstructions?: string | null;
  isDraft?: boolean;
  onScrollToStaffing?: () => void;
  onDuplicateWithWorkers?: () => void;
}

/**
 * StaffingRequiredBanner — Phase 1 Quick Win #3.
 *
 * Premium banner shown on /app/shift-ops when a shift still needs staffing
 * action. Read-only signal — does not mutate the shift or assignments.
 */
export function StaffingRequiredBanner({
  slots, assigned, pending, rejected, specialInstructions, isDraft,
  onScrollToStaffing, onDuplicateWithWorkers,
}: Props) {
  const missing = Math.max(0, slots - assigned);
  const flaggedManual = !!specialInstructions && /manual staffing|staffing required|needs manual/i.test(specialInstructions);
  const empty = assigned === 0;
  const hasPending = pending > 0;

  // Show banner only when there's something actionable.
  if (!empty && missing === 0 && !flaggedManual && !hasPending && rejected === 0) return null;

  const tone = empty || missing > 0 || flaggedManual
    ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
    : "bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300";

  const title = empty
    ? "Este turno todavía necesita staffing."
    : missing > 0
      ? `Faltan ${missing} ${missing === 1 ? "trabajador" : "trabajadores"} por asignar.`
      : flaggedManual
        ? "Staffing manual requerido para este turno."
        : "Hay asignaciones pendientes de revisión.";

  const subtitle = isDraft
    ? "Revisa el equipo antes de publicar."
    : "Resuelve los pendientes para evitar problemas de cobertura.";

  return (
    <div className={cn("rounded-2xl border px-4 py-3 flex items-start gap-3", tone)}>
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-[11px] opacity-80 mt-0.5">{subtitle}</p>
        {flaggedManual && specialInstructions && (
          <p className="text-[10px] mt-1 italic opacity-70 line-clamp-2">📋 {specialInstructions}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <Button size="sm" variant="default" className="h-7 text-[11px] gap-1" onClick={onScrollToStaffing}>
            <Users className="h-3 w-3" /> Abrir equipo
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onScrollToStaffing}>
            <Search className="h-3 w-3" /> Buscar candidatos
          </Button>
          {onDuplicateWithWorkers && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={onDuplicateWithWorkers}>
              <Copy className="h-3 w-3" /> Duplicar con trabajadores
            </Button>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] uppercase tracking-wider opacity-60">Cobertura</p>
        <p className="text-base font-bold tabular-nums">{assigned}/{slots}</p>
      </div>
    </div>
  );
}
