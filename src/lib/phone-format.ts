/**
 * Phone formatting standard for StaflyCore/StaflyApps.
 *
 * UI displays US format: (###) ###-####
 * Internal storage stays whatever each table already uses (we do NOT migrate).
 * E.164 helper is available for SMS/notification integrations that need it.
 *
 * Re-exports the legacy `normalizePhone` / `getPhoneLookupVariants` helpers
 * unchanged so existing auth/login callers keep working byte-for-byte.
 */
import { normalizePhone, getPhoneLookupVariants } from "./phone";

export { normalizePhone, getPhoneLookupVariants };

/** Strip everything that isn't a digit. Returns "" for null/undefined. */
export function digitsOnly(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "");
}

/** 10-digit US local number. Strips leading country code "1". */
export function tenDigitUS(raw: string | null | undefined): string {
  let d = digitsOnly(raw);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
}

/**
 * Display a phone as `(347) 765-5057`.
 * - Accepts E.164, 11-digit-with-leading-1, 10-digit, or messy input.
 * - Returns "" for empty.
 * - For non-US / >10 digits with no leading 1, returns digits with a "+" prefix as best-effort.
 * - For partial input (<10 digits), returns the input cleaned with whatever
 *   formatting fits — never throws.
 */
export function formatPhoneUS(raw: string | null | undefined): string {
  if (!raw) return "";
  const all = digitsOnly(raw);
  if (!all) return "";

  // US: 10 digits or 11 digits leading with 1
  const us = tenDigitUS(raw);
  if (us.length === 10) {
    return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
  }
  // Partial typing — format progressively without crashing
  if (us.length > 0 && us.length < 10) {
    if (us.length <= 3) return `(${us}`;
    if (us.length <= 6) return `(${us.slice(0, 3)}) ${us.slice(3)}`;
    return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
  }
  // International best effort
  return `+${all}`;
}

/**
 * Convert any reasonable input into E.164 (`+1##########` for US).
 * Returns "" if it can't reach 10+ digits.
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  defaultCountry: "US" = "US",
): string {
  if (!raw) return "";
  const all = digitsOnly(raw);
  if (!all) return "";

  // Already E.164-ish with +
  if (String(raw).trim().startsWith("+")) {
    return `+${all}`;
  }

  if (defaultCountry === "US") {
    const us = tenDigitUS(raw);
    if (us.length === 10) return `+1${us}`;
    if (all.length >= 11) return `+${all}`;
    return "";
  }
  return `+${all}`;
}

/** True when the value is a valid US 10-digit phone (after stripping +1 / formatting). */
export function validatePhoneUS(raw: string | null | undefined): boolean {
  const us = tenDigitUS(raw);
  if (us.length !== 10) return false;
  // Area code can't start with 0 or 1
  if (us[0] === "0" || us[0] === "1") return false;
  // Exchange code can't start with 0 or 1
  if (us[3] === "0" || us[3] === "1") return false;
  return true;
}

/** Combined parse result useful for forms. */
export interface ParsedPhone {
  digits: string;       // 10-digit local US digits, or all digits for non-US
  e164: string;         // "+1##########" or "" if invalid
  display: string;      // "(###) ###-####" or progressive partial
  valid: boolean;       // validatePhoneUS
}

export function parsePhoneFlexible(raw: string | null | undefined): ParsedPhone {
  const us = tenDigitUS(raw);
  return {
    digits: us || digitsOnly(raw),
    e164: normalizePhoneE164(raw),
    display: formatPhoneUS(raw),
    valid: validatePhoneUS(raw),
  };
}
