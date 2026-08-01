/**
 * OX-2 — StatusBadge canónico.
 *
 * Único componente autorizado para representar estados en Stafly.
 * El color lo decide la familia semántica del registro, nunca el archivo llamador.
 *
 * Accesibilidad: siempre texto visible + icono (no depende solo del color),
 * `role="status"` y tamaño táctil de 44px cuando es interactivo.
 */
import * as React from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  XCircle,
  Info,
  Loader2,
  FileText,
  MinusCircle,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_REGISTRY,
  FAMILY_CLASSES,
  FAMILY_DOT_CLASSES,
  resolveStatusKey,
  type StatusIconName,
  type StatusKey,
  type StatusFamily,
} from "@/lib/status/status-registry";

const ICONS: Record<StatusIconName, React.ComponentType<{ className?: string }>> = {
  check: CheckCircle2,
  clock: Clock,
  alert: AlertTriangle,
  ban: Ban,
  x: XCircle,
  info: Info,
  loader: Loader2,
  file: FileText,
  minus: MinusCircle,
  shield: ShieldCheck,
};

const SIZES = {
  sm: "text-[11px] px-2 py-0.5 gap-1",
  md: "text-[12px] px-2.5 py-1 gap-1.5",
  lg: "text-[13px] px-3 py-1.5 gap-1.5",
} as const;

const ICON_SIZES = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
} as const;

export interface StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onClick"> {
  /** Clave canónica o alias (ej. "approved", "pending", "no_show"). */
  status: StatusKey | (string & {});
  /** Sobrescribe la etiqueta por defecto (el color sigue siendo el de la familia). */
  label?: string;
  size?: keyof typeof SIZES;
  /** `icon` (por defecto), `dot` o `none`. */
  indicator?: "icon" | "dot" | "none";
  /** Anima el icono en estados de progreso. */
  spin?: boolean;
  onClick?: () => void;
}

export function StatusBadge({
  status,
  label,
  size = "sm",
  indicator = "icon",
  spin,
  className,
  onClick,
  ...props
}: StatusBadgeProps) {
  const key = resolveStatusKey(status as string);
  const def = STATUS_REGISTRY[key];
  const Icon = ICONS[def.icon];
  const text = label ?? def.label;
  const interactive = typeof onClick === "function";

  const content = (
    <>
      {indicator === "icon" && (
        <Icon
          aria-hidden="true"
          className={cn(
            ICON_SIZES[size],
            "shrink-0",
            (spin ?? def.family === "progress") && def.icon === "loader" && "animate-spin",
          )}
        />
      )}
      {indicator === "dot" && (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", FAMILY_DOT_CLASSES[def.family])}
        />
      )}
      <span className="truncate">{text}</span>
    </>
  );

  const base = cn(
    "inline-flex items-center rounded-full border font-semibold leading-none whitespace-nowrap",
    FAMILY_CLASSES[def.family],
    SIZES[size],
    className,
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={text}
        className={cn(
          base,
          "min-h-11 sm:min-h-9 transition-colors hover:brightness-95 dark:hover:brightness-125",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );
  }

  return (
    <span role="status" className={base} {...props}>
      {content}
    </span>
  );
}

export type { StatusKey, StatusFamily };
export { STATUS_REGISTRY };
