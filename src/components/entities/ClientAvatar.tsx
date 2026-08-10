/**
 * CLIENT AVATAR — pieza del Unified Entity Design System.
 *
 * Mismo ADN que EmployeeAvatar (circular, tamaños compartidos) para que el
 * mismo cliente se reconozca en cualquier módulo del ecosistema.
 *
 * Prioridad visual: logo → iniciales → icono canónico de empresa.
 * Componente de presentación puro: no lee datos, no muta nada.
 */

import { memo } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { entityInitials } from "@/lib/entities/entity-identity";

export type ClientAvatarSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<ClientAvatarSize, string> = {
  xs: "h-5 w-5 text-[8px]",
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
};

const ICON_SIZES: Record<ClientAvatarSize, string> = {
  xs: "h-2.5 w-2.5",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

interface ClientAvatarProps {
  name?: string | null;
  /** Logo del cliente si el dominio ya lo tiene resuelto. */
  logoUrl?: string | null;
  size?: ClientAvatarSize;
  className?: string;
}

function ClientAvatarImpl({ name, logoUrl, size = "sm", className }: ClientAvatarProps) {
  const initials = entityInitials(name ?? "");

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold uppercase text-muted-foreground",
        SIZES[size],
        className,
      )}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : initials ? (
        <span className="leading-none">{initials}</span>
      ) : (
        <Building2 className={ICON_SIZES[size]} />
      )}
    </span>
  );
}

export const ClientAvatar = memo(ClientAvatarImpl);
