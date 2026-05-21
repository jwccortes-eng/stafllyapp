import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatPhoneUS,
  tenDigitUS,
  validatePhoneUS,
} from "@/lib/phone-format";

export interface SmartPhoneInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> {
  /** Current value (any format — will be displayed as `(###) ###-####`). */
  value: string | null | undefined;
  /**
   * Called on every change.
   * - `digits` is the 10-digit US local number (or whatever was typed, if <10).
   * - `display` is the formatted preview.
   * The parent decides what to persist; we recommend storing `digits`.
   */
  onChange: (digits: string, display: string) => void;
  /** Optional invalid styling when blurred with invalid value. */
  showValidation?: boolean;
}

/**
 * SmartPhoneInput — premium, intelligent US phone input.
 *
 * - Live-formats to `(###) ###-####` as the user types.
 * - Accepts any input: digits, dashes, parens, spaces, +1, leading 1.
 * - Emits the raw 10-digit string upward so storage stays clean and
 *   compatible with the existing `normalizePhone()` lookup pipeline.
 * - Does NOT change any DB storage or SMS pipeline by itself.
 */
export const SmartPhoneInput = React.forwardRef<HTMLInputElement, SmartPhoneInputProps>(
  ({ value, onChange, className, showValidation, onBlur, ...rest }, ref) => {
    const [touched, setTouched] = React.useState(false);
    const display = formatPhoneUS(value ?? "");
    const digits = tenDigitUS(value ?? "");
    const invalid = showValidation && touched && digits.length > 0 && !validatePhoneUS(value ?? "");

    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(555) 123-4567"
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          const nextDigits = tenDigitUS(raw);
          onChange(nextDigits, formatPhoneUS(nextDigits));
        }}
        onBlur={(e) => {
          setTouched(true);
          onBlur?.(e);
        }}
        className={cn(invalid && "border-destructive focus-visible:ring-destructive/30", className)}
        {...rest}
      />
    );
  },
);
SmartPhoneInput.displayName = "SmartPhoneInput";
