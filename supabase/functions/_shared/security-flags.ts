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

export type PinAuthMode =
  | "legacy"
  | "dual"
  | "hash_reader"
  | "hash_only_ready" // S7-K capability — recognized but only demo-eligible
  | "hash_only";

export const PIN_AUTH_MODE_DEFAULT: PinAuthMode = "legacy";
export const SECURITY_PIN_AUTH_MODE_KEY = "security.pin_auth_mode";

const ALL_MODES: ReadonlyArray<PinAuthMode> = [
  "legacy",
  "dual",
  "hash_reader",
  "hash_only_ready",
  "hash_only",
];

function isMode(value: unknown): value is PinAuthMode {
  return typeof value === "string" && (ALL_MODES as readonly string[]).includes(value);
}

function coerceMode(raw: unknown): PinAuthMode {
  if (raw && typeof raw === "object" && raw !== null && "mode" in (raw as any)) {
    const m = (raw as any).mode;
    if (isMode(m)) return m;
  }
  if (isMode(raw)) return raw;
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

/**
 * S7-B/D/E/K shared resolver — only Stafly Demo may resolve a non-legacy mode.
 * Any other tenant, missing setting, or read error is force-pinned to "legacy".
 * Currently honored values:
 *   - "dual"            → demo-only hash-first + plaintext fallback (S7-D/E/G)
 *   - "hash_only_ready" → demo-only hash-first, plaintext fallback SUPPRESSED
 *                         (S7-K capability; NOT activated on any tenant)
 * "hash_reader" and "hash_only" still resolve to "legacy" (deferred).
 * Never logs PIN, hash, password, or token.
 *
 * Naming kept as `resolveDemoDualMode` for back-compat with existing callers.
 */
export const STAFLY_DEMO_COMPANY_ID = "d3500000-0000-4000-8000-000000000001";

const DEMO_HONORED_MODES: ReadonlySet<PinAuthMode> = new Set<PinAuthMode>([
  "dual",
  "hash_only_ready",
]);

export async function resolveDemoDualMode(
  client: any,
  companyId: string | null | undefined,
  context: string,
): Promise<PinAuthMode> {
  if (!companyId) return PIN_AUTH_MODE_DEFAULT;
  let raw: PinAuthMode = PIN_AUTH_MODE_DEFAULT;
  try {
    raw = await getPinAuthMode(client, companyId);
  } catch {
    raw = PIN_AUTH_MODE_DEFAULT;
  }
  let effective: PinAuthMode = PIN_AUTH_MODE_DEFAULT;
  if (
    companyId === STAFLY_DEMO_COMPANY_ID &&
    DEMO_HONORED_MODES.has(raw)
  ) {
    effective = raw;
  }
  try {
    console.info("[pin-auth-mode]", {
      ctx: context,
      company_id: companyId,
      requested: raw,
      effective,
      demo: companyId === STAFLY_DEMO_COMPANY_ID,
    });
  } catch { /* logging must never throw */ }
  return effective;
}

