/**
 * P0.1 — CANONICAL PERSON RESOLUTION LAYER (SHADOW MODE)
 * ======================================================
 *
 * Objetivo: que TODAS las pantallas resuelvan la MISMA persona canónica, sin
 * fusionar nada y sin mover datos entre registros.
 *
 * Modelo (reutiliza el esquema existente, NO crea tabla maestra nueva):
 *
 *   PERSONA CANÓNICA           = auth user (`employees.user_id`) cuando existe;
 *                                si no, el contacto verificado normalizado
 *                                (teléfono/email) y en último caso la ficha viva.
 *   RELACIÓN CON LA EMPRESA    = fila de `employees` (company_id + operativa).
 *   AUTORIDAD DE CONTACTO      = fila de `employees` de ESA empresa (la viva).
 *   AUTORIDAD DE CUENTA        = `employees.user_id` → auth.
 *   ALIAS / LEGADO             = `employees.merged_into_employee_id`
 *                                + `employee_aliases`.
 *
 * REGLAS DURAS
 * ------------
 * - SOLO LECTURA. No escribe, no fusiona, no borra, no notifica.
 * - El nombre NUNCA basta para declarar la misma persona.
 * - El conocimiento de identidad entre empresas NO otorga acceso operativo:
 *   el contacto y la operativa se resuelven SIEMPRE dentro del company_id
 *   solicitado. De otras empresas sólo se expone el conteo de vínculos.
 * - "Sin teléfono" es CONTACT_INCOMPLETE, jamás un duplicado de identidad.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  normalizeIdentityEmail,
  normalizeIdentityPhone,
  normalizePersonName,
} from "@/lib/identity/person-truth";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface PersonRecord {
  id: string;
  company_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  user_id?: string | null;
  is_active?: boolean | null;
  merged_into_employee_id?: string | null;
  avatar_url?: string | null;
  employer_identification?: string | null;
  created_at?: string | null;
}

/** Confianza del vínculo entre dos registros. Nunca por nombre solo. */
export type PersonMatchConfidence =
  | "CONFIRMED_SAME_PERSON"
  | "POSSIBLE_SAME_PERSON"
  | "DISTINCT_PERSON"
  | "INSUFFICIENT_EVIDENCE";

export type PersonEvidenceKey =
  | "same_account"
  | "explicit_merge_link"
  | "same_normalized_phone"
  | "same_email"
  | "same_tax_identifier"
  | "same_normalized_name"
  | "different_accounts";

export interface PersonEvidence {
  key: PersonEvidenceKey;
  strength: "strong" | "supporting" | "weak" | "contradicting";
  label: string;
}

const EVIDENCE_LABELS: Record<PersonEvidenceKey, string> = {
  same_account: "Misma cuenta de acceso",
  explicit_merge_link: "Vínculo histórico explícito (ficha fusionada)",
  same_normalized_phone: "Mismo teléfono normalizado",
  same_email: "Mismo correo",
  same_tax_identifier: "Mismo identificador fiscal",
  same_normalized_name: "Mismo nombre normalizado",
  different_accounts: "Cuentas de acceso distintas",
};

const ev = (
  key: PersonEvidenceKey,
  strength: PersonEvidence["strength"],
): PersonEvidence => ({ key, strength, label: EVIDENCE_LABELS[key] });

/** Estado del contacto. Independiente de la identidad. */
export type ContactCompleteness =
  | "CONTACT_COMPLETE"
  | "CONTACT_INCOMPLETE";

/** Estado de revisión de identidad. Nunca derivado de contacto faltante. */
export type IdentityReviewState =
  | "IDENTITY_OK"
  | "POSSIBLE_DUPLICATE"
  | "CONFIRMED_DUPLICATE"
  | "IDENTITY_CONFLICT";

/** Rol de cada ficha dentro de la persona canónica. */
export type RecordRole =
  | "canonical"
  | "alias"
  | "legacy"
  | "inactive_relationship"
  | "other_company_relationship";

export interface ResolvedRecord {
  employee_id: string;
  company_id: string | null;
  role: RecordRole;
  /** Sólo true dentro del company scope solicitado. */
  in_scope: boolean;
}

export interface CanonicalContact {
  phone: string | null;
  email: string | null;
  /** Ficha de la que proviene el dato (siempre dentro del scope). */
  source_employee_id: string | null;
  completeness: ContactCompleteness;
}

export interface CanonicalPersonResolution {
  /** Clave estable de la persona: cuenta, contacto verificado o ficha viva. */
  person_key: string;
  person_key_basis: "account" | "phone" | "email" | "employee";
  display_name: string;
  /** Ficha viva de la empresa solicitada. Único destino válido de escrituras. */
  canonical_employee_id: string;
  company_id: string | null;
  account_user_id: string | null;
  contact: CanonicalContact;
  records: ResolvedRecord[];
  /** Total de fichas vinculadas (incluye otras empresas). Sólo conteo. */
  linked_record_count: number;
  /** Conteo de relaciones en otras empresas. Sin datos de esas empresas. */
  other_company_relationship_count: number;
  identity_review: IdentityReviewState;
  evidence: PersonEvidence[];
  /** Explicación legible para el operador. */
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Clasificación de pares                                              */
/* ------------------------------------------------------------------ */

export function comparePersonRecords(
  a: PersonRecord,
  b: PersonRecord,
): { confidence: PersonMatchConfidence; evidence: PersonEvidence[] } {
  const evidence: PersonEvidence[] = [];

  const accountA = a.user_id ?? null;
  const accountB = b.user_id ?? null;
  if (accountA && accountB && accountA === accountB) {
    evidence.push(ev("same_account", "strong"));
  }
  if (
    a.merged_into_employee_id === b.id ||
    b.merged_into_employee_id === a.id ||
    (a.merged_into_employee_id &&
      a.merged_into_employee_id === b.merged_into_employee_id)
  ) {
    evidence.push(ev("explicit_merge_link", "strong"));
  }

  const phoneA = normalizeIdentityPhone(a.phone_number);
  const phoneB = normalizeIdentityPhone(b.phone_number);
  if (phoneA && phoneA === phoneB) evidence.push(ev("same_normalized_phone", "strong"));

  const emailA = normalizeIdentityEmail(a.email);
  const emailB = normalizeIdentityEmail(b.email);
  if (emailA && emailA === emailB) evidence.push(ev("same_email", "strong"));

  const taxA = String(a.employer_identification ?? "").trim();
  const taxB = String(b.employer_identification ?? "").trim();
  if (taxA && taxA === taxB) evidence.push(ev("same_tax_identifier", "supporting"));

  const nameA = normalizePersonName(a.first_name, a.last_name);
  const nameB = normalizePersonName(b.first_name, b.last_name);
  const sameName = !!nameA && nameA === nameB;
  if (sameName) evidence.push(ev("same_normalized_name", "weak"));

  const differentAccounts = !!accountA && !!accountB && accountA !== accountB;
  if (differentAccounts) evidence.push(ev("different_accounts", "contradicting"));

  const strong = evidence.filter((e) => e.strength === "strong");

  if (differentAccounts && !strong.some((e) => e.key === "explicit_merge_link")) {
    // Dos accesos distintos: no se declara la misma persona automáticamente.
    return { confidence: strong.length > 0 ? "POSSIBLE_SAME_PERSON" : "DISTINCT_PERSON", evidence };
  }

  if (strong.some((e) => e.key === "same_account" || e.key === "explicit_merge_link")) {
    return { confidence: "CONFIRMED_SAME_PERSON", evidence };
  }
  // Dos señales fuertes de contacto (teléfono + email) = confirmado.
  if (strong.length >= 2) return { confidence: "CONFIRMED_SAME_PERSON", evidence };
  if (strong.length === 1 && sameName) return { confidence: "CONFIRMED_SAME_PERSON", evidence };
  if (strong.length === 1) return { confidence: "POSSIBLE_SAME_PERSON", evidence };
  if (sameName) return { confidence: "POSSIBLE_SAME_PERSON", evidence };
  return { confidence: "INSUFFICIENT_EVIDENCE", evidence };
}

/* ------------------------------------------------------------------ */
/* Contacto                                                            */
/* ------------------------------------------------------------------ */

export function classifyContactCompleteness(record: PersonRecord): ContactCompleteness {
  const phone = normalizeIdentityPhone(record.phone_number);
  return phone.length >= 10 ? "CONTACT_COMPLETE" : "CONTACT_INCOMPLETE";
}

/* ------------------------------------------------------------------ */
/* Construcción PURA de la persona canónica                            */
/* ------------------------------------------------------------------ */

function roleFor(
  row: PersonRecord,
  canonicalId: string,
  scopeCompanyId: string | null,
): RecordRole {
  if (row.id === canonicalId) return "canonical";
  if (scopeCompanyId && row.company_id !== scopeCompanyId)
    return "other_company_relationship";
  if (row.merged_into_employee_id) return "legacy";
  if (row.is_active === false) return "inactive_relationship";
  return "alias";
}

/**
 * Resuelve la persona canónica a partir de una ficha semilla.
 *
 * @param seed       ficha desde la que llega el operador (puede ser sombra)
 * @param candidates fichas vinculadas por evidencia fuerte (ya filtradas)
 * @param scope      empresa desde la que se está mirando (contexto operativo)
 */
export function buildCanonicalPerson(
  seed: PersonRecord,
  candidates: PersonRecord[],
  scope?: { companyId?: string | null },
): CanonicalPersonResolution {
  const all = [seed, ...candidates.filter((c) => c.id !== seed.id)];
  const scopeCompanyId = scope?.companyId ?? seed.company_id ?? null;

  const inScope = all.filter((r) => !scopeCompanyId || r.company_id === scopeCompanyId);

  // La ficha canónica es la viva del scope: activa, no fusionada, con contacto.
  const scoreRecord = (r: PersonRecord) =>
    (r.merged_into_employee_id ? -100 : 0) +
    (r.is_active === false ? -40 : 30) +
    (r.user_id ? 20 : 0) +
    (normalizeIdentityPhone(r.phone_number).length >= 10 ? 15 : 0) +
    (normalizeIdentityEmail(r.email) ? 5 : 0);

  const ranked = [...(inScope.length ? inScope : all)].sort(
    (a, b) => scoreRecord(b) - scoreRecord(a),
  );
  const canonicalRow = ranked[0] ?? seed;
  const canonicalId =
    (seed.merged_into_employee_id &&
      all.find((r) => r.id === seed.merged_into_employee_id)?.id) ||
    canonicalRow.id;
  const canonical = all.find((r) => r.id === canonicalId) ?? canonicalRow;

  // Contacto: SOLO desde fichas del scope. Nunca se toma de otra empresa.
  const contactPool = (inScope.length ? inScope : [canonical]).slice().sort(
    (a, b) => scoreRecord(b) - scoreRecord(a),
  );
  const phoneRow =
    contactPool.find((r) => normalizeIdentityPhone(r.phone_number).length >= 10) ?? null;
  const emailRow = contactPool.find((r) => !!normalizeIdentityEmail(r.email)) ?? null;

  const contact: CanonicalContact = {
    phone: phoneRow?.phone_number ?? null,
    email: emailRow?.email ?? null,
    source_employee_id: phoneRow?.id ?? emailRow?.id ?? null,
    completeness: phoneRow ? "CONTACT_COMPLETE" : "CONTACT_INCOMPLETE",
  };

  const records: ResolvedRecord[] = all.map((r) => ({
    employee_id: r.id,
    company_id: r.company_id ?? null,
    role: roleFor(r, canonicalId, scopeCompanyId),
    in_scope: !scopeCompanyId || r.company_id === scopeCompanyId,
  }));

  // Evidencia agregada contra la ficha canónica.
  const evidence: PersonEvidence[] = [];
  let anyConfirmed = false;
  let anyPossible = false;
  for (const r of all) {
    if (r.id === canonicalId) continue;
    const cmp = comparePersonRecords(canonical, r);
    for (const e of cmp.evidence)
      if (!evidence.some((x) => x.key === e.key)) evidence.push(e);
    if (cmp.confidence === "CONFIRMED_SAME_PERSON") anyConfirmed = true;
    if (cmp.confidence === "POSSIBLE_SAME_PERSON") anyPossible = true;
  }

  const duplicateActiveInScope = records.filter(
    (r) => r.in_scope && (r.role === "alias" || r.role === "canonical"),
  ).length;

  let identity_review: IdentityReviewState = "IDENTITY_OK";
  if (anyConfirmed && duplicateActiveInScope > 1) identity_review = "CONFIRMED_DUPLICATE";
  else if (anyPossible) identity_review = "POSSIBLE_DUPLICATE";
  if (
    evidence.some((e) => e.key === "different_accounts") &&
    evidence.some((e) => e.strength === "strong")
  )
    identity_review = "IDENTITY_CONFLICT";

  const account = canonical.user_id ?? all.find((r) => r.user_id)?.user_id ?? null;
  const phoneKey = normalizeIdentityPhone(contact.phone);
  const emailKey = normalizeIdentityEmail(contact.email);
  const person_key = account
    ? `account:${account}`
    : phoneKey
      ? `phone:${phoneKey}`
      : emailKey
        ? `email:${emailKey}`
        : `employee:${canonicalId}`;
  const person_key_basis = account
    ? "account"
    : phoneKey
      ? "phone"
      : emailKey
        ? "email"
        : "employee";

  const otherCompany = records.filter((r) => r.role === "other_company_relationship").length;

  const reason =
    identity_review === "CONFIRMED_DUPLICATE"
      ? "Hay más de una ficha activa de la misma persona en esta empresa con evidencia fuerte."
      : identity_review === "POSSIBLE_DUPLICATE"
        ? "Hay fichas que podrían ser la misma persona, sin evidencia suficiente para confirmarlo."
        : identity_review === "IDENTITY_CONFLICT"
          ? "Coinciden datos de contacto pero las cuentas de acceso son distintas."
          : contact.completeness === "CONTACT_INCOMPLETE"
            ? "Identidad única; falta completar el teléfono de contacto."
            : "Identidad única y contacto completo.";

  return {
    person_key,
    person_key_basis,
    display_name:
      `${canonical.first_name ?? ""} ${canonical.last_name ?? ""}`.trim() ||
      `${seed.first_name ?? ""} ${seed.last_name ?? ""}`.trim(),
    canonical_employee_id: canonicalId,
    company_id: scopeCompanyId,
    account_user_id: account,
    contact,
    records,
    linked_record_count: records.length,
    other_company_relationship_count: otherCompany,
    identity_review,
    evidence,
    reason,
  };
}

/* ------------------------------------------------------------------ */
/* Resolver de solo lectura (shadow)                                   */
/* ------------------------------------------------------------------ */

const SELECT =
  "id, company_id, first_name, last_name, phone_number, email, user_id, is_active, merged_into_employee_id, avatar_url, employer_identification, created_at";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: CanonicalPersonResolution | null }>();

export function clearCanonicalPersonCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * Resuelve la persona canónica leyendo `employees` (RLS del usuario aplica).
 * NUNCA escribe. NUNCA fusiona. NUNCA copia contacto entre fichas.
 */
export async function resolveCanonicalPerson(
  employeeId: string | null | undefined,
  scope?: { companyId?: string | null },
): Promise<CanonicalPersonResolution | null> {
  if (!employeeId) return null;
  const cacheKey = `${employeeId}|${scope?.companyId ?? ""}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const { data: seed } = await supabase
    .from("employees")
    .select(SELECT)
    .eq("id", employeeId)
    .maybeSingle();

  if (!seed) {
    cache.set(cacheKey, { at: Date.now(), value: null });
    return null;
  }

  const seedRow = seed as PersonRecord;
  const anchorId = seedRow.merged_into_employee_id ?? seedRow.id;

  // Vínculos explícitos: canónico + sus fichas fusionadas.
  const [{ data: anchor }, { data: shadows }] = await Promise.all([
    supabase.from("employees").select(SELECT).eq("id", anchorId).maybeSingle(),
    supabase.from("employees").select(SELECT).eq("merged_into_employee_id", anchorId),
  ]);

  const candidates: PersonRecord[] = [
    ...(anchor ? [anchor as PersonRecord] : []),
    ...(((shadows ?? []) as PersonRecord[]) ?? []),
  ];

  // Vínculo por cuenta (puede abarcar otras empresas: sólo para conteo).
  if (seedRow.user_id) {
    const { data: byAccount } = await supabase
      .from("employees")
      .select(SELECT)
      .eq("user_id", seedRow.user_id);
    for (const row of (byAccount ?? []) as PersonRecord[]) {
      if (!candidates.some((c) => c.id === row.id)) candidates.push(row);
    }
  }

  const value = buildCanonicalPerson(seedRow, candidates, {
    companyId: scope?.companyId ?? seedRow.company_id ?? null,
  });
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
