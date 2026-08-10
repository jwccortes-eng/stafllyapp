/**
 * CLIENT TRUTH LAYER V1 — modelo canónico de verdad de Clientes.
 *
 * Módulo PURO (sin red, sin React). Todas las superficies del ecosistema
 * (Clientes, Servicios, Smart Intake, Bulk Creation, Connecteam, facturación)
 * deben leer la verdad de un Cliente desde aquí y no desde campos crudos.
 *
 * REGLAS DURAS
 *  - No fusiona, no borra y no reescribe clientes. Sólo interpreta.
 *  - Cliente ≠ Venue: un cliente puede tener 0, 1 o varios lugares.
 *  - Los datos incompletos NUNCA bloquean la operación: se muestran como
 *    pendientes explicables, jamás como error ni como score opaco.
 *  - Activos primero: los inactivos siguen buscables, pero no compiten.
 */

export type ClientMatchStatus = "EXACT_MATCH" | "POSSIBLE_DUPLICATE" | "NOT_FOUND";

export type ClientLifecycle = "active" | "inactive" | "archived";

export type ConnecteamMappingStatus = "configured" | "missing";

/** Fila cruda mínima leída de la base. */
export interface ClientRecord {
  id: string;
  company_id: string;
  name: string;
  client_code: string | null;
  aliases?: string[] | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ClientContactSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface ClientVenueSummary {
  id: string;
  name: string;
  address: string | null;
}

/** Pendiente de calidad: regla simple, nombrada y explicable. */
export interface ClientDataQualityGap {
  key: "contact" | "phone" | "email" | "venue";
  label: string;
}

export interface ClientDataQuality {
  /** Reglas evaluadas (denominador del porcentaje). */
  rulesEvaluated: number;
  rulesSatisfied: number;
  /** Derivado de reglas simples, no de un modelo opaco. */
  completenessPct: number;
  gaps: ClientDataQualityGap[];
  hasPrimaryContact: boolean;
}

export interface ClientDuplicateWarning {
  clientId: string;
  clientCode: string | null;
  name: string;
  reason: "same_normalized_name" | "similar_name" | "same_email" | "same_phone";
  score: number;
}

export interface ClientTruth {
  clientId: string;
  /** Referencia humana estable, tipo CL-000123. No depende del nombre. */
  humanReference: string;
  canonicalName: string;
  status: string;
  lifecycle: ClientLifecycle;
  isActive: boolean;
  contacts: ClientContactSummary[];
  primaryContact: ClientContactSummary | null;
  venues: ClientVenueSummary[];
  serviceCount: number;
  lastServiceAt: string | null;
  connecteamMappingStatus: ConnecteamMappingStatus;
  dataQuality: ClientDataQuality;
  duplicateWarnings: ClientDuplicateWarning[];
  source: "clients";
  reason: string;
}

/* ────────────────────────────── normalización ───────────────────────────── */

/** trim + minúsculas + espacios colapsados + puntuación segura fuera. */
export function normalizeClientName(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,''"`´*_/\\()\[\]]/g, " ")
    .replace(/\b(llc|inc|corp|co|ltd|the)\b/g, " ")
    .replace(/[^a-z0-9\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const x = normalizeClientName(a);
  const y = normalizeClientName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const max = Math.max(x.length, y.length);
  const base = 1 - levenshtein(x, y) / max;
  // Contención ("millennium" dentro de "the millennium simcha hall") cuenta.
  const contained = x.includes(y) || y.includes(x) ? 0.9 : 0;
  return Math.max(base, contained);
}

export const CLIENT_DUPLICATE_THRESHOLD = 0.82;

/* ─────────────────────────── anti-duplicados ────────────────────────────── */

export interface ClientMatchInput {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface ClientMatchResult {
  status: ClientMatchStatus;
  exact: ClientRecord | null;
  candidates: ClientDuplicateWarning[];
}

function aliasesOf(c: ClientRecord): string[] {
  return (c.aliases ?? []).filter(Boolean);
}

/**
 * Nunca bloquea de forma absoluta: informa. La decisión es siempre humana.
 */
export function matchClient(input: ClientMatchInput, catalog: ClientRecord[]): ClientMatchResult {
  const needle = normalizeClientName(input.name);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (!needle) return { status: "NOT_FOUND", exact: null, candidates: [] };

  const live = catalog.filter((c) => !c.deleted_at);
  const exact =
    live.find(
      (c) =>
        normalizeClientName(c.name) === needle ||
        aliasesOf(c).some((a) => normalizeClientName(a) === needle),
    ) ?? null;

  const candidates: ClientDuplicateWarning[] = [];
  for (const c of live) {
    if (exact && c.id === exact.id) continue;
    const score = Math.max(
      nameSimilarity(input.name, c.name),
      ...aliasesOf(c).map((a) => nameSimilarity(input.name, a)),
      0,
    );
    let reason: ClientDuplicateWarning["reason"] | null = null;
    let finalScore = score;
    if (email && normalizeEmail(c.contact_email) === email) {
      reason = "same_email";
      finalScore = 1;
    } else if (phone && normalizePhone(c.contact_phone) === phone) {
      reason = "same_phone";
      finalScore = 1;
    } else if (score >= CLIENT_DUPLICATE_THRESHOLD) {
      reason = score === 1 ? "same_normalized_name" : "similar_name";
    }
    if (reason) {
      candidates.push({
        clientId: c.id,
        clientCode: c.client_code,
        name: c.name,
        reason,
        score: Number(finalScore.toFixed(2)),
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  if (exact) return { status: "EXACT_MATCH", exact, candidates: candidates.slice(0, 5) };
  if (candidates.length > 0)
    return { status: "POSSIBLE_DUPLICATE", exact: null, candidates: candidates.slice(0, 5) };
  return { status: "NOT_FOUND", exact: null, candidates: [] };
}

export interface ClientDuplicatePair {
  a: ClientRecord;
  b: ClientRecord;
  reason: ClientDuplicateWarning["reason"];
  score: number;
}

/** Pares candidatos para la vista administrativa "Posibles duplicados". */
export function findDuplicatePairs(catalog: ClientRecord[]): ClientDuplicatePair[] {
  const live = catalog.filter((c) => !c.deleted_at);
  const pairs: ClientDuplicatePair[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      const sameEmail =
        normalizeEmail(a.contact_email) && normalizeEmail(a.contact_email) === normalizeEmail(b.contact_email);
      const samePhone =
        normalizePhone(a.contact_phone) && normalizePhone(a.contact_phone) === normalizePhone(b.contact_phone);
      const score = nameSimilarity(a.name, b.name);
      if (sameEmail) pairs.push({ a, b, reason: "same_email", score: 1 });
      else if (samePhone) pairs.push({ a, b, reason: "same_phone", score: 1 });
      else if (normalizeClientName(a.name) === normalizeClientName(b.name))
        pairs.push({ a, b, reason: "same_normalized_name", score: 1 });
      else if (score >= CLIENT_DUPLICATE_THRESHOLD)
        pairs.push({ a, b, reason: "similar_name", score: Number(score.toFixed(2)) });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

/** Clave estable de par (independiente del orden) para persistir decisiones. */
export function duplicatePairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

/* ───────────────────────────── data quality ─────────────────────────────── */

export function evaluateClientDataQuality(input: {
  client: ClientRecord;
  contacts: ClientContactSummary[];
  venues: ClientVenueSummary[];
}): ClientDataQuality {
  const { client, contacts, venues } = input;
  const primary = contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null;
  const hasContact = Boolean(primary || client.contact_name);
  const hasPhone = Boolean(primary?.phone || client.contact_phone);
  const hasEmail = Boolean(primary?.email || client.contact_email);
  const hasVenue = venues.length > 0;

  const gaps: ClientDataQualityGap[] = [];
  if (!hasContact) gaps.push({ key: "contact", label: "contacto" });
  if (!hasPhone) gaps.push({ key: "phone", label: "teléfono" });
  if (!hasEmail) gaps.push({ key: "email", label: "email" });
  if (!hasVenue) gaps.push({ key: "venue", label: "lugar" });

  const rulesEvaluated = 4;
  const rulesSatisfied = rulesEvaluated - gaps.length;
  return {
    rulesEvaluated,
    rulesSatisfied,
    completenessPct: Math.round((rulesSatisfied / rulesEvaluated) * 100),
    gaps,
    hasPrimaryContact: Boolean(primary),
  };
}

/* ─────────────────────────────── read model ─────────────────────────────── */

export interface ClientTruthInput {
  client: ClientRecord;
  contacts?: ClientContactSummary[];
  venues?: ClientVenueSummary[];
  serviceCount?: number;
  lastServiceAt?: string | null;
  connecteamMapped?: boolean;
  catalog?: ClientRecord[];
}

export function lifecycleOf(client: ClientRecord): ClientLifecycle {
  if (client.deleted_at) return "archived";
  return client.status === "active" ? "active" : "inactive";
}

/**
 * getClientTruth — resolver canónico. Nunca devuelve sólo campos crudos.
 */
export function getClientTruth(input: ClientTruthInput): ClientTruth {
  const { client } = input;
  const contacts = input.contacts ?? [];
  const venues = input.venues ?? [];
  const lifecycle = lifecycleOf(client);
  const primary =
    contacts.find((c) => c.isPrimary) ??
    contacts[0] ??
    (client.contact_name
      ? {
          id: `legacy:${client.id}`,
          name: client.contact_name,
          email: client.contact_email,
          phone: client.contact_phone,
          isPrimary: true,
        }
      : null);

  const duplicateWarnings = input.catalog
    ? matchClient(
        { name: client.name, email: client.contact_email, phone: client.contact_phone },
        input.catalog.filter((c) => c.id !== client.id),
      ).candidates
    : [];

  const dataQuality = evaluateClientDataQuality({ client, contacts, venues });

  const reasonParts = [
    lifecycle === "active" ? "cliente activo" : `cliente ${lifecycle === "archived" ? "archivado" : "inactivo"}`,
    `${input.serviceCount ?? 0} servicio(s)`,
    dataQuality.gaps.length ? `pendiente: ${dataQuality.gaps.map((g) => g.label).join(", ")}` : "datos completos",
  ];

  return {
    clientId: client.id,
    humanReference: client.client_code ?? "—",
    canonicalName: client.name.trim(),
    status: client.status,
    lifecycle,
    isActive: lifecycle === "active",
    contacts: primary && contacts.length === 0 ? [primary] : contacts,
    primaryContact: primary,
    venues,
    serviceCount: input.serviceCount ?? 0,
    lastServiceAt: input.lastServiceAt ?? null,
    connecteamMappingStatus: input.connecteamMapped ? "configured" : "missing",
    dataQuality,
    duplicateWarnings,
    source: "clients",
    reason: reasonParts.join(" · "),
  };
}

/* ──────────────────────────── búsqueda / orden ──────────────────────────── */

export function clientMatchesQuery(truth: ClientTruth, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const nq = normalizeClientName(q);
  const haystack = [
    truth.canonicalName,
    truth.humanReference,
    truth.primaryContact?.name ?? "",
    truth.primaryContact?.email ?? "",
    truth.primaryContact?.phone ?? "",
    ...truth.contacts.flatMap((c) => [c.name, c.email ?? "", c.phone ?? ""]),
    ...truth.venues.map((v) => v.name),
  ];
  return haystack.some((h) => {
    const raw = (h ?? "").toLowerCase();
    if (raw.includes(q)) return true;
    const n = normalizeClientName(h);
    return Boolean(nq) && Boolean(n) && n.includes(nq);
  });
}

/** Activos primero; dentro de cada grupo, por actividad y nombre. */
export function sortActiveFirst(list: ClientTruth[]): ClientTruth[] {
  const rank = (t: ClientTruth) => (t.lifecycle === "active" ? 0 : t.lifecycle === "inactive" ? 1 : 2);
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const la = a.lastServiceAt ?? "";
    const lb = b.lastServiceAt ?? "";
    if (la !== lb) return lb.localeCompare(la);
    return a.canonicalName.localeCompare(b.canonicalName);
  });
}

export interface ClientDirectoryMatrix {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  exactDuplicates: number;
  probableDuplicates: number;
  withoutContact: number;
  withoutVenue: number;
  withoutServices: number;
  withRecentServices: number;
  withConnecteamMapping: number;
  withoutConnecteamMapping: number;
}

export function buildDirectoryMatrix(
  list: ClientTruth[],
  pairs: ClientDuplicatePair[],
  recentSinceISO: string,
): ClientDirectoryMatrix {
  return {
    total: list.length,
    active: list.filter((c) => c.lifecycle === "active").length,
    inactive: list.filter((c) => c.lifecycle === "inactive").length,
    archived: list.filter((c) => c.lifecycle === "archived").length,
    exactDuplicates: pairs.filter((p) => p.score === 1).length,
    probableDuplicates: pairs.filter((p) => p.score < 1).length,
    withoutContact: list.filter((c) => !c.primaryContact).length,
    withoutVenue: list.filter((c) => c.venues.length === 0).length,
    withoutServices: list.filter((c) => c.serviceCount === 0).length,
    withRecentServices: list.filter(
      (c) => c.lastServiceAt !== null && c.lastServiceAt >= recentSinceISO,
    ).length,
    withConnecteamMapping: list.filter((c) => c.connecteamMappingStatus === "configured").length,
    withoutConnecteamMapping: list.filter((c) => c.connecteamMappingStatus === "missing").length,
  };
}
