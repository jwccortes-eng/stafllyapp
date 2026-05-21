/**
 * Gender field standard for StaflyCore/StaflyApps.
 *
 * Internal stable values: female | male | non_binary | prefer_not_to_say | other
 * Visible labels: Spanish (Mujer, Hombre, No binario, Prefiero no decir, Otro).
 *
 * Gender is OPTIONAL. It is NEVER used for shift assignment logic.
 * Legacy/unknown values are preserved and surfaced as "Importado: <value>"
 * in the legacy section — never overwritten silently.
 */

export type GenderValue =
  | "female"
  | "male"
  | "non_binary"
  | "prefer_not_to_say"
  | "other";

export interface GenderOption {
  value: GenderValue;
  label: string; // Spanish UI label
}

export const GENDER_OPTIONS: GenderOption[] = [
  { value: "female", label: "Mujer" },
  { value: "male", label: "Hombre" },
  { value: "non_binary", label: "No binario" },
  { value: "prefer_not_to_say", label: "Prefiero no decir" },
  { value: "other", label: "Otro" },
];

const LEGACY_MAP: Record<string, GenderValue> = {
  f: "female",
  female: "female",
  femenino: "female",
  mujer: "female",
  m: "male",
  male: "male",
  masculino: "male",
  hombre: "male",
  nb: "non_binary",
  "non-binary": "non_binary",
  non_binary: "non_binary",
  "no binario": "non_binary",
  no_binario: "non_binary",
  prefer_not_to_say: "prefer_not_to_say",
  "prefer-not-to-say": "prefer_not_to_say",
  "prefiero no decir": "prefer_not_to_say",
  other: "other",
  otro: "other",
};

/**
 * Map any legacy/imported value to a canonical GenderValue, or null if unrecognized.
 * Never throws; never mutates input.
 */
export function normalizeGender(raw: string | null | undefined): GenderValue | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  return LEGACY_MAP[key] ?? null;
}

/**
 * Friendly Spanish label for display.
 * - null/empty → "Sin definir"
 * - canonical or known legacy → Spanish label
 * - unknown legacy → "Importado: <value>" so we never lose information
 */
export function formatGenderLabel(raw: string | null | undefined): string {
  if (!raw) return "Sin definir";
  const canonical = normalizeGender(raw);
  if (canonical) {
    return GENDER_OPTIONS.find((o) => o.value === canonical)?.label ?? "Sin definir";
  }
  return `Importado: ${String(raw)}`;
}

/** Returns true if the stored value is one of our canonical values. */
export function isCanonicalGender(raw: string | null | undefined): raw is GenderValue {
  if (!raw) return false;
  return GENDER_OPTIONS.some((o) => o.value === raw);
}
