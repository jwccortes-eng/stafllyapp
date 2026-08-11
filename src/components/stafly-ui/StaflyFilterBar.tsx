/**
 * StaflyFilterBar — barra de filtros canónica (chips).
 *
 * Un único contrato de filtro. En móvil hace scroll horizontal;
 * en desktop se envuelve. Mismo chip, mismo estado activo.
 */

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { STAFLY_CHIP_BASE, STAFLY_STATE, STAFLY_TONE_SOFT } from "./tokens";

export interface StaflyFilterOption {
  value: string;
  label: string;
  count?: number;
  icon?: ComponentType<{ className?: string }>;
}

export interface StaflyFilterBarProps {
  options: StaflyFilterOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** En desktop, envolver en varias líneas en lugar de hacer scroll. */
  wrap?: boolean;
  "aria-label"?: string;
}

export function StaflyFilterBar({
  options,
  value,
  onChange,
  className,
  wrap = true,
  "aria-label": ariaLabel = "Filtros",
}: StaflyFilterBarProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-2",
        wrap
          ? "overflow-x-auto scrollbar-none sm:flex-wrap sm:overflow-visible"
          : "overflow-x-auto scrollbar-none",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              STAFLY_CHIP_BASE,
              STAFLY_STATE.focus,
              "shrink-0",
              active
                ? "border-primary/30 bg-primary/10 text-primary"
                : cn(STAFLY_TONE_SOFT.neutral, "hover:bg-accent")
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {option.label}
            {typeof option.count === "number" && (
              <span className="tabular-nums opacity-70">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
