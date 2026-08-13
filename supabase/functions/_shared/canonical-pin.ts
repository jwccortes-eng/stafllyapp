/**
 * P0 — AUTH PIN CANONICALIZATION
 *
 * ÚNICA credencial de acceso de Stafly. El PIN pertenece al AUTH USER:
 * no al empleado, no a la compañía, no a la membresía, no al tenant.
 *
 * Fuente canónica:  public.auth_pin_credentials
 * Validador único:  public.internal_verify_auth_pin      (service_role)
 * Escritor único:   public.internal_set_auth_pin         (service_role)
 *                   public.set_auth_pin                  (sesión de usuario)
 *
 * PROHIBIDO en cualquier superficie nueva:
 *   - leer/comparar employees.access_pin o employees.access_pin_hash
 *   - leer/comparar profiles.switch_pin
 *   - usar auth_rate_limits como puerta de bloqueo
 */

export type CanonicalIdentity = {
  phone: string | null;
  userId: string | null;
  hasCredential: boolean;
  lockedUntil: string | null;
};

export type CanonicalPinResult = {
  ok: boolean;
  reason: "ok" | "invalid_pin" | "locked" | "no_credential" | "invalid_input" | "error";
  lockedUntil: string | null;
  failedAttempts: number | null;
};

/** Normalización canónica de teléfono (misma regla que normalize_auth_phone en la base). */
export function normalizeCanonicalPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  while (d.length > 10 && (d.startsWith("0") || d.startsWith("1"))) d = d.slice(1);
  return d || null;
}

/** Teléfono → Auth User canónico (una identidad por teléfono). */
export async function resolveCanonicalIdentity(
  adminClient: any,
  phone: string | null | undefined,
): Promise<CanonicalIdentity> {
  const empty: CanonicalIdentity = {
    phone: normalizeCanonicalPhone(phone),
    userId: null,
    hasCredential: false,
    lockedUntil: null,
  };
  try {
    const { data, error } = await adminClient.rpc("internal_resolve_auth_identity", {
      _phone: phone ?? "",
    });
    if (error || !data) return empty;
    return {
      phone: (data as any).phone ?? empty.phone,
      userId: (data as any).user_id ?? null,
      hasCredential: (data as any).has_credential === true,
      lockedUntil: (data as any).locked_until ?? null,
    };
  } catch {
    return empty;
  }
}

/** ÚNICA validación de PIN de toda la plataforma. Incluye lockout canónico. */
export async function verifyCanonicalPin(
  adminClient: any,
  userId: string | null | undefined,
  pin: string,
): Promise<CanonicalPinResult> {
  if (!userId) {
    return { ok: false, reason: "no_credential", lockedUntil: null, failedAttempts: null };
  }
  try {
    const { data, error } = await adminClient.rpc("internal_verify_auth_pin", {
      _user_id: userId,
      _pin: pin,
    });
    if (error || !data) {
      return { ok: false, reason: "error", lockedUntil: null, failedAttempts: null };
    }
    const d = data as any;
    return {
      ok: d.ok === true,
      reason: d.ok === true ? "ok" : (d.reason ?? "invalid_pin"),
      lockedUntil: d.locked_until ?? null,
      failedAttempts: typeof d.failed_attempts === "number" ? d.failed_attempts : null,
    };
  } catch {
    return { ok: false, reason: "error", lockedUntil: null, failedAttempts: null };
  }
}

/** ÚNICA escritura de PIN desde backend. Limpia intentos, lockout y credenciales legacy. */
export async function setCanonicalPin(
  adminClient: any,
  userId: string,
  pin: string,
  reason: string,
  actor?: string | null,
): Promise<boolean> {
  const { error } = await adminClient.rpc("internal_set_auth_pin", {
    _user_id: userId,
    _pin: pin,
    _reason: reason,
    _actor: actor ?? null,
  });
  if (error) {
    console.error("[canonical-pin] set failed:", error.message);
    return false;
  }
  return true;
}

/** Mensaje único de bloqueo (español, tono operativo). */
export function lockoutMessage(lockedUntil: string | null): string {
  if (!lockedUntil) return "Demasiados intentos. Intenta de nuevo en unos minutos.";
  const mins = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000));
  return `Acceso bloqueado por intentos fallidos. Intenta de nuevo en ${mins} minuto${mins === 1 ? "" : "s"}.`;
}
