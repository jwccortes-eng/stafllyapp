/**
 * OX-4.1 — AssignWorkerCard: card canónica de Assign Workers.
 *
 * Adaptador presentacional puro: traduce un `RankedCandidate` (motor de
 * recomendación, read-only) al Operational Card System (`WorkerCard`).
 *
 * Reglas duras:
 *   - No contiene lógica de asignación, readiness ni compliance.
 *   - No reinterpreta el veredicto del backend: usa `canAssign` tal cual.
 *   - Si `canAssign === false`, oculta el CTA de asignar y muestra la razón.
 *   - Compliance pendiente con `canAssign === true` es advertencia, nunca candado.
 */
import * as React from "react";
import { UserPlus, User, Phone, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { MT } from "@/lib/mobile/mobile-scale";
import { WorkerCard } from "@/components/ocs";
import type { OcsAction } from "@/components/ocs";
import type { OcsDensity, OcsVariant } from "@/components/ocs/tokens";
import type { StatusKey } from "@/lib/status/status-registry";
import type { RankedCandidate, RecReadinessState } from "@/lib/shifts/worker-recommendation";

export interface AssignChip {
  key: string;
  label: string;
  tone: "good" | "risk" | "muted";
}

interface AssignWorkerCardProps {
  candidate: RankedCandidate;
  /** CTA principal. Solo se muestra si el backend permite asignar. */
  onAssign?: (employeeId: string, workerName: string) => void;
  onViewProfile?: (employeeId: string) => void;
  onContact?: (candidate: RankedCandidate) => void;
  /** Solo cuando la operación es un reemplazo. */
  onReplace?: (employeeId: string, workerName: string) => void;
  assigning?: boolean;
  /** Señales cualitativas ya calculadas por la superficie. */
  chips?: AssignChip[];
  /** Resumen corto de por qué el sistema lo propone. */
  recommendation?: string | null;
  /** Slot junto al estado (p. ej. menú de afinidad). */
  aside?: React.ReactNode;
  /** Detalle expandible ("¿Por qué?"). */
  footer?: React.ReactNode;
  variant?: OcsVariant;
  density?: OcsDensity;
  className?: string;
}

const READINESS_STATUS: Record<RecReadinessState, { status: StatusKey; label: string }> = {
  ready: { status: "ready", label: "Listo" },
  compliance_warning: { status: "warning", label: "Compliance pendiente" },
  override_required: { status: "pending", label: "Requiere autorización" },
  compliance_blocked: { status: "blocked", label: "Bloqueado por política" },
  missing_phone: { status: "warning", label: "Sin teléfono" },
  inactive: { status: "inactive", label: "Inactivo" },
  needs_review: { status: "needs_review", label: "Requiere revisión" },
};

/** Razón exacta del veredicto del backend. No añade reglas nuevas. */
export function describeAssignBlocker(c: RankedCandidate): string | null {
  if (c.canAssign) return null;
  if (c.preferenceBlocked) return "Bloqueado para este cliente o lugar.";
  if (c.conflictDetected) return "Ya tiene un turno superpuesto en esta fecha.";
  switch (c.readinessState) {
    case "compliance_blocked":
      return "La política de cumplimiento de la compañía bloquea la asignación.";
    case "override_required":
      return "La política exige una autorización explícita antes de asignar.";
    case "inactive":
      return "El trabajador está inactivo o archivado.";
    case "needs_review":
      return "No se pudo leer el estado del trabajador.";
    default:
      return "El backend no permite asignar a este trabajador.";
  }
}

/** Advertencia que no bloquea (compliance en gracia). */
function describeWarning(c: RankedCandidate): string | null {
  if (!c.canAssign) return null;
  if (c.readinessState === "compliance_warning")
    return "Compliance pendiente. No bloquea la asignación.";
  return null;
}

export function AssignWorkerCard({
  candidate: c,
  onAssign,
  onViewProfile,
  onContact,
  onReplace,
  assigning,
  chips: chipsProp = [],
  recommendation,
  aside,
  footer,
  variant = "standard",
  density = "auto",
  className,
}: AssignWorkerCardProps) {
  const blocker = describeAssignBlocker(c);
  const warning = describeWarning(c);
  const readiness = READINESS_STATUS[c.readinessState] ?? READINESS_STATUS.needs_review;
  const statusInfo = blocker
    ? { status: "blocked" as StatusKey, label: c.conflictDetected ? "Conflicto" : "Bloqueado" }
    : readiness;

  const role =
    (c.employee.employee_role as string | null | undefined)?.trim() ||
    (c.driver ? "Conductor" : undefined);

  const action: OcsAction | undefined =
    c.canAssign && onAssign
      ? {
          label: "Asignar",
          icon: UserPlus,
          loading: assigning,
          onClick: () => onAssign(c.employee.id, c.name),
          "aria-label": `Asignar a ${c.name}`,
        }
      : undefined;

  const actions: OcsAction[] = [];
  if (onViewProfile)
    actions.push({
      label: "Ver perfil",
      icon: User,
      onClick: () => onViewProfile(c.employee.id),
      "aria-label": `Ver perfil de ${c.name}`,
    });
  if (onContact)
    actions.push({
      label: "Contactar",
      icon: Phone,
      disabled: !c.phone,
      onClick: () => onContact(c),
      "aria-label": `Contactar a ${c.name}`,
    });
  if (onReplace && c.canAssign)
    actions.push({
      label: "Reemplazar",
      icon: Repeat,
      onClick: () => onReplace(c.employee.id, c.name),
      "aria-label": `Usar a ${c.name} como reemplazo`,
    });

  // Los chips ya resumen historial; evitamos repetir el mismo dato en texto.
  let chips = chipsProp.filter((ch) => ch.label.trim().toLowerCase() !== statusInfo.label.trim().toLowerCase());
  const chipText = chips.map((ch) => ch.label.toLowerCase()).join(" | ");
  const hasClientChip = /cliente/.test(chipText);
  const hasLocationChip = /aqu[ií]/.test(chipText);

  const history: string[] = [];
  if (c.clientHistoryCount > 0 && !hasClientChip)
    history.push(
      `Trabajó con este cliente ${c.clientHistoryCount} ${c.clientHistoryCount === 1 ? "vez" : "veces"}`,
    );
  if (c.locationHistoryCount > 0 && !hasLocationChip)
    history.push(
      `Trabajó aquí ${c.locationHistoryCount} ${c.locationHistoryCount === 1 ? "vez" : "veces"}`,
    );
  if (c.availabilitySignal === "unavailable") history.push("Marcado como no disponible");
  if (!c.phone) history.push("Sin teléfono registrado");

  const recoText = warning ?? recommendation ?? undefined;
  const recoDuplicated =
    !!recoText && chipText.includes(recoText.trim().toLowerCase());


  return (
    <WorkerCard
      name={c.name}
      role={role}
      avatarUrl={c.employee.avatar_url}
      status={statusInfo.status}
      statusLabel={statusInfo.label}
      blocker={blocker}
      recommendation={recoDuplicated ? undefined : recoText}
      action={action}
      actions={actions}
      aside={aside}
      variant={variant}
      density={density}
      mode="interactive"
      className={cn(!c.canAssign && "opacity-95", className)}
      primary={
        <div className="space-y-1.5">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((ch) => (
                <span
                  key={ch.key}
                  className={cn(
                    MT.caption,
                    "rounded-md px-1.5 py-0.5 font-medium",
                    ch.tone === "good"
                      ? "bg-status-success-bg text-status-success"
                      : ch.tone === "risk"
                        ? "bg-status-warning-bg text-status-warning"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {ch.label}
                </span>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <p className={cn(MT.caption, "text-muted-foreground leading-snug")}>
              {history.join(" · ")}
            </p>
          )}
        </div>
      }
      footer={footer}
    />
  );
}
