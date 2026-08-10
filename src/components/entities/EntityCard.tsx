/**
 * EntityCard — componente ÚNICO de representación de entidades del ecosistema.
 *
 * Se usa para Workers, Clientes, Venues, Partners, Passport, Identity Review,
 * selectores, reemplazos, directorios y resultados de búsqueda.
 *
 * REGLA DURA
 *  - Prohibido crear tarjetas nuevas para personas, clientes, lugares o
 *    partners. Cualquier superficie nueva consume este componente.
 *  - El color del borde del avatar SIEMPRE viene de getEntityStatusColor().
 *
 * Layout invariable:
 *   [avatar] Nombre                                        [acciones]
 *            REF • dato principal
 *            badges (críticos → atención → informativos)
 */

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  ENTITY_BADGE_CLASSES,
  entityInitials,
  formatEntityRef,
  getEntityStatusColor,
  sortEntityBadges,
  type EntityBadgeSpec,
  type EntityKind,
  type EntityStatusTone,
} from "@/lib/entities/entity-identity";

export type EntityCardDensity = "comfortable" | "compact";

export interface EntityCardProps {
  kind: EntityKind;
  name: string;
  avatarUrl?: string | null;
  /** Referencia ya formateada. Si no se pasa, se deriva de code/id/number. */
  reference?: string;
  code?: string | null;
  entityId?: string | null;
  number?: string | number | null;
  /** Dato principal junto a la referencia (teléfono, lugar, etc.). */
  primaryDetail?: React.ReactNode;
  /** Estado operativo → borde del avatar. */
  status?: EntityStatusTone;
  statusLabel?: string;
  badges?: EntityBadgeSpec[];
  /** Máximo de badges visibles; el resto colapsa en "+N". */
  maxBadges?: number;
  /** Acciones — siempre al extremo derecho, nunca debajo. */
  actions?: React.ReactNode;
  /** Slot antes del avatar (checkbox de selección en selectores). */
  leading?: React.ReactNode;
  /** Nota operativa breve bajo los badges (conflicto, motivo de bloqueo). */
  note?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  density?: EntityCardDensity;
  /** Sin borde ni fondo: para filas dentro de listas divididas. */
  bare?: boolean;
  className?: string;
}

const AVATAR_SIZE: Record<EntityCardDensity, string> = {
  comfortable: "h-12 w-12 sm:h-14 sm:w-14",
  compact: "h-10 w-10",
};

const PADDING: Record<EntityCardDensity, string> = {
  comfortable: "p-3 sm:p-3.5",
  compact: "p-2 sm:p-2.5",
};

export function EntityBadgePill({ badge }: { badge: EntityBadgeSpec }) {
  return (
    <span
      title={badge.hint}
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium leading-tight",
        ENTITY_BADGE_CLASSES[badge.tone],
        badge.tone === "critical" && "font-semibold",
      )}
    >
      {badge.label}
    </span>
  );
}

export function EntityCard({
  kind,
  name,
  avatarUrl,
  reference,
  code,
  entityId,
  number,
  primaryDetail,
  status = "operational",
  statusLabel,
  badges = [],
  maxBadges = 3,
  actions,
  leading,
  note,
  onClick,
  selected,
  density = "comfortable",
  bare = false,
  className,
}: EntityCardProps) {
  const color = getEntityStatusColor(status);
  const ref = reference ?? formatEntityRef(kind, { code, id: entityId, number });
  const ordered = sortEntityBadges(badges);
  const visible = ordered.slice(0, maxBadges);
  const hidden = ordered.length - visible.length;

  const interactive = !!onClick;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 text-left w-full transition-colors",
        PADDING[density],
        !bare && "rounded-2xl border border-border/50 bg-card",
        interactive && "cursor-pointer hover:bg-accent/40",
        selected && "bg-primary/[0.06]",
        status === "historical" && "opacity-75",
        className,
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      aria-label={`${name} · ${ref}`}
    >
      {leading && <div className="shrink-0">{leading}</div>}

      <Avatar
        className={cn(
          AVATAR_SIZE[density],
          "shrink-0 ring-2 ring-offset-2 ring-offset-background",
          color.ring,
        )}
        title={statusLabel ?? color.label}
      >
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback className="text-xs font-semibold">
          {entityInitials(name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-semibold leading-tight truncate",
            density === "comfortable" ? "text-sm sm:text-[15px]" : "text-[13px]",
          )}
        >
          {name}
        </p>

        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground leading-tight min-w-0">
          <span className="font-mono tabular-nums shrink-0">{ref}</span>
          {primaryDetail && (
            <>
              <span className="text-muted-foreground/40">•</span>
              <span className="truncate">{primaryDetail}</span>
            </>
          )}
        </p>

        {visible.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            {visible.map((b, i) => (
              <EntityBadgePill key={b.key ?? `${b.label}-${i}`} badge={b} />
            ))}
            {hidden > 0 && (
              <span
                className="text-[10px] text-muted-foreground"
                title={ordered.slice(maxBadges).map((b) => b.label).join(" · ")}
              >
                +{hidden}
              </span>
            )}
          </div>
        )}

        {note && (
          <p className="mt-1 text-[10.5px] text-muted-foreground truncate">{note}</p>
        )}
      </div>

      {actions && (
        <div
          className="shrink-0 flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export default EntityCard;
