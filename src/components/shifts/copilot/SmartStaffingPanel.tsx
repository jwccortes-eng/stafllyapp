/**
 * SmartStaffingPanel — STAFFING INTELIGENTE dentro del Command Center.
 *
 * Cuando faltan personas el copiloto no muestra una lista enorme: prioriza
 * automáticamente con el motor único `rankCandidate` (historia con el cliente,
 * historia en el venue, fiabilidad, disponibilidad, conflictos, preferencias)
 * y permite resolver la recomendación SIN salir del Servicio.
 *
 * Escrituras: sólo `assign_worker_to_shift` (RPC canónica, ya usada en móvil).
 * No toca payroll, time entries, attendance ni publicación.
 */
import { memo, useMemo, useState } from "react";
import { Sparkles, Loader2, UserPlus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyError, notifySuccess } from "@/lib/feedback/notify";
import { useAssignmentStatuses } from "@/hooks/useAssignmentStatuses";
import { useRecommendationSignals } from "@/hooks/useRecommendationSignals";
import { describeAssignmentStatus, optimisticStatus } from "@/lib/shifts/assignment-status";
import { isAssignableWorker } from "@/lib/shifts/assignable-workers";
import { assignWorkerToShift } from "@/lib/shifts/team-actions";
import {
  rankCandidate,
  inferShiftRoleNeeds,
  type RankedCandidate,
  type ReasonChipKey,
  type RecReadinessState,
} from "@/lib/shifts/worker-recommendation";
import type { Assignment, Employee, Shift } from "../types";

interface Props {
  shift: Shift;
  employees: Employee[];
  assignments: Assignment[];
  companyId: string | null;
  /** Plazas pedidas por el cliente. */
  slots: number;
  assignedCount: number;
  /** Refresca la lista de asignaciones del contenedor tras asignar. */
  onAssigned?: () => void;
}

const REASON_LABEL: Partial<Record<ReasonChipKey, string>> = {
  worked_client: "Ya trabajó con el cliente",
  worked_location: "Conoce el venue",
  high_reliability: "Buena reputación",
  available: "Disponible",
  preferred: "Preferido por el cliente",
  prequalified: "Precalificado",
  driver: "Conductor",
  captain: "Captain",
  role_match: "Rol requerido",
  has_app: "Usa la app",
};

const RISK_LABEL: Partial<Record<ReasonChipKey, string>> = {
  conflict: "Turno solapado ese día",
  unavailable: "No disponible",
  low_reliability: "Historial con incidencias",
  blocked_here: "Bloqueado para este cliente",
  not_recommended: "No recomendado aquí",
};

function SmartStaffingPanelImpl(p: Props) {
  const missing = Math.max(0, p.slots - p.assignedCount);
  const [assigning, setAssigning] = useState<string | null>(null);

  const takenIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of p.assignments) {
      if (a.shift_id !== p.shift.id) continue;
      const st = (a.status ?? "").toLowerCase();
      if (st !== "rejected" && st !== "removed") s.add(a.employee_id);
    }
    return s;
  }, [p.assignments, p.shift.id]);

  const eligible = useMemo(
    () => p.employees.filter((e) => isAssignableWorker(e) && !takenIds.has(e.id)),
    [p.employees, takenIds],
  );

  const { statusById } = useAssignmentStatuses(
    eligible.map((e) => e.id),
    p.companyId,
  );
  const { signals, loading } = useRecommendationSignals({
    companyId: p.companyId,
    shift: p.shift as any,
    employeeIds: eligible.map((e) => e.id),
    enabled: missing > 0,
  });

  const roleNeeds = useMemo(() => inferShiftRoleNeeds(p.shift), [p.shift]);

  const ranked = useMemo<RankedCandidate[]>(() => {
    if (missing <= 0) return [];
    return eligible
      .map((e) => {
        const status = statusById.get(e.id) ?? optimisticStatus(e.id);
        const presentation = describeAssignmentStatus(status);
        return rankCandidate({
          employee: e,
          shift: p.shift,
          readinessState: status.readiness as RecReadinessState,
          canBeApproved: presentation.canAssign,
          alreadyAssigned: false,
          signals,
          needsDriver: roleNeeds.needsDriver,
          needsCaptain: roleNeeds.needsCaptain,
        });
      })
      .filter((c) => c.canAssign && !c.preferenceBlocked)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [eligible, statusById, signals, p.shift, roleNeeds, missing]);

  if (missing <= 0) return null;

  const handleAssign = async (c: RankedCandidate) => {
    setAssigning(c.employee.id);
    try {
      await assignWorkerToShift({
        shiftId: p.shift.id,
        employeeId: c.employee.id,
        source: "service_command_center",
      });
      notifySuccess({
        key: "service-staffing-assign",
        title: `${c.name} asignado`,
        fact: `Queda pendiente de que acepte el Servicio.`,
        consequence: `Cobertura ${p.assignedCount + 1}/${p.slots}.`,
      });
      p.onAssigned?.();
    } catch (e) {
      notifyError({
        key: "service-staffing-assign-failed",
        title: "No pudimos asignar a esta persona",
        fact: "La asignación no se registró.",
        consequence: "La cobertura del Servicio no cambió.",
        cause: e,
      });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border/30 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <h4 className="text-[12px] font-bold font-heading">Personas sugeridas</h4>
        <span className="ml-auto text-[10px] font-semibold text-muted-foreground">
          Faltan {missing} · {p.assignedCount}/{p.slots}
        </span>
      </div>

      {loading && ranked.length === 0 ? (
        <div className="px-3.5 py-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ordenando candidatos por
          historia con el cliente, fiabilidad y disponibilidad…
        </div>
      ) : ranked.length === 0 ? (
        <p className="px-3.5 py-4 text-[11px] text-muted-foreground">
          No hay personas asignables disponibles para este Servicio. Revisa el equipo
          activo o abre el reclamo para que el turno pueda tomarse.
        </p>
      ) : (
        <ul className="divide-y divide-border/30">
          {ranked.map((c) => {
            const reasons = c.reasons.map((r) => REASON_LABEL[r]).filter(Boolean) as string[];
            const risks = c.riskFlags.map((r) => RISK_LABEL[r]).filter(Boolean) as string[];
            return (
              <li key={c.employee.id} className="px-3.5 py-2.5 flex items-start gap-2.5">
                <div className="h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                  {c.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-tight truncate">{c.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reasons.slice(0, 3).map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-earning/10 text-earning px-1.5 py-0.5 text-[9px] font-semibold"
                      >
                        {r}
                      </span>
                    ))}
                    {risks.slice(0, 2).map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning px-1.5 py-0.5 text-[9px] font-semibold"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={assigning !== null}
                  onClick={() => handleAssign(c)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground hover:opacity-90",
                    assigning !== null && "opacity-50",
                  )}
                >
                  {assigning === c.employee.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <UserPlus className="h-3 w-3" />
                  )}
                  Asignar
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const SmartStaffingPanel = memo(SmartStaffingPanelImpl);
