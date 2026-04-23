/**
 * usePhonePadInput — single source of truth for phone numeric input on
 * Front Desk / Kiosk-style flows.
 *
 * Hybrid input: works the same for the on-screen NumericKeypad (touch) and
 * for physical keyboards (desktop). The visual pad and the physical keyboard
 * mutate state through the same primitives below.
 *
 * Physical keyboard support (when `enabled`):
 *  - Digits 0-9 and Numpad0-Numpad9 append a digit
 *  - Backspace / Delete remove the last digit
 *  - Enter triggers `onSubmit` if `canSubmit` is true
 *  - Escape triggers `onCancel`
 *  - Cmd/Ctrl+V paste sanitizes to digits and respects maxLength
 *
 * Letters and symbols are ignored. Modifier-only keys are ignored.
 */
import { useCallback, useEffect } from "react";

interface Options {
  value: string;
  setValue: (next: string) => void;
  /** Hard cap on the stored digit count. Default: 15 (E.164). */
  maxLength?: number;
  /** Minimum length for `canSubmit`. Default: 7. */
  minSubmitLength?: number;
  /** Toggle the global keyboard listener. Default: true. */
  enabled?: boolean;
  /** Called on Enter when canSubmit is true. */
  onSubmit?: () => void;
  /** Called on Escape. */
  onCancel?: () => void;
}

export function usePhonePadInput({
  value,
  setValue,
  maxLength = 15,
  minSubmitLength = 7,
  enabled = true,
  onSubmit,
  onCancel,
}: Options) {
  const appendDigit = useCallback(
    (digit: string) => {
      if (!/^\d$/.test(digit)) return;
      setValue(value.length >= maxLength ? value : value + digit);
    },
    [value, setValue, maxLength],
  );

  const backspace = useCallback(() => {
    setValue(value.slice(0, -1));
  }, [value, setValue]);

  const clear = useCallback(() => {
    setValue("");
  }, [setValue]);

  const pasteSanitized = useCallback(
    (raw: string) => {
      const digits = raw.replace(/\D/g, "").slice(0, maxLength);
      if (digits) setValue(digits);
    },
    [setValue, maxLength],
  );

  const canSubmit = value.length >= minSubmitLength;

  useEffect(() => {
    if (!enabled) return;

    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;

      // Digits — top row + numpad
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        appendDigit(e.key);
        return;
      }

      switch (e.key) {
        case "Backspace":
        case "Delete":
          e.preventDefault();
          backspace();
          return;
        case "Enter":
          if (canSubmit && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
          return;
        case "Escape":
          if (onCancel) {
            e.preventDefault();
            onCancel();
          }
          return;
        default:
          // Ignore everything else (letters, symbols, function keys)
          return;
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text) return;
      e.preventDefault();
      pasteSanitized(text);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [enabled, appendDigit, backspace, canSubmit, onSubmit, onCancel, pasteSanitized]);

  return { appendDigit, backspace, clear, pasteSanitized, canSubmit };
}
