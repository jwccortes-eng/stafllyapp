/**
 * FASE 1 — COMPANY APPROVAL AND ACCESS STATE.
 *
 * Modelo puro (sin I/O) que separa tres conceptos que Stafly venía colapsando
 * en `companies.is_active`:
 *
 *  - APPROVAL STATE  — ¿la empresa fue admitida por una persona?
 *  - COMMERCIAL STATE— ¿cuál es su condición comercial? (sin Stripe todavía)
 *  - ACCESS STATE    — ¿qué puede hacer hoy dentro del producto?
 *
 * Regla dura: la suspensión NUNCA bloquea obligaciones legales ni el acceso a
 * los datos propios (payroll histórico, fichajes, documentos, facturas,
 * exportación, método de pago, soporte).
 */

export const APPROVAL_STATES = ["draft", "needs_review", "approved", "rejected"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const ACCESS_STATES = ["active", "grace", "restricted", "suspended", "cancelled"] as const;
export type AccessState = (typeof ACCESS_STATES)[number];

export const COMMERCIAL_STATES = [
  "manual",
  "trial",
  "active",
  "past_due",
  "agreement",
  "cancelled",
] as const;
export type CommercialState = (typeof COMMERCIAL_STATES)[number];

export const APPROVAL_LABEL: Record<ApprovalState, string> = {
  draft: "Borrador",
  needs_review: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
};

export const ACCESS_LABEL: Record<AccessState, string> = {
  active: "Acceso completo",
  grace: "Periodo de gracia",
  restricted: "Acceso restringido",
  suspended: "Suspendida",
  cancelled: "Cancelada",
};

export const COMMERCIAL_LABEL: Record<CommercialState, string> = {
  manual: "Manual",
  trial: "Prueba",
  active: "Comercial activa",
  past_due: "Pago vencido",
  agreement: "Acuerdo",
  cancelled: "Cancelada",
};

export const ACCESS_DESCRIPTION: Record<AccessState, string> = {
  active: "Operación completa.",
  grace: "Operación completa con avisos de regularización.",
  restricted:
    "No puede crear operaciones nuevas sensibles. Conserva lectura, payroll histórico, documentos y exportaciones.",
  suspended:
    "Acceso mínimo: pagar, exportar datos, consultar historial y contactar soporte.",
  cancelled:
    "Sin operación nueva. Los datos se preservan según la política de retención.",
};

/**
 * CAPACIDADES — vocabulario único de lo que una empresa puede hacer.
 * `create_*` = operación nueva; `read_*` / `export_*` = obligación legal o
 * acceso a datos propios, nunca bloqueable.
 */
export const CAPABILITIES = [
  // Operación nueva (bloqueable)
  "create_shift",
  "assign_worker",
  "clock_in",
  "create_employee",
  "run_payroll",
  "issue_invoice",
  "send_communication",
  // Datos propios y obligaciones (nunca bloqueables)
  "read_operations",
  "read_payroll_history",
  "read_time_entries",
  "read_documents",
  "read_invoices",
  "export_data",
  "update_payment_method",
  "contact_support",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Capacidades que ningún estado de acceso puede retirar. */
export const NEVER_BLOCKED: readonly Capability[] = [
  "read_operations",
  "read_payroll_history",
  "read_time_entries",
  "read_documents",
  "read_invoices",
  "export_data",
  "update_payment_method",
  "contact_support",
];

const SENSITIVE_NEW_OPERATIONS: readonly Capability[] = [
  "create_shift",
  "assign_worker",
  "create_employee",
  "run_payroll",
  "issue_invoice",
  "send_communication",
];

function matrixFor(state: AccessState): Record<Capability, boolean> {
  const allow = (list: readonly Capability[]) =>
    Object.fromEntries(CAPABILITIES.map(c => [c, list.includes(c)])) as Record<Capability, boolean>;

  switch (state) {
    case "active":
    case "grace":
      return allow(CAPABILITIES);
    case "restricted":
      // Lectura completa + fichaje en curso; sin operaciones nuevas sensibles.
      return allow([...NEVER_BLOCKED, "clock_in"]);
    case "suspended":
    case "cancelled":
      return allow(NEVER_BLOCKED);
  }
}

/** Matriz de entitlements por estado de acceso. */
export const ACCESS_MATRIX: Record<AccessState, Record<Capability, boolean>> = {
  active: matrixFor("active"),
  grace: matrixFor("grace"),
  restricted: matrixFor("restricted"),
  suspended: matrixFor("suspended"),
  cancelled: matrixFor("cancelled"),
};

export interface CompanyLifecycle {
  approval_state: ApprovalState;
  access_state: AccessState;
  commercial_state: CommercialState;
  is_active: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  access_state_reason?: string | null;
  version?: number | null;
}

export function normalizeLifecycle(row: Record<string, unknown> | null | undefined): CompanyLifecycle {
  const approval = (APPROVAL_STATES as readonly string[]).includes(String(row?.approval_state))
    ? (row!.approval_state as ApprovalState)
    : "draft";
  const access = (ACCESS_STATES as readonly string[]).includes(String(row?.access_state))
    ? (row!.access_state as AccessState)
    : "restricted";
  const commercial = (COMMERCIAL_STATES as readonly string[]).includes(String(row?.commercial_state))
    ? (row!.commercial_state as CommercialState)
    : "manual";
  return {
    approval_state: approval,
    access_state: access,
    commercial_state: commercial,
    is_active: row?.is_active === true,
    approved_by: (row?.approved_by as string) ?? null,
    approved_at: (row?.approved_at as string) ?? null,
    rejection_reason: (row?.rejection_reason as string) ?? null,
    access_state_reason: (row?.access_state_reason as string) ?? null,
    version: typeof row?.version === "number" ? (row.version as number) : null,
  };
}

/**
 * ¿Puede la empresa ejecutar esta capacidad hoy?
 * Fail-closed: una empresa no aprobada sólo conserva las capacidades nunca bloqueables.
 */
export function canDo(lifecycle: CompanyLifecycle, capability: Capability): boolean {
  if (NEVER_BLOCKED.includes(capability)) return true;
  if (lifecycle.approval_state !== "approved") return false;
  return ACCESS_MATRIX[lifecycle.access_state][capability] === true;
}

/** Motivo legible cuando una capacidad está bloqueada (para avisos de UI). */
export function blockedReason(lifecycle: CompanyLifecycle, capability: Capability): string | null {
  if (canDo(lifecycle, capability)) return null;
  if (lifecycle.approval_state !== "approved") {
    return lifecycle.approval_state === "rejected"
      ? `Solicitud rechazada: ${lifecycle.rejection_reason ?? "sin motivo registrado"}`
      : "La empresa está pendiente de revisión humana.";
  }
  return ACCESS_DESCRIPTION[lifecycle.access_state];
}

/** ¿Debe mostrarse un aviso persistente aunque la operación continúe? */
export function accessWarning(lifecycle: CompanyLifecycle): string | null {
  if (lifecycle.approval_state === "needs_review") return "Empresa pendiente de aprobación.";
  if (lifecycle.approval_state === "rejected") return "Solicitud de empresa rechazada.";
  switch (lifecycle.access_state) {
    case "grace":
      return "Periodo de gracia: regulariza la situación comercial para conservar el acceso completo.";
    case "restricted":
      return "Acceso restringido: no se pueden crear operaciones nuevas.";
    case "suspended":
      return "Empresa suspendida: acceso mínimo a datos, pagos y soporte.";
    case "cancelled":
      return "Empresa cancelada: sólo consulta y exportación de datos.";
    default:
      return null;
  }
}

/** Capacidades sensibles bloqueadas en el estado actual (para explicar el impacto). */
export function blockedSensitiveOperations(lifecycle: CompanyLifecycle): Capability[] {
  return SENSITIVE_NEW_OPERATIONS.filter(c => !canDo(lifecycle, c));
}
