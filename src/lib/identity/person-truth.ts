/**
 * P0 — WORKER IDENTITY QUALITY / PASSPORT PHASE 1
 * ------------------------------------------------
 * Capa PURA y de SOLO LECTURA de verdad de identidad de persona.
 *
 * Objetivo: detectar fragmentación y posibles duplicados ANTES de cualquier
 * consolidación. Este módulo NO escribe, NO fusiona, NO reasigna, NO toca
 * payroll, time_entries, documentos, auth ni asignaciones. Solo clasifica y
 * explica.
 *
 * Reglas duras:
 *  - El nombre NUNCA es base suficiente para un merge (a lo sumo LOW).
 *  - Ningún atributo sensible (SSN completo, documentos, género, dirección,
 *    fecha de nacimiento, tarifa, payroll) se usa como señal de matching.
 *  - Los identificadores se muestran enmascarados.
 *  - Los grupos viven dentro de UNA company/tenant: nunca se cruzan tenants.
 *    Passport (persona global) es un concepto separado, no se deriva aquí.
 */

import {
  classifyWorkerAssignability,
  type AssignabilityBucket,
} from "@/lib/shifts/assignable-workers";

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

export interface IdentityRecord {
  id: string;
  company_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  connecteam_employee_id?: string | null;
  employer_identification?: string | null;
  user_id?: string | null;
  portal_access_enabled?: boolean | null;
  is_active?: boolean | null;
  employee_role?: string | null;
  added_via?: string | null;
  worker_type?: string | null;
  identity_status?: string | null;
  requires_identity_resolution?: boolean | null;
  payroll_approval_blocked?: boolean | null;
  onboarding_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Métricas de actividad inyectadas por el read-model (no se recalculan aquí). */
  assignments_count?: number;
  last_assignment_at?: string | null;
  documents_count?: number;
}

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

export function normalizePersonName(
  first?: string | null,
  last?: string | null,
): string {
  const raw = `${first ?? ""} ${last ?? ""}`.trim();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeIdentityPhone(v?: string | null): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  const trimmed =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return trimmed.length >= 7 ? trimmed : "";
}

export function normalizeIdentityEmail(v?: string | null): string {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Emails compartidos de operación (buzones de la empresa) no identifican a una
 * persona: nunca deben producir un match fuerte.
 */
export function isSharedMailbox(email: string, sharedSet: Set<string>): boolean {
  return sharedSet.has(email);
}

/** Detecta buzones compartidos: un email usado por 3+ registros. */
export function detectSharedMailboxes(records: IdentityRecord[]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const em = normalizeIdentityEmail(r.email);
    if (!em) continue;
    counts.set(em, (counts.get(em) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [em, n] of counts) if (n >= 3) out.add(em);
  return out;
}

/* ------------------------------------------------------------------ */
/* Enmascarado (privacidad)                                            */
/* ------------------------------------------------------------------ */

export function maskPhone(v?: string | null): string {
  const d = normalizeIdentityPhone(v);
  return d ? `•••••${d.slice(-4)}` : "—";
}

export function maskEmail(v?: string | null): string {
  const em = normalizeIdentityEmail(v);
  if (!em.includes("@")) return "—";
  const [user, domain] = em.split("@");
  const head = user.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export function maskExternalId(v?: string | null): string {
  const s = String(v ?? "").trim();
  return s ? `••${s.slice(-4)}` : "—";
}

/* ------------------------------------------------------------------ */
/* Señales                                                             */
/* ------------------------------------------------------------------ */

export type SignalStrength = "high" | "medium" | "low";

export interface IdentitySignal {
  key:
    | "same_external_id"
    | "same_phone"
    | "same_email"
    | "same_identifier"
    | "name_plus_phone_fragment"
    | "name_plus_email_domain"
    | "name_plus_portal"
    | "same_name";
  strength: SignalStrength;
  label: string;
}

const SIGNAL_LABELS: Record<IdentitySignal["key"], string> = {
  same_external_id: "Mismo ID externo (Connecteam)",
  same_phone: "Mismo teléfono normalizado",
  same_email: "Mismo email personal",
  same_identifier: "Mismo identificador fiscal registrado",
  name_plus_phone_fragment: "Mismo nombre + teléfono parcial",
  name_plus_email_domain: "Mismo nombre + dominio de email",
  name_plus_portal: "Mismo nombre + correlación de portal",
  same_name: "Mismo nombre normalizado",
};

function signal(key: IdentitySignal["key"], strength: SignalStrength): IdentitySignal {
  return { key, strength, label: SIGNAL_LABELS[key] };
}

/* ------------------------------------------------------------------ */
/* Clasificación                                                       */
/* ------------------------------------------------------------------ */

export type IdentityVerdict =
  | "EXACT_MATCH"
  | "PROBABLE_DUPLICATE"
  | "POSSIBLE_DUPLICATE"
  | "AMBIGUOUS"
  | "NO_MATCH";

export interface PrimaryCandidate {
  candidateId: string;
  reason: string;
  confidence: number; // 0..1
}

export interface FragmentationFlag {
  key:
    | "portal_split"
    | "documents_elsewhere"
    | "history_split"
    | "no_strong_identifier"
    | "mixed_lifecycle";
  label: string;
}

export interface IdentityGroup {
  key: string;
  companyId: string | null;
  displayName: string;
  records: IdentityRecord[];
  signals: IdentitySignal[];
  verdict: IdentityVerdict;
  reason: string;
  primary: PrimaryCandidate | null;
  fragmentation: FragmentationFlag[];
  /** Riesgo operativo del grupo, para ordenar la revisión humana. */
  risk: "high" | "medium" | "low";
}

/** Une registros por firma compartida (union-find simple). */
function unionGroups(pairs: Array<[string, string]>, ids: string[]) {
  const parent = new Map<string, string>();
  ids.forEach((id) => parent.set(id, id));
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (p !== parent.get(p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  for (const [a, b] of pairs) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const arr = groups.get(root) ?? [];
    arr.push(id);
    groups.set(root, arr);
  }
  return groups;
}

function collectSignals(
  records: IdentityRecord[],
  shared: Set<string>,
): IdentitySignal[] {
  const out: IdentitySignal[] = [];
  const add = (s: IdentitySignal) => {
    if (!out.some((x) => x.key === s.key)) out.push(s);
  };

  const groupBy = <T,>(fn: (r: IdentityRecord) => T) => {
    const m = new Map<T, number>();
    for (const r of records) {
      const k = fn(r);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  for (const [, n] of groupBy((r) => String(r.connecteam_employee_id ?? "").trim()))
    if (n > 1) add(signal("same_external_id", "high"));
  for (const [, n] of groupBy((r) => normalizeIdentityPhone(r.phone_number)))
    if (n > 1) add(signal("same_phone", "high"));
  for (const [em, n] of groupBy((r) => normalizeIdentityEmail(r.email)))
    if (n > 1 && !shared.has(em as string)) add(signal("same_email", "high"));
  for (const [, n] of groupBy((r) => String(r.employer_identification ?? "").trim()))
    if (n > 1) add(signal("same_identifier", "high"));

  const names = groupBy((r) => normalizePersonName(r.first_name, r.last_name));
  const sameName = Array.from(names.values()).some((n) => n > 1);
  if (sameName) {
    add(signal("same_name", "low"));
    const phones = new Set(
      records.map((r) => normalizeIdentityPhone(r.phone_number)).filter(Boolean),
    );
    const tails = new Set(Array.from(phones).map((p) => p.slice(-4)));
    if (phones.size > 1 && tails.size < phones.size)
      add(signal("name_plus_phone_fragment", "medium"));
    const domains = new Set(
      records
        .map((r) => normalizeIdentityEmail(r.email).split("@")[1])
        .filter(Boolean) as string[],
    );
    if (domains.size === 1 && records.some((r) => r.email))
      add(signal("name_plus_email_domain", "medium"));
    const withPortal = records.filter((r) => !!r.user_id).length;
    if (withPortal > 0 && withPortal < records.length)
      add(signal("name_plus_portal", "medium"));
  }

  return out;
}

function verdictFromSignals(
  records: IdentityRecord[],
  signals: IdentitySignal[],
): { verdict: IdentityVerdict; reason: string } {
  if (records.length < 2)
    return { verdict: "NO_MATCH", reason: "Un solo registro para esta identidad." };

  const highs = signals.filter((s) => s.strength === "high");
  const mediums = signals.filter((s) => s.strength === "medium");
  const hasName = signals.some((s) => s.key === "same_name");

  // Dos personas distintas pueden compartir el mismo portal? No. Pero dos
  // registros con portales DIFERENTES y señales fuertes son ambiguos.
  const distinctAuthUsers = new Set(
    records.map((r) => r.user_id).filter(Boolean) as string[],
  );

  if (highs.length >= 2 && hasName)
    return {
      verdict: "EXACT_MATCH",
      reason: `Coinciden ${highs.map((s) => s.label.toLowerCase()).join(" y ")} junto al mismo nombre.`,
    };

  if (distinctAuthUsers.size > 1 && highs.length > 0)
    return {
      verdict: "AMBIGUOUS",
      reason:
        "Hay señales fuertes coincidentes pero cuentas de acceso distintas: puede ser la misma persona con dos accesos o dos personas compartiendo contacto.",
    };

  if (highs.length >= 1 && hasName)
    return {
      verdict: "PROBABLE_DUPLICATE",
      reason: `${highs[0].label} y mismo nombre normalizado.`,
    };

  if (highs.length >= 1)
    return {
      verdict: "AMBIGUOUS",
      reason: `${highs[0].label}, pero los nombres no coinciden: puede ser contacto compartido (familia o buzón de operación).`,
    };

  if (mediums.length >= 1)
    return {
      verdict: "POSSIBLE_DUPLICATE",
      reason: `${mediums.map((s) => s.label.toLowerCase()).join(" y ")}. Requiere revisión humana.`,
    };

  return {
    verdict: "POSSIBLE_DUPLICATE",
    reason:
      "Solo coincide el nombre normalizado. El nombre nunca alcanza para consolidar: requiere confirmar teléfono, email o identificador.",
  };
}

/* ------------------------------------------------------------------ */
/* Registro operativo principal (candidato, NO verdad)                 */
/* ------------------------------------------------------------------ */

export function computePrimaryCandidate(
  records: IdentityRecord[],
): PrimaryCandidate | null {
  if (!records.length) return null;

  const scored = records.map((r) => {
    const verdict = classifyWorkerAssignability(r);
    const reasons: string[] = [];
    let score = 0;

    if (verdict.assignable) {
      score += 40;
      reasons.push("asignable hoy");
    }
    if (r.user_id) {
      score += 20;
      reasons.push("portal activo");
    }
    const assignments = r.assignments_count ?? 0;
    if (assignments > 0) {
      score += Math.min(20, Math.round(Math.log10(assignments + 1) * 14));
      reasons.push(`${assignments} asignaciones`);
    }
    if (normalizeIdentityPhone(r.phone_number) || r.connecteam_employee_id) {
      score += 10;
      reasons.push("identificador válido");
    }
    if ((r.documents_count ?? 0) > 0) {
      score += 8;
      reasons.push(`${r.documents_count} documentos`);
    }
    if ((r.onboarding_status ?? "").toLowerCase() === "completed") {
      score += 5;
      reasons.push("onboarding completo");
    }
    if (verdict.bucket === "historical" || verdict.bucket === "placeholder") {
      score -= 30;
      reasons.push(verdict.reason ?? "registro no operativo");
    }
    return { r, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const runner = scored[1];
  if (top.score <= 0) return null;

  const margin = runner ? top.score - runner.score : top.score;
  const confidence = Math.max(
    0.2,
    Math.min(0.95, margin / Math.max(20, top.score)),
  );

  return {
    candidateId: top.r.id,
    reason: top.reasons.join(", ") || "único registro con señales operativas",
    confidence: Number(confidence.toFixed(2)),
  };
}

/* ------------------------------------------------------------------ */
/* Fragmentación                                                       */
/* ------------------------------------------------------------------ */

export function detectFragmentation(records: IdentityRecord[]): FragmentationFlag[] {
  const out: FragmentationFlag[] = [];
  if (records.length < 2) return out;

  const withPortal = records.filter((r) => !!r.user_id);
  if (withPortal.length > 0 && withPortal.length < records.length)
    out.push({
      key: "portal_split",
      label: "El acceso al portal vive en un registro y el resto no lo tiene.",
    });

  const withDocs = records.filter((r) => (r.documents_count ?? 0) > 0);
  if (
    withDocs.length > 0 &&
    withPortal.length > 0 &&
    !withDocs.some((d) => withPortal.some((p) => p.id === d.id))
  )
    out.push({
      key: "documents_elsewhere",
      label: "Los documentos están en un registro distinto al del portal.",
    });

  const withHistory = records.filter((r) => (r.assignments_count ?? 0) > 0);
  if (withHistory.length > 1)
    out.push({
      key: "history_split",
      label: "La historia de servicios está repartida entre varios registros.",
    });

  if (
    !records.some(
      (r) =>
        normalizeIdentityPhone(r.phone_number) ||
        String(r.connecteam_employee_id ?? "").trim() ||
        String(r.employer_identification ?? "").trim(),
    )
  )
    out.push({
      key: "no_strong_identifier",
      label: "Ningún registro tiene identificador fuerte (teléfono o ID externo).",
    });

  const buckets = new Set<AssignabilityBucket>(
    records.map((r) => classifyWorkerAssignability(r).bucket),
  );
  if (buckets.size > 1)
    out.push({
      key: "mixed_lifecycle",
      label: "Los registros están en etapas distintas (activo, histórico, pendiente).",
    });

  return out;
}

/* ------------------------------------------------------------------ */
/* Agrupador principal                                                 */
/* ------------------------------------------------------------------ */

/**
 * Agrupa candidatos a duplicado dentro de UNA company. Nunca cruza tenants.
 */
export function buildIdentityGroups(records: IdentityRecord[]): IdentityGroup[] {
  const shared = detectSharedMailboxes(records);
  const byId = new Map(records.map((r) => [r.id, r]));
  const ids = records.map((r) => r.id);

  const buckets = new Map<string, string[]>();
  const push = (k: string, id: string) => {
    if (!k) return;
    const arr = buckets.get(k) ?? [];
    arr.push(id);
    buckets.set(k, arr);
  };

  for (const r of records) {
    const tenant = r.company_id ?? "-";
    push(`ct:${tenant}:${String(r.connecteam_employee_id ?? "").trim()}`, r.id);
    push(`ph:${tenant}:${normalizeIdentityPhone(r.phone_number)}`, r.id);
    const em = normalizeIdentityEmail(r.email);
    if (em && !shared.has(em)) push(`em:${tenant}:${em}`, r.id);
    push(`nm:${tenant}:${normalizePersonName(r.first_name, r.last_name)}`, r.id);
  }

  const pairs: Array<[string, string]> = [];
  for (const [key, list] of buckets) {
    const suffix = key.split(":").slice(2).join(":");
    if (!suffix || list.length < 2) continue;
    for (let i = 1; i < list.length; i++) pairs.push([list[0], list[i]]);
  }

  const unioned = unionGroups(pairs, ids);
  const groups: IdentityGroup[] = [];

  for (const [root, memberIds] of unioned) {
    if (memberIds.length < 2) continue;
    const members = memberIds
      .map((id) => byId.get(id)!)
      .sort((a, b) => (b.assignments_count ?? 0) - (a.assignments_count ?? 0));
    const signals = collectSignals(members, shared);
    const { verdict, reason } = verdictFromSignals(members, signals);
    const fragmentation = detectFragmentation(members);
    const risk: IdentityGroup["risk"] =
      verdict === "EXACT_MATCH" || verdict === "PROBABLE_DUPLICATE"
        ? members.some((m) => (m.assignments_count ?? 0) > 0)
          ? "high"
          : "medium"
        : verdict === "AMBIGUOUS"
          ? "medium"
          : "low";

    groups.push({
      key: root,
      companyId: members[0].company_id ?? null,
      displayName:
        [members[0].first_name, members[0].last_name].filter(Boolean).join(" ") ||
        "Sin nombre",
      records: members,
      signals,
      verdict,
      reason,
      primary: computePrimaryCandidate(members),
      fragmentation,
      risk,
    });
  }

  const order: Record<IdentityVerdict, number> = {
    EXACT_MATCH: 0,
    PROBABLE_DUPLICATE: 1,
    AMBIGUOUS: 2,
    POSSIBLE_DUPLICATE: 3,
    NO_MATCH: 4,
  };
  groups.sort(
    (a, b) => order[a.verdict] - order[b.verdict] || b.records.length - a.records.length,
  );
  return groups;
}

export const IDENTITY_VERDICT_LABELS: Record<IdentityVerdict, string> = {
  EXACT_MATCH: "Coincidencia exacta",
  PROBABLE_DUPLICATE: "Duplicado probable",
  POSSIBLE_DUPLICATE: "Duplicado posible",
  AMBIGUOUS: "Ambiguo",
  NO_MATCH: "Sin coincidencia",
};

/* ------------------------------------------------------------------ */
/* Comparación con Connecteam (solo señal adicional)                   */
/* ------------------------------------------------------------------ */

export type ConnecteamMatchVerdict =
  | "MATCHED"
  | "MULTIPLE_STAFFLY_MATCHES"
  | "CONNECTEAM_ONLY"
  | "STAFLY_ONLY"
  | "AMBIGUOUS";

export interface ConnecteamPerson {
  externalId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ConnecteamComparisonRow {
  verdict: ConnecteamMatchVerdict;
  externalId: string | null;
  name: string;
  staflyIds: string[];
  reason: string;
}

/**
 * Connecteam NUNCA es fuente de verdad: se usa como señal adicional.
 */
export function compareWithConnecteam(
  records: IdentityRecord[],
  external: ConnecteamPerson[],
): ConnecteamComparisonRow[] {
  const rows: ConnecteamComparisonRow[] = [];
  const usedStafly = new Set<string>();

  for (const p of external) {
    const extId = String(p.externalId ?? "").trim();
    const phone = normalizeIdentityPhone(p.phone);
    const name = normalizePersonName(p.name, "");
    const matches = records.filter((r) => {
      if (extId && String(r.connecteam_employee_id ?? "").trim() === extId) return true;
      if (phone && normalizeIdentityPhone(r.phone_number) === phone) return true;
      if (name && normalizePersonName(r.first_name, r.last_name) === name) return true;
      return false;
    });

    matches.forEach((m) => usedStafly.add(m.id));

    if (matches.length === 0)
      rows.push({
        verdict: "CONNECTEAM_ONLY",
        externalId: extId || null,
        name: p.name ?? "—",
        staflyIds: [],
        reason: "No existe registro en Stafly con ese ID, teléfono ni nombre.",
      });
    else if (matches.length === 1)
      rows.push({
        verdict: "MATCHED",
        externalId: extId || null,
        name: p.name ?? "—",
        staflyIds: [matches[0].id],
        reason: extId ? "Mismo ID externo." : "Coincide teléfono o nombre normalizado.",
      });
    else
      rows.push({
        verdict: extId ? "MULTIPLE_STAFFLY_MATCHES" : "AMBIGUOUS",
        externalId: extId || null,
        name: p.name ?? "—",
        staflyIds: matches.map((m) => m.id),
        reason: `Un usuario de Connecteam apunta a ${matches.length} registros de Stafly.`,
      });
  }

  for (const r of records) {
    if (usedStafly.has(r.id)) continue;
    if (!external.length) continue;
    rows.push({
      verdict: "STAFLY_ONLY",
      externalId: String(r.connecteam_employee_id ?? "").trim() || null,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Sin nombre",
      staflyIds: [r.id],
      reason: "Existe en Stafly y no aparece en el listado de Connecteam.",
    });
  }

  return rows;
}
