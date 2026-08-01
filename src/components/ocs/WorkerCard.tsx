/**
 * OX-4 — WorkerCard.
 * Responde: "¿Es la persona correcta para esta operación?"
 *
 * Reutilizable en: Assign Workers, Team Hub, Marketplace, Passport,
 * Search, Recommendations, Favorites.
 */
import * as React from "react";
import { Star, MapPin, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MT } from "@/lib/mobile/mobile-scale";
import { OperationalCard, type OcsAction } from "./OperationalCard";
import type { OcsDensity, OcsMode, OcsVariant } from "./tokens";
import type { StatusKey } from "@/lib/status/status-registry";

export interface WorkerCardProps {
  name: string;
  /** Rol / categoría operativa. */
  role?: string;
  avatarUrl?: string | null;
  /** Estado de disponibilidad o cumplimiento. */
  status?: StatusKey | (string & {});
  statusLabel?: string;
  /** Reputación 0-5. */
  rating?: number | null;
  /** Turnos completados u otra señal de experiencia. */
  completedShifts?: number | null;
  /** Distancia o zona. */
  distance?: string | null;
  /** Certificaciones / habilidades relevantes. */
  skills?: string[];
  /** Motivo por el que no debería asignarse (bloqueo o aviso). */
  blocker?: string | null;
  /** Motivo por el que el sistema lo recomienda. */
  recommendation?: string | null;
  action?: OcsAction;
  actions?: OcsAction[];
  /** Slot junto al estado (menús contextuales, referencias). */
  aside?: React.ReactNode;
  /** Pie opcional (detalle expandible "¿por qué?"). */
  footer?: React.ReactNode;
  onClick?: () => void;
  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  className?: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function WorkerCard({
  name,
  role,
  avatarUrl,
  status,
  statusLabel,
  rating,
  completedShifts,
  distance,
  skills = [],
  blocker,
  recommendation,
  action,
  actions,
  aside,
  footer,
  onClick,
  variant = "standard",
  mode = "interactive",
  density = "auto",
  className,
}: WorkerCardProps) {
  const size = variant === "compact" ? "h-9 w-9" : "h-11 w-11";

  return (
    <OperationalCard
      status={status}
      statusLabel={statusLabel}
      statusAside={
        typeof rating === "number" || aside ? (
          <span className="inline-flex items-center gap-2">
            {typeof rating === "number" && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 fill-current" aria-hidden />
                <span aria-label={`Reputación ${rating.toFixed(1)} de 5`}>
                  {rating.toFixed(1)}
                </span>
              </span>
            )}
            {aside}
          </span>
        ) : undefined
      }
      leading={
        <Avatar className={size}>
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className={MT.caption}>{initials(name)}</AvatarFallback>
        </Avatar>
      }
      title={name}
      subtitle={role}
      context={
        <>
          {distance && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              {distance}
            </span>
          )}
          {typeof completedShifts === "number" && (
            <span>{completedShifts} turnos completados</span>
          )}
        </>
      }
      primary={
        skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skills.slice(0, 4).map((s) => (
              <span
                key={s}
                className={cn(
                  MT.caption,
                  "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2 py-0.5"
                )}
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                {s}
              </span>
            ))}
            {skills.length > 4 && (
              <span className={cn(MT.caption, "text-muted-foreground")}>
                +{skills.length - 4}
              </span>
            )}
          </div>
        ) : undefined
      }
      secondary={
        blocker ? (
          <span className="inline-flex items-start gap-1.5 text-status-danger">
            <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden />
            {blocker}
          </span>
        ) : recommendation ? (
          <span>{recommendation}</span>
        ) : undefined
      }
      action={action}
      actions={actions}
      footer={footer}
      onClick={onClick}
      variant={variant}
      mode={mode}
      density={density}
      className={className}
      aria-label={`Trabajador ${name}${role ? `, ${role}` : ""}`}
    />
  );
}
