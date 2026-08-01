/**
 * OX-4 — ShiftCard (OCS).
 * Responde: "¿Qué necesita este turno?"
 *
 * Reutilizable en: Today Hub, Calendar, Command Center, Captain,
 * Payroll, Closeout.
 */
import * as React from "react";
import { Clock, MapPin, Users, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MT } from "@/lib/mobile/mobile-scale";
import { OperationalCard, type OcsAction } from "./OperationalCard";
import { CoverageMeter } from "./CoverageMeter";
import type { OcsDensity, OcsMode, OcsVariant } from "./tokens";
import type { StatusKey } from "@/lib/status/status-registry";

export interface OcsShiftCardProps {
  title: string;
  /** Cliente o cuenta. */
  clientName?: string | null;
  locationName?: string | null;
  /** Rango horario ya formateado ("08:00–16:00"). */
  timeRange?: string | null;
  /** Fecha ya formateada ("mié 12 ago"). */
  dateLabel?: string | null;
  /** Referencia corta visible ("Ref #0258"). */
  reference?: string | null;
  status?: StatusKey | (string & {});
  statusLabel?: string;
  assigned?: number;
  slots?: number;
  /** Qué le falta al turno, en una frase operativa. */
  need?: string | null;
  /** Información de apoyo (notas, incidencias, fichajes). */
  note?: string | null;
  action?: OcsAction;
  actions?: OcsAction[];
  onClick?: () => void;
  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  className?: string;
}

export function OcsShiftCard({
  title,
  clientName,
  locationName,
  timeRange,
  dateLabel,
  reference,
  status,
  statusLabel,
  assigned,
  slots,
  need,
  note,
  action,
  actions,
  onClick,
  variant = "standard",
  mode = "interactive",
  density = "auto",
  className,
}: OcsShiftCardProps) {
  const hasCoverage = typeof assigned === "number" && typeof slots === "number";

  return (
    <OperationalCard
      status={status}
      statusLabel={statusLabel}
      statusAside={reference ?? undefined}
      leading={
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <Clock className="h-4 w-4" />
        </span>
      }
      title={title}
      subtitle={
        [dateLabel, timeRange].filter(Boolean).join(" · ") || undefined
      }
      context={
        <>
          {clientName && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <Building2 className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{clientName}</span>
            </span>
          )}
          {locationName && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{locationName}</span>
            </span>
          )}
        </>
      }
      primary={
        hasCoverage ? (
          <div className="space-y-1.5">
            <CoverageMeter assigned={assigned!} slots={slots!} />
            {need && <p className={cn(MT.body, "font-medium")}>{need}</p>}
          </div>
        ) : need ? (
          <p className={cn(MT.body, "font-medium")}>{need}</p>
        ) : undefined
      }
      secondary={
        note ? (
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {note}
          </span>
        ) : undefined
      }
      action={action}
      actions={actions}
      onClick={onClick}
      variant={variant}
      mode={mode}
      density={density}
      className={className}
      aria-label={`Turno ${title}${timeRange ? `, ${timeRange}` : ""}`}
    />
  );
}
