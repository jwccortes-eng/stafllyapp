/**
 * P0 — MULTI-COMPANY AUTH ACCESS TRUTH
 *
 * Fuente única de verdad que separa tres dimensiones que antes estaban
 * fusionadas en una sola consulta (`employees.is_active = true`):
 *
 *   1. AUTH        — quién eres (identidad por teléfono / auth user).
 *   2. MEMBERSHIP  — a qué compañías puedes entrar (fichas activas).
 *   3. EMPLOYEE    — tu estado interno dentro de cada compañía.
 *
 * Regla operativa: un estado inactivo en UNA compañía nunca puede borrar la
 * identidad global ni bloquear el acceso si existe otra compañía activa.
 *
 * Módulo puro (sin Deno, sin red, sin cliente). Se consume desde la función
 * de autenticación y desde el frontend vía `src/lib/auth/multi-company-access.ts`.
 */

export interface IdentityEmployeeRecord {
  id: string;
  company_id: string | null;
  is_active: boolean | null;
  user_id: string | null;
  access_pin?: string | null;
  access_pin_hash?: string | null;
  portal_access_enabled?: boolean | null;
  merged_into_employee_id?: string | null;
  created_at?: string | null;
}

export type MultiCompanyOutcome =
  /** No existe ninguna ficha con esa identidad: "no account linked" real. */
  | "no_identity"
  /** Existe identidad y compañías activas, pero nunca activó su PIN. */
  | "requires_activation"
  /** Existe identidad y al menos una compañía activa: puede entrar. */
  | "access_granted"
  /** Existe identidad, pero TODAS sus compañías están inactivas. */
  | "access_disabled";

export interface MultiCompanyAccess<T extends IdentityEmployeeRecord = IdentityEmployeeRecord> {
  outcome: MultiCompanyOutcome;
  /** Identidad completa (incluye fichas inactivas y fusionadas). */
  identityRecords: T[];
  /** Fichas vivas (no fusionadas) que sí habilitan operación. */
  activeRecords: T[];
  /** Fichas vivas pero desactivadas en su compañía. */
  inactiveRecords: T[];
  activeCompanyIds: string[];
  inactiveCompanyIds: string[];
  /** Auth user ya vinculado a esta identidad, si existe. */
  authUserId: string | null;
  /** Ficha contra la que se valida el PIN (preferencia: activa con PIN). */
  credentialRecord: T | null;
  /** Ficha operativa por defecto tras iniciar sesión. */
  primaryRecord: T | null;
  requiresActivation: boolean;
}

function byCreatedAt(a: IdentityEmployeeRecord, b: IdentityEmployeeRecord): number {
  return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
}

function hasCredential(r: IdentityEmployeeRecord): boolean {
  return !!r.access_pin || !!r.access_pin_hash;
}

export function resolveMultiCompanyAccess<T extends IdentityEmployeeRecord>(
  records: readonly T[] | null | undefined,
): MultiCompanyAccess<T> {
  const identityRecords = [...(records ?? [])].sort(byCreatedAt);

  // Las fichas fusionadas (sombras) aportan identidad, nunca acceso.
  const live = identityRecords.filter((r) => !r.merged_into_employee_id);
  const activeRecords = live.filter((r) => r.is_active === true);
  const inactiveRecords = live.filter((r) => r.is_active !== true);

  const authUserId = identityRecords.find((r) => !!r.user_id)?.user_id ?? null;

  const credentialRecord =
    activeRecords.find(hasCredential) ??
    live.find(hasCredential) ??
    activeRecords[0] ??
    live[0] ??
    null;

  const primaryRecord =
    activeRecords.find((r) => !!r.user_id && hasCredential(r)) ??
    activeRecords.find(hasCredential) ??
    activeRecords[0] ??
    null;

  const uniq = (list: T[]) =>
    Array.from(new Set(list.map((r) => r.company_id).filter((id): id is string => !!id)));

  let outcome: MultiCompanyOutcome;
  if (identityRecords.length === 0) {
    outcome = "no_identity";
  } else if (activeRecords.length === 0) {
    outcome = "access_disabled";
  } else if (!activeRecords.some(hasCredential) && !live.some(hasCredential)) {
    outcome = "requires_activation";
  } else {
    outcome = "access_granted";
  }

  return {
    outcome,
    identityRecords,
    activeRecords,
    inactiveRecords,
    activeCompanyIds: uniq(activeRecords),
    inactiveCompanyIds: uniq(inactiveRecords).filter((id) => !uniq(activeRecords).includes(id)),
    authUserId,
    credentialRecord,
    primaryRecord,
    requiresActivation: outcome === "requires_activation",
  };
}

/** Copy operativo, español, sin jerga técnica. */
export function accessDeniedMessage(outcome: MultiCompanyOutcome): string | null {
  switch (outcome) {
    case "no_identity":
      return "No encontramos una cuenta con ese teléfono. Contacta a tu coordinador.";
    case "access_disabled":
      return "Tu acceso está desactivado en todas tus empresas. Contacta a tu coordinador.";
    default:
      return null;
  }
}
