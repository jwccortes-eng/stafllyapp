/**
 * RESOLVER CANÓNICO DE IDENTIDAD DE TRABAJADOR · P0
 * -------------------------------------------------
 * ÚNICA puerta de entrada antes de crear un `employees`. Cualquier flujo que
 * pueda crear una persona (ImportWizard, CSV, alta manual, Quick Add,
 * Connecteam, extras de payroll) debe preguntar aquí primero.
 *
 * Orden de matching (de más fuerte a más débil):
 *   1. employer_identification exacto válido
 *   2. teléfono normalizado
 *   3. email normalizado (ignorando buzones corporativos compartidos)
 *   4. external / Connecteam id válido
 *   5. nombre normalizado + otra señal fuerte
 *   6. solo nombre → NUNCA crear en silencio si existe candidato
 *
 * Resultados: EXACT_MATCH · PROBABLE_MATCH · AMBIGUOUS · NOT_FOUND
 *   EXACT_MATCH  → reutilizar el employee existente
 *   PROBABLE / AMBIGUOUS → revisión humana, prohibido crear
 *   NOT_FOUND    → permitir crear
 *
 * Lectura pura. No escribe, no fusiona, no borra, no toca payroll/time_entries.
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phone";

export type IdentityMatchOutcome =
  | "EXACT_MATCH"
  | "PROBABLE_MATCH"
  | "AMBIGUOUS"
  | "NOT_FOUND";

export type IdentitySignal =
  | "employer_identification"
  | "phone"
  | "email"
  | "external_id"
  | "name_plus_signal"
  | "name_only";

export interface IdentityCandidateRecord {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  employer_identification?: string | null;
  connecteam_employee_id?: string | null;
  user_id?: string | null;
  is_active?: boolean | null;
  employee_role?: string | null;
  added_via?: string | null;
  company_id?: string | null;
  deleted_at?: string | null;
  merged_into_employee_id?: string | null;
}

export interface IdentityInput {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  employerIdentification?: string | null;
  externalId?: string | null;
}

export interface IdentityResolution {
  outcome: IdentityMatchOutcome;
  /** Employee a reutilizar. Solo se rellena en EXACT_MATCH. */
  employeeId: string | null;
  match: IdentityCandidateRecord | null;
  /** Todos los candidatos considerados (para revisión humana). */
  candidates: IdentityCandidateRecord[];
  signal: IdentitySignal | null;
  /** Verdadero solo cuando NO existe ningún candidato. */
  canCreate: boolean;
  /** Explicación operativa corta, lista para UI. */
  reason: string;
}

/** Buzones corporativos compartidos: colisión de email, no de persona. */
export const SHARED_MAILBOX_THRESHOLD = 3;

export const EMPLOYEE_IDENTITY_FIELDS =
  "id, first_name, last_name, email, phone_number, employer_identification, connecteam_employee_id, user_id, is_active, employee_role, added_via, company_id, deleted_at, merged_into_employee_id";

/* ────────────────── normalizadores ────────────────── */

export function normalizeIdentityName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIdentityEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function normalizeIdentityPhone(raw: string | null | undefined): string {
  const digits = normalizePhone(raw);
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function normalizeCode(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return "";
  // Descarta placeholders típicos de importación.
  if (["N/A", "NA", "-", "--", "0", "NONE", "NULL"].includes(v)) return "";
  return v;
}

function fullNameOf(input: IdentityInput): string {
  if (input.fullName?.trim()) return input.fullName.trim();
  return `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
}

function candidateName(c: IdentityCandidateRecord): string {
  return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
}

/* ────────────────── índice en memoria ────────────────── */

export interface EmployeeIdentityIndex {
  byCode: Map<string, IdentityCandidateRecord[]>;
  byPhone: Map<string, IdentityCandidateRecord[]>;
  byEmail: Map<string, IdentityCandidateRecord[]>;
  byExternal: Map<string, IdentityCandidateRecord[]>;
  byName: Map<string, IdentityCandidateRecord[]>;
  sharedMailboxes: Set<string>;
  size: number;
}

function push(
  map: Map<string, IdentityCandidateRecord[]>,
  key: string,
  value: IdentityCandidateRecord,
) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildEmployeeIdentityIndex(
  records: IdentityCandidateRecord[],
): EmployeeIdentityIndex {
  const index: EmployeeIdentityIndex = {
    byCode: new Map(),
    byPhone: new Map(),
    byEmail: new Map(),
    byExternal: new Map(),
    byName: new Map(),
    sharedMailboxes: new Set(),
    size: 0,
  };

  const usable = records.filter((r) => !r.deleted_at && !r.merged_into_employee_id);
  index.size = usable.length;

  for (const r of usable) {
    push(index.byCode, normalizeCode(r.employer_identification), r);
    push(index.byPhone, normalizeIdentityPhone(r.phone_number), r);
    push(index.byEmail, normalizeIdentityEmail(r.email), r);
    push(index.byExternal, normalizeCode(r.connecteam_employee_id), r);
    push(index.byName, normalizeIdentityName(candidateName(r)), r);
  }

  for (const [email, list] of index.byEmail.entries()) {
    if (list.length > SHARED_MAILBOX_THRESHOLD) index.sharedMailboxes.add(email);
  }

  return index;
}

/* ────────────────── resolución ────────────────── */

function dedupe(list: IdentityCandidateRecord[]): IdentityCandidateRecord[] {
  const seen = new Set<string>();
  const out: IdentityCandidateRecord[] = [];
  for (const c of list) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

const SIGNAL_LABEL: Record<IdentitySignal, string> = {
  employer_identification: "identificación de empleador",
  phone: "teléfono",
  email: "email",
  external_id: "ID externo (Connecteam)",
  name_plus_signal: "nombre + señal fuerte",
  name_only: "solo nombre",
};

function verdict(
  outcome: IdentityMatchOutcome,
  signal: IdentitySignal | null,
  candidates: IdentityCandidateRecord[],
  reason: string,
): IdentityResolution {
  return {
    outcome,
    employeeId: outcome === "EXACT_MATCH" ? candidates[0]?.id ?? null : null,
    match: outcome === "EXACT_MATCH" ? candidates[0] ?? null : null,
    candidates,
    signal,
    canCreate: outcome === "NOT_FOUND",
    reason,
  };
}

/**
 * Resolución pura sobre un índice ya construido. Úsalo en importaciones
 * masivas para no consultar el backend por fila.
 */
export function resolveIdentityFromIndex(
  index: EmployeeIdentityIndex,
  input: IdentityInput,
): IdentityResolution {
  const code = normalizeCode(input.employerIdentification);
  const phone = normalizeIdentityPhone(input.phone);
  const email = normalizeIdentityEmail(input.email);
  const external = normalizeCode(input.externalId);
  const name = normalizeIdentityName(fullNameOf(input));

  const strong: Array<[IdentitySignal, IdentityCandidateRecord[]]> = [
    ["employer_identification", code ? index.byCode.get(code) ?? [] : []],
    ["phone", phone ? index.byPhone.get(phone) ?? [] : []],
    [
      "email",
      email && !index.sharedMailboxes.has(email) ? index.byEmail.get(email) ?? [] : [],
    ],
    ["external_id", external ? index.byExternal.get(external) ?? [] : []],
  ];

  for (const [signal, hits] of strong) {
    const list = dedupe(hits);
    if (list.length === 1) {
      return verdict(
        "EXACT_MATCH",
        signal,
        list,
        `Coincidencia exacta por ${SIGNAL_LABEL[signal]}: se reutiliza el registro existente.`,
      );
    }
    if (list.length > 1) {
      return verdict(
        "AMBIGUOUS",
        signal,
        list,
        `${list.length} registros comparten ${SIGNAL_LABEL[signal]}. Requiere revisión humana.`,
      );
    }
  }

  const nameHits = dedupe(name ? index.byName.get(name) ?? [] : []);
  if (nameHits.length === 0) {
    return verdict(
      "NOT_FOUND",
      null,
      [],
      "Sin coincidencias de identidad: se puede crear la persona.",
    );
  }

  // Nombre + otra señal fuerte presente en el candidato (aunque el input no la traiga completa).
  const corroborated = nameHits.filter((c) => {
    if (code && normalizeCode(c.employer_identification) === code) return true;
    if (phone && normalizeIdentityPhone(c.phone_number) === phone) return true;
    if (email && normalizeIdentityEmail(c.email) === email) return true;
    if (external && normalizeCode(c.connecteam_employee_id) === external) return true;
    return false;
  });

  if (corroborated.length === 1) {
    return verdict(
      "EXACT_MATCH",
      "name_plus_signal",
      corroborated,
      "Coincidencia por nombre confirmada con una segunda señal fuerte.",
    );
  }

  if (nameHits.length === 1) {
    return verdict(
      "PROBABLE_MATCH",
      "name_only",
      nameHits,
      `Ya existe ${candidateName(nameHits[0]) || "un registro"} con el mismo nombre. No se crea automáticamente: requiere revisión humana.`,
    );
  }

  return verdict(
    "AMBIGUOUS",
    "name_only",
    nameHits,
    `${nameHits.length} registros comparten el mismo nombre. Requiere revisión humana.`,
  );
}

/**
 * Resolución contra el backend para una sola persona (alta manual, Quick Add).
 * Consulta acotada al tenant: nunca mezcla compañías.
 */
export async function resolveExistingEmployeeIdentity(
  companyId: string,
  input: IdentityInput,
): Promise<IdentityResolution> {
  if (!companyId) {
    return verdict("AMBIGUOUS", null, [], "Sin empresa activa: no se puede validar identidad.");
  }

  const code = normalizeCode(input.employerIdentification);
  const phone = normalizeIdentityPhone(input.phone);
  const email = normalizeIdentityEmail(input.email);
  const external = normalizeCode(input.externalId);
  const name = normalizeIdentityName(fullNameOf(input));

  const filters: string[] = [];
  if (code) filters.push(`employer_identification.ilike.${code}`);
  if (phone) filters.push(`phone_number.ilike.%${phone}`);
  if (email) filters.push(`email.ilike.${email}`);
  if (external) filters.push(`connecteam_employee_id.ilike.${external}`);
  if (input.firstName?.trim()) filters.push(`first_name.ilike.${input.firstName.trim()}`);
  if (!filters.length && !name) {
    return verdict("NOT_FOUND", null, [], "Sin datos suficientes para buscar coincidencias.");
  }

  let query = supabase
    .from("employees")
    .select(EMPLOYEE_IDENTITY_FIELDS)
    .eq("company_id", companyId)
    .limit(200);

  if (filters.length) query = query.or(filters.join(","));

  const { data, error } = await query;
  if (error) {
    return verdict(
      "AMBIGUOUS",
      null,
      [],
      "No pudimos verificar duplicados. Por seguridad no se crea la persona.",
    );
  }

  const index = buildEmployeeIdentityIndex((data ?? []) as IdentityCandidateRecord[]);
  return resolveIdentityFromIndex(index, input);
}

/** Copy único para superficies que bloquean la creación. */
export function identityBlockMessage(res: IdentityResolution): string {
  if (res.outcome === "EXACT_MATCH") {
    return `Se reutiliza el registro existente (${candidateName(res.match!) || res.employeeId}).`;
  }
  return res.reason;
}
