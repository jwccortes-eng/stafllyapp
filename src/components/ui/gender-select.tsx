import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GENDER_OPTIONS, normalizeGender, type GenderValue } from "@/lib/gender";
import { cn } from "@/lib/utils";

export interface GenderSelectProps {
  /** Raw stored value — canonical or legacy. */
  value: string | null | undefined;
  /** Called with the canonical GenderValue, or "" to clear. */
  onChange: (value: GenderValue | "") => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * GenderSelect — standardized optional gender picker.
 *
 * - Stores canonical values (`female | male | non_binary | prefer_not_to_say | other`).
 * - Maps legacy stored values to the closest canonical entry for display,
 *   but does NOT auto-save the normalization — the parent decides when to write.
 * - Includes a "Sin definir" clear option so admins can leave it blank.
 */
export function GenderSelect({
  value,
  onChange,
  disabled,
  className,
  placeholder = "Sin definir",
}: GenderSelectProps) {
  const canonical = normalizeGender(value);
  const current = canonical ?? "";

  return (
    <Select
      value={current || undefined}
      onValueChange={(v) => onChange((v === "__none__" ? "" : (v as GenderValue)))}
      disabled={disabled}
    >
      <SelectTrigger className={cn("h-9", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Sin definir</SelectItem>
        {GENDER_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
