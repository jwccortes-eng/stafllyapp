/**
 * Edge helper — Sprint S7-A scaffolding (read-only).
 *
 * getPinAuthMode(companyId) reads public.company_settings row
 * key='security.pin_auth_mode'. Falls back to "legacy" on any error,
 * missing row, or invalid value.
 *
 * NOT wired into employee-auth, kiosk-clock, or front-desk-checkin.
 * Future Sprint S7-B will adopt this in a bridge code path only when
 * the resolved mode != "legacy".
 *
 * Never logs PIN, password, hash, or company secrets.
 */

export type PinAuthMode = "legacy" | "dual" | "hash_reader" | "hash_only";

export const PIN_AUTH_MODE_DEFAULT: PinAuthMode = "legacy";
export const SECURITY_PIN_AUTH_MODE_KEY = "security.pin_auth_mode";

function coerceMode(raw: unknown): PinAuthMode {
  if (raw && typeof raw === "object" && raw !== null && "mode" in (raw as any)) {
    const m = (raw as any).mode;
    if (m === "legacy" || m === "dual" || m === "hash_reader" || m === "hash_only") return m;
  }
  if (raw === "legacy" || raw === "dual" || raw === "hash_reader" || raw === "hash_only") {
    return raw;
  }
  return PIN_AUTH_MODE_DEFAULT;
}

// Minimal client shape — accepts a supabase-js admin client without importing it here,
// so this helper has zero new dependencies for callers.
interface MinimalClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: any; error: any }>;
        };
      };
    };
  };
}

export async function getPinAuthMode(
  client: MinimalClient,
  companyId: string | null | undefined
): Promise<PinAuthMode> {
  if (!companyId) return PIN_AUTH_MODE_DEFAULT;
  try {
    const { data, error } = await client
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", SECURITY_PIN_AUTH_MODE_KEY)
      .maybeSingle();
    if (error) return PIN_AUTH_MODE_DEFAULT;
    return coerceMode(data?.value);
  } catch {
    return PIN_AUTH_MODE_DEFAULT;
  }
}
