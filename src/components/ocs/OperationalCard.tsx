/**
 * OX-4 — OperationalCard: base de todo el Operational Card System.
 *
 * Estructura canónica (no alterar el orden):
 *   Estado → Identidad → Contexto → Información principal →
 *   Información secundaria → CTA principal → Acciones secundarias
 *
 * Presentacional puro: sin queries, sin mutaciones, sin lógica de negocio.
 */
import * as React from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { MT, TAP, FOCUS_RING } from "@/lib/mobile/mobile-scale";
import { useIsMobile } from "@/hooks/use-mobile";
import { getStatusFamily, type StatusKey } from "@/lib/status/status-registry";
import {
  OCS_ACCENT,
  OCS_INTERACTIVE,
  OCS_MUTED,
  OCS_PADDING,
  OCS_STACK,
  OCS_SURFACE,
  OCS_TITLE,
  type OcsDensity,
  type OcsMode,
  type OcsVariant,
} from "./tokens";

export interface OcsAction {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  loading?: boolean;
  /** `danger` para acciones destructivas. */
  tone?: "default" | "danger" | "quiet";
  "aria-label"?: string;
}

export interface OperationalCardProps {
  /** Estado operativo (clave del registro OX-2). Se pinta arriba y en el rail. */
  status?: StatusKey | (string & {});
  /** Etiqueta que sustituye a la del registro, sin cambiar el color. */
  statusLabel?: string;
  /** Slot adicional junto al estado (contadores, hora, referencia). */
  statusAside?: React.ReactNode;

  /** Identidad: avatar/icono. */
  leading?: React.ReactNode;
  /** Identidad: nombre de la entidad. Obligatorio. */
  title: React.ReactNode;
  /** Identidad: segunda línea (rol, cliente, referencia). */
  subtitle?: React.ReactNode;
  /** Valor destacado alineado a la derecha de la identidad. */
  trailing?: React.ReactNode;

  /** Contexto: chips, dónde/cuándo ocurre la operación. */
  context?: React.ReactNode;
  /** Información principal: lo que decide la operación. */
  primary?: React.ReactNode;
  /** Información secundaria: soporte, nunca decisiva. */
  secondary?: React.ReactNode;

  /** CTA principal: una sola por card. */
  action?: OcsAction;
  /** Acciones secundarias: máximo 3. */
  actions?: OcsAction[];
  /** Pie opcional: detalle expandible o nota operativa. Siempre al final. */
  footer?: React.ReactNode;


  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  /** Toda la card navega. Ignorado en `readonly`. */
  onClick?: () => void;
  className?: string;
  "aria-label"?: string;
}

function ActionButton({ action, block }: { action: OcsAction; block?: boolean }) {
  const Icon = action.icon;
  return (
    <Button
      type="button"
      size="sm"
      variant={
        action.tone === "danger"
          ? "destructive"
          : action.tone === "quiet"
          ? "ghost"
          : "default"
      }
      disabled={action.disabled || action.loading}
      aria-label={action["aria-label"] ?? action.label}
      onClick={(e) => {
        e.stopPropagation();
        action.onClick();
      }}
      className={cn(TAP, FOCUS_RING, MT.body, "rounded-xl", block && "w-full")}
    >
      {action.loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className="h-4 w-4" aria-hidden />
      ) : null}
      {action.label}
    </Button>
  );
}

export function OperationalCard({
  status,
  statusLabel,
  statusAside,
  leading,
  title,
  subtitle,
  trailing,
  context,
  primary,
  secondary,
  action,
  actions,
  variant = "standard",
  mode = "interactive",
  density = "auto",
  onClick,
  className,
  "aria-label": ariaLabel,
}: OperationalCardProps) {
  const isMobileViewport = useIsMobile();
  const isMobile = density === "auto" ? isMobileViewport : density === "mobile";
  const readonly = mode === "readonly";
  const tappable = !readonly && typeof onClick === "function";
  const Comp: React.ElementType = tappable ? "button" : "div";
  const family = status ? getStatusFamily(status) : null;
  const secondaryActions = (actions ?? []).slice(0, 3);

  return (
    <Comp
      type={tappable ? "button" : undefined}
      onClick={tappable ? onClick : undefined}
      aria-label={ariaLabel}
      className={cn(
        OCS_SURFACE,
        tappable && cn(OCS_INTERACTIVE, FOCUS_RING, "cursor-pointer"),
        className
      )}
    >
      {family && (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-0 bottom-0 w-[3px]",
            OCS_ACCENT[family]
          )}
        />
      )}

      <div
        className={cn(
          isMobile ? OCS_PADDING[variant].mobile : OCS_PADDING[variant].desktop,
          family && "pl-[calc(0.75rem+3px)]",
          OCS_STACK[variant]
        )}
      >
        {/* 1 — Estado */}
        {(status || statusAside) && (
          <div className="flex items-center justify-between gap-2">
            {status ? (
              <StatusBadge
                status={status}
                label={statusLabel}
                size={variant === "compact" ? "sm" : "md"}
              />
            ) : (
              <span />
            )}
            {statusAside && (
              <div className={cn(MT.caption, OCS_MUTED, "shrink-0 tabular-nums")}>
                {statusAside}
              </div>
            )}
          </div>
        )}

        {/* 2 — Identidad */}
        <div className="flex items-center gap-3 min-w-0">
          {leading && <div className="shrink-0">{leading}</div>}
          <div className="min-w-0 flex-1">
            <div className={cn(OCS_TITLE[variant], "truncate")}>{title}</div>
            {subtitle && (
              <div className={cn(MT.caption, OCS_MUTED, "truncate mt-0.5")}>
                {subtitle}
              </div>
            )}
          </div>
          {trailing && <div className="shrink-0 text-right">{trailing}</div>}
          {tappable && !trailing && !action && (
            <ChevronRight
              className={cn("h-4 w-4 shrink-0", OCS_MUTED)}
              aria-hidden
            />
          )}
        </div>

        {/* 3 — Contexto */}
        {context && (
          <div className={cn(MT.caption, OCS_MUTED, "flex flex-wrap items-center gap-x-2 gap-y-1")}>
            {context}
          </div>
        )}

        {/* 4 — Información principal */}
        {primary && <div className={MT.body}>{primary}</div>}

        {/* 5 — Información secundaria */}
        {secondary && variant !== "compact" && (
          <div className={cn(MT.caption, OCS_MUTED)}>{secondary}</div>
        )}

        {/* 6 — CTA principal + 7 — Acciones secundarias */}
        {(action || secondaryActions.length > 0) && (
          <div
            className={cn(
              "pt-1 flex gap-2",
              isMobile ? "flex-col" : "flex-row-reverse items-center justify-start"
            )}
          >
            {action && <ActionButton action={action} block={isMobile} />}
            {secondaryActions.length > 0 && (
              <div className={cn("flex gap-2", isMobile ? "w-full" : "")}>
                {secondaryActions.map((a) => (
                  <Button
                    key={a.label}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={a.disabled || a.loading}
                    aria-label={a["aria-label"] ?? a.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      a.onClick();
                    }}
                    className={cn(
                      TAP,
                      FOCUS_RING,
                      MT.body,
                      "rounded-xl",
                      isMobile && "flex-1"
                    )}
                  >
                    {a.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : a.icon ? (
                      <a.icon className="h-4 w-4" aria-hidden />
                    ) : null}
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Comp>
  );
}
