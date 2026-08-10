export type ShiftPublicationStatus = "draft" | "published" | "cancelled" | "archived";

export interface Shift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  /** Lifecycle separated from operational status. Drafts never notify
   *  workers, never feed payroll/attendance, never appear on the portal. */
  publication_status?: ShiftPublicationStatus;
  slots: number | null;
  client_id: string | null;
  location_id: string | null;
  notes: string | null;
  claimable: boolean;
  /** @deprecated código legado (texto libre, no único). Usa `shift_ref`. */
  shift_code?: string | null;
  /** Consecutivo operativo dentro de la empresa (único por company_id). */
  shift_number?: number | null;
  /** Número visible por empresa, p. ej. `QK-001573`. */
  shift_ref?: string | null;
  // ── Optional traceability fields (read-only).
  // Present in scheduled_shifts schema. Loaded by views that need lineage
  // (e.g. MobileShiftOperationsSheet). Safe to omit elsewhere.
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
  published_by?: string | null;
  created_by?: string | null;
  import_batch_id?: string | null;
  reconciliation_hash?: string | null;
}

/**
 * Re-exported from the canonical guards module so call-sites that already
 * import { isDraftShift } from "@/components/shifts/types" keep working.
 * The single source of truth lives in `src/lib/shifts/shift-guards.ts`.
 */
export { isDraftShift } from "@/lib/shifts/shift-guards";

import { clientAccentColor, clientAccentSoft } from "@/lib/clients/client-accent";

export function formatShiftCode(code: string | null | undefined): string {
  if (!code) return "—";
  return code.padStart(4, "0");
}

export interface Assignment {
  id: string;
  shift_id: string;
  employee_id: string;
  status: string;
  /** Optional link to a typed role slot (Waiter, Captain, etc.) when the
   *  shift was created from a service request. Null for legacy/manual shifts. */
  role_slot_id?: string | null;
}

export interface SelectOption { id: string; name: string; }
/** Cliente para superficies de planificación: identidad + estado, sin datos administrativos. */
export interface ClientOption extends SelectOption {
  client_code?: string | null;
  status?: string | null;
}

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  gender?: string | null;
  phone_number?: string | null;
  email?: string | null;
  employee_role?: string | null;
  groups?: string | null;
  user_id?: string | null;
  /** Phase B: PIN existence resolved via employee_has_access_pin RPC. */
  has_access_pin?: boolean | null;
  /** @deprecated raw value not exposed anymore; kept optional for type compatibility. */
  access_pin?: string | null;
  has_car?: string | null;
  /** Authoritative driver flag — boolean column on employees. */
  can_drive?: boolean | null;
  is_active?: boolean;
  /** Origen del alta (p. ej. "Pending approval"). Usado por el contrato canónico de asignables. */
  added_via?: string | null;
  /** Stable per-company identifier shown in the worker selector. */
  employer_identification?: string | null;
  /** Profile readiness — drives "Incomplete profile" badge in the selector. */
  profile_status?: "incomplete" | "pending_documents" | "ready" | "active" | null;
  /** Onboarding lifecycle (text in DB). */
  onboarding_status?: string | null;
  /** Classification used to keep placeholders/system/external out of payroll/portal/picker. */
  person_type_guess?: string | null;
  /** Explicit boolean flag: false ⇒ unsafe for payroll/scheduling (placeholder-like). */
  payroll_safe?: boolean | null;
  // ── Phase 1 identity columns (read-only in Phase 2A). ────────────────────
  /** real_employee | emergency_worker | legacy_placeholder | imported_placeholder */
  worker_type?: string | null;
  /** verified | pending_identity | unresolved | rejected | merged | legacy_placeholder */
  identity_status?: string | null;
  requires_identity_resolution?: boolean | null;
  /** UI hint only — does NOT change payroll math today. */
  payroll_approval_blocked?: boolean | null;
  original_placeholder_name?: string | null;
  identity_source?: string | null;
  identity_notes?: string | null;
}

/**
 * Single source of truth for "can this employee drive a shift ride".
 * Reads `can_drive` (boolean) first; falls back to legacy `has_car` text values
 * so we don't break older records that haven't been migrated yet.
 */
export function isEmployeeDriver(e: Pick<Employee, "can_drive" | "has_car">): boolean {
  // Legacy text is the source of truth when present — it was filled by the
  // employee at onboarding (e.g. "Yes, I have a Car", "Sí tengo carro",
  // "No, I dont have a car"). The boolean `can_drive` column is mostly
  // unmigrated (defaults to false in production), so it can only be trusted
  // when it's TRUE or when legacy text is missing.
  const hc = (e.has_car ?? "").toLowerCase().trim();
  if (hc) {
    // Negative phrases first to avoid false positives like "no, I have...".
    if (/\b(no|don'?t|sin|nunca|nope)\b/.test(hc)) return false;
    return /\b(yes|sí|si|true|1|tengo|have|have a car|carro)\b/.test(hc);
  }
  // No legacy text → fall back to the boolean column.
  return e.can_drive === true;
}

export type ViewMode = "day" | "week" | "month" | "employee" | "client";

/**
 * P1 — CLIENT VISUAL IDENTITY SYSTEM
 * La identidad cromática del turno NO existe: se hereda del Cliente.
 * Única fuente: `clientAccentColor(clientId)` (hash determinista de client_id).
 * Esta función se mantiene por compatibilidad de call-sites; el segundo
 * argumento (orden de la lista) ya NO influye en el color.
 */
export function getClientColor(clientId: string | null, _clientIds?: string[]) {
  const accent = clientAccentColor(clientId);
  const accentSoft = clientAccentSoft(clientId);
  return {
    accent,
    accentSoft,
    // Clases neutras: el color va inline desde el token del Cliente.
    bg: "bg-muted/40",
    border: "border-l-border",
    text: "text-foreground",
    dot: "bg-muted-foreground/30",
    borderStyle: accent ? { borderLeftColor: accent } : undefined,
    bgStyle: accentSoft ? { backgroundColor: accentSoft } : undefined,
    dotStyle: accent ? { backgroundColor: accent } : undefined,
  };
}
