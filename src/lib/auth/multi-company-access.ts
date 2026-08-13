/**
 * P0 — MULTI-COMPANY AUTH ACCESS TRUTH (frontend entrypoint).
 *
 * Reexporta el resolver canónico compartido con la función de autenticación.
 * No duplicar la lógica: un solo módulo decide identidad vs acceso.
 */
export {
  resolveMultiCompanyAccess,
  accessDeniedMessage,
  type IdentityEmployeeRecord,
  type MultiCompanyAccess,
  type MultiCompanyOutcome,
} from "../../../supabase/functions/_shared/multi-company-access";
