/**
 * StaflyStatusBadge — badge/chip semántico canónico.
 *
 * Único componente de estado del ecosistema. Presentacional puro.
 * Sustituye badges ad-hoc en cards, tablas, listas y cabeceras.
 */

import type { ReactNode, ComponentType } from "react";

import { cn } from "@/lib/utils";
import {
  STAFLY_BADGE_BASE,
  STAFLY_TONE_DOT,
  STAFLY_TONE_SOFT,
  type StaflyTone,
} from "./tokens";

export interface StaflyStatusBadgeProps {
  children: ReactNode;
  tone?: StaflyTone;
  icon?: ComponentType<{ className?: string }>;
  /** Punto sólido en lugar de icono. */
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}

export function StaflyStatusBadge({
  children,
  tone = "neutral",
  icon: Icon,
  dot,
  size = "sm",
  className,
  title,
}: StaflyStatusBadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        STAFLY_BADGE_BASE,
        STAFLY_TONE_SOFT[tone],
        size === "md" && "px-2.5 py-1 text-xs",
        className
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STAFLY_TONE_DOT[tone])} />
      )}
      {!dot && Icon && <Icon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}
