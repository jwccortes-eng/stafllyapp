/**
 * StaflyActionBar — barra de acciones canónica.
 *
 * Desktop/iPad: fila alineada a la derecha dentro del contenido.
 * Móvil: barra fija inferior con safe-area (`sticky`).
 * La jerarquía es idéntica: acción protagonista a la derecha/última.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAFLY_MOBILE_SAFE_BOTTOM } from "./tokens";

export interface StaflyActionBarProps {
  children: ReactNode;
  /** Contenido secundario a la izquierda (contador de selección, resumen). */
  leading?: ReactNode;
  /** Fija la barra al fondo en móvil. */
  sticky?: boolean;
  className?: string;
}

export function StaflyActionBar({
  children,
  leading,
  sticky,
  className,
}: StaflyActionBarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        sticky
          ? cn(
              "sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/95 px-4 pt-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-4 sm:pb-3",
              STAFLY_MOBILE_SAFE_BOTTOM
            )
          : "",
        className
      )}
    >
      <div className="min-w-0 flex-1 text-xs text-muted-foreground">{leading}</div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
