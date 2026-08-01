/**
 * OX-4 — TeamCard.
 * Responde: "¿Está listo el equipo?"
 * Siempre muestra cobertura y una acción para cerrar la brecha.
 */
import * as React from "react";
import { Users } from "lucide-react";
import { OperationalCard, type OcsAction } from "./OperationalCard";
import { CoverageMeter } from "./CoverageMeter";
import { EmployeeAvatarGroup } from "@/components/ui/employee-avatar-group";
import type { OcsDensity, OcsMode, OcsVariant } from "./tokens";
import type { StatusKey } from "@/lib/status/status-registry";

export interface TeamMemberSummary {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  gender?: string | null;
}

export interface TeamCardProps {
  /** Nombre del equipo o del turno al que pertenece. */
  title: string;
  subtitle?: string | null;
  assigned: number;
  slots: number;
  /** Confirmados / aceptados sobre los asignados. */
  confirmed?: number;
  /** Presentes (fichados) sobre los asignados. */
  present?: number;
  members?: TeamMemberSummary[];
  status?: StatusKey | (string & {});
  statusLabel?: string;
  action?: OcsAction;
  actions?: OcsAction[];
  onClick?: () => void;
  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  className?: string;
}

export function TeamCard({
  title,
  subtitle,
  assigned,
  slots,
  confirmed,
  present,
  members = [],
  status,
  statusLabel,
  action,
  actions,
  onClick,
  variant = "standard",
  mode = "interactive",
  density = "auto",
  className,
}: TeamCardProps) {
  const missing = Math.max(0, slots - assigned);
  const resolvedStatus =
    status ?? (missing > 0 ? (assigned === 0 ? "blocked" : "pending") : "ready");
  // OX-9.2 — una sola declaración de carencia, en lenguaje de personas.
  const resolvedLabel =
    statusLabel ??
    (missing > 0
      ? `${missing === 1 ? "Falta" : "Faltan"} ${missing} ${missing === 1 ? "persona" : "personas"}`
      : "Equipo completo");

  return (
    <OperationalCard
      status={resolvedStatus}
      statusLabel={resolvedLabel}
      leading={
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <Users className="h-4 w-4" />
        </span>
      }
      title={title}
      subtitle={subtitle ?? undefined}
      context={
        <>
          {slots > 0 && <span>{assigned} de {slots} cubiertos</span>}
          {typeof confirmed === "number" && (
            <span>{confirmed} confirmados</span>
          )}
          {typeof present === "number" && <span>{present} presentes</span>}
        </>
      }
      primary={
        <div className="space-y-2">
          <CoverageMeter
            assigned={assigned}
            slots={slots}
            label={`Cobertura del equipo: ${assigned} de ${slots}`}
          />
          {members.length > 0 && (
            <EmployeeAvatarGroup
              employees={members}
              max={6}
              size="xs"
              showNames={false}
            />
          )}
        </div>
      }
      action={action}
      actions={actions}
      onClick={onClick}
      variant={variant}
      mode={mode}
      density={density}
      className={className}
      aria-label={`Equipo de ${title}: ${assigned} de ${slots} cubiertos`}
    />
  );
}
