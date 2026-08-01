import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { OperationalScreenHeader } from "@/components/stafly-ui/OperationalScreenHeader";

/**
 * OX-8 — ONE STAFLY.
 *
 * PageHeader ya no es un componente con cinco variantes visuales: es un
 * adaptador delgado sobre `OperationalScreenHeader`, la única cabecera del
 * producto. Las props `variant`, `icon`, `eyebrow` y `badge` se aceptan para
 * no romper las ~40 pantallas que las pasan, pero ya no generan lenguajes
 * visuales distintos: la empresa anfitriona es la identidad, el título es
 * el lugar y el subtítulo es lo que está pasando.
 */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** @deprecated OX-8: ya no produce variaciones visuales. */
  variant?: "1" | "2" | "3" | "4" | "5";
  /** @deprecated OX-8: el estado vive en el contenido, no en la cabecera. */
  badge?: string;
  /** @deprecated OX-8: la empresa sustituye al eyebrow de módulo. */
  eyebrow?: string;
  /** Slot para la acción protagonista. */
  rightSlot?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  rightSlot,
  className,
}: PageHeaderProps) {
  return (
    <OperationalScreenHeader
      title={title}
      context={subtitle}
      action={rightSlot}
      className={cn("mb-4 md:mb-5", className)}
    />
  );
}
