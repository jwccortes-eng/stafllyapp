/**
 * Connecteam Export Mapping — configuración TENANT-SCOPED de Job / Sub item.
 *
 * FASE 2 del puente Stafly → Connecteam.
 *
 * POR QUÉ EXISTE:
 *   Connecteam agrupa horas y costo por Job + Sub item. Stafly no puede
 *   adivinar ese catálogo: pertenece a la cuenta de Connecteam de cada
 *   compañía. Antes lo resolvíamos con reglas hardcodeadas (Eminence /
 *   Production) y, cuando no había regla, con el nombre crudo del venue, que
 *   Connecteam muestra como "Select" y desaparece del reporting.
 *
 *   Este módulo sustituye ese hardcode por una tabla de traducción explícita,
 *   guardada por compañía en `company_settings.key = 'connecteam_mapping'`.
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro. Sin BD, sin fetch. La escritura vive en el hook
 *   `useConnecteamMapping` (carril VWC). Nunca se comparten mappings entre
 *   compañías: la clave de storage ya está scoped por `company_id`.
 *
 * SEMÁNTICA REAL DE JOB / SUB ITEM:
 *   HUMAN_CONFIGURATION_REQUIRED. La evidencia disponible (template de import,
 *   exports históricos) confirma que Job y Sub item deben coincidir EXACTO con
 *   el catálogo de la cuenta, pero no permite deducir qué entidad Stafly
 *   (cliente, venue o tipo de servicio) corresponde a cada Job. Por eso el
 *   destino se declara una vez por cliente/venue y luego se reutiliza.
 */

export const CONNECTEAM_MAPPING_SETTING_KEY = "connecteam_mapping";

export type MappingSubjectKind = "client" | "location" | "title";

export interface ConnecteamMappingEntry {
  /** Job EXACTO tal como existe en Connecteam. */
  job: string;
  /** Sub item EXACTO tal como existe en Connecteam (puede ir vacío). */
  subItem: string;
  /** Etiqueta legible del sujeto Stafly (para auditoría en la UI). */
  label?: string;
  /** ISO de la última confirmación humana. */
  updatedAt?: string;
}

export interface ConnecteamMappingConfig {
  /** Clave → destino. Ver `mappingKey`. */
  entries: Record<string, ConnecteamMappingEntry>;
}

export const EMPTY_CONNECTEAM_MAPPING: ConnecteamMappingConfig = { entries: {} };

/** Normaliza un título de servicio para usarlo como sujeto de mapping. */
export function normalizeTitleKey(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Clave canónica de una entrada de mapping. */
export function mappingKey(kind: MappingSubjectKind, id: string): string {
  return kind === "title" ? `title:${normalizeTitleKey(id)}` : `${kind}:${id}`;
}

export interface MappingSubject {
  kind: MappingSubjectKind;
  /** id (cliente/venue) o título crudo. */
  id: string;
  label: string;
}

/**
 * Sujetos candidatos de un servicio, en orden de precedencia:
 * venue → cliente → título. El más específico gana.
 */
export function candidateSubjects(input: {
  locationId?: string | null;
  locationName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  title?: string | null;
}): MappingSubject[] {
  const out: MappingSubject[] = [];
  if (input.locationId) {
    out.push({ kind: "location", id: input.locationId, label: input.locationName || "Lugar" });
  }
  if (input.clientId) {
    out.push({ kind: "client", id: input.clientId, label: input.clientName || "Cliente" });
  }
  const t = (input.title ?? "").trim();
  if (t && normalizeTitleKey(t)) {
    out.push({ kind: "title", id: t, label: t });
  }
  return out;
}

/**
 * Sujeto MÁS REUTILIZABLE de un servicio: cliente → lugar → título.
 *
 * POR QUÉ NO EL MÁS ESPECÍFICO: declarar el destino en el venue solo resuelve
 * los servicios que tienen ese venue. En la operación real, los servicios del
 * mismo cliente alternan entre venue declarado y venue pendiente, así que el
 * mapping a nivel cliente es el que evita volver a preguntar turno por turno.
 * `lookupMapping` sigue respetando la precedencia venue → cliente al leer.
 */
export function mostReusableSubject(subjects: MappingSubject[]): MappingSubject | null {
  return (
    subjects.find(s => s.kind === "client") ??
    subjects.find(s => s.kind === "location") ??
    subjects[0] ??
    null
  );
}

/**
 * SUGERENCIA (nunca aplicación automática): Connecteam usa nombres en
 * mayúsculas del catálogo de la cuenta. Se ofrece el nombre del sujeto como
 * punto de partida; el operador confirma o escribe el valor real.
 */
export function suggestJobFromSubject(subject: MappingSubject | null): string {
  const raw = (subject?.label ?? "").trim();
  return raw ? raw.toUpperCase() : "";
}


export interface MappingLookup {
  entry: ConnecteamMappingEntry;
  subject: MappingSubject;
}

/** Busca el destino configurado para un servicio. `null` = falta configurar. */
export function lookupMapping(
  config: ConnecteamMappingConfig | null | undefined,
  subjects: MappingSubject[],
): MappingLookup | null {
  const entries = config?.entries ?? {};
  for (const subject of subjects) {
    const entry = entries[mappingKey(subject.kind, subject.id)];
    if (entry && String(entry.job ?? "").trim()) {
      return { entry, subject };
    }
  }
  return null;
}

/** ¿La compañía ya declaró algún destino Connecteam? */
export function hasAnyMapping(config: ConnecteamMappingConfig | null | undefined): boolean {
  return Object.keys(config?.entries ?? {}).length > 0;
}

/** Catálogo derivado de lo ya confirmado — evita reescribir Jobs a mano. */
export function knownJobs(config: ConnecteamMappingConfig | null | undefined): string[] {
  const set = new Set<string>();
  for (const e of Object.values(config?.entries ?? {})) {
    const j = String(e.job ?? "").trim();
    if (j) set.add(j);
  }
  return Array.from(set).sort();
}

export function knownSubItems(
  config: ConnecteamMappingConfig | null | undefined,
  job?: string | null,
): string[] {
  const set = new Set<string>();
  for (const e of Object.values(config?.entries ?? {})) {
    const s = String(e.subItem ?? "").trim();
    if (!s) continue;
    if (job && String(e.job ?? "").trim() !== job.trim()) continue;
    set.add(s);
  }
  return Array.from(set).sort();
}

/** Devuelve el objeto `entries` completo con la entrada añadida/actualizada. */
export function upsertEntry(
  config: ConnecteamMappingConfig | null | undefined,
  subject: MappingSubject,
  value: { job: string; subItem: string },
): Record<string, ConnecteamMappingEntry> {
  return {
    ...(config?.entries ?? {}),
    [mappingKey(subject.kind, subject.id)]: {
      job: value.job.trim(),
      subItem: (value.subItem ?? "").trim(),
      label: subject.label,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function removeEntry(
  config: ConnecteamMappingConfig | null | undefined,
  key: string,
): Record<string, ConnecteamMappingEntry> {
  const next = { ...(config?.entries ?? {}) };
  delete next[key];
  return next;
}

/** Copy canónico — un solo lugar. */
export const CONNECTEAM_MAPPING_COPY = {
  missingTitle: "Falta configurar destino Connecteam",
  missingReason:
    "Este servicio no tiene un Job/Sub item declarado para esta compañía. Connecteam lo dejaría en \"Select\" y quedaría fuera del reporting.",
  resolveCta: "Resolver ahora",
  remember: "Recordar esta configuración para esta compañía",
} as const;
