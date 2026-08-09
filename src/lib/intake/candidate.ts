/**
 * Smart Service Intake — modelo canónico de candidato (Fase 1).
 *
 * Un "candidato" es una fila propuesta que TODAVÍA NO es un Servicio.
 * Nace de cualquier source (excel, csv, texto pegado, imagen, pdf, email,
 * voz futura) y muere de una de dos formas:
 *   - descartado por un humano, o
 *   - convertido en `scheduled_shifts` con `publication_status='draft'`
 *     por el helper canónico `createDraftServiceFromCandidate`.
 *
 * REGLA: las inferencias (cliente sugerido, venue sugerido, tipo de
 * servicio) NUNCA se persisten como hechos. Viajan como `*_candidate`
 * con confianza y sólo se materializan tras confirmación humana.
 *
 * Este módulo es PURO: cero I/O, cero supabase, 100% testeable.
 */

/** Canales de entrada soportados por el carril canónico. */
export const INTAKE_SOURCES = [
  "excel",
  "csv",
  "pasted_text",
  "whatsapp_text",
  "image",
  "screenshot",
  "pdf",
  "email",
  "voice_note",
] as const;

export type IntakeSource = (typeof INTAKE_SOURCES)[number];

/** `import_batches.batch_type` para intake no tabular. */
export const SERVICE_INTAKE_BATCH_TYPE = "service_intake";
/** `import_batches.batch_type` histórico del import de horario Connecteam. */
export const SCHEDULE_BATCH_TYPE = "schedule";

export type ReviewStatus =
  | "pending"
  | "needs_input"
  | "accepted"
  | "excluded"
  | "created";

export type DuplicateStatus = "no_match" | "possible_duplicate" | "exact_duplicate";

/** Valor sugerido + confianza. Nunca es un hecho hasta confirmación. */
export interface CandidateRef {
  /** Texto tal como vino en la fuente. */
  raw: string;
  /** Id resuelto SÓLO si un humano confirmó, o si el match fue exacto y confirmado. */
  resolvedId: string | null;
  /** Nombre del match propuesto (para mostrar "Posible coincidencia: X"). */
  suggestedLabel: string | null;
  suggestedId: string | null;
  /** 0..1 */
  confidence: number;
  /** true cuando requiere que un humano confirme antes de crear. */
  requiresConfirmation: boolean;
  /** Regla del diccionario del tenant que resolvió este valor (Fase 5). */
  dictionaryRuleId?: string | null;
  /** Origen de la resolución, para explicar la decisión en la bandeja. */
  matchOrigin?: "exact" | "dictionary" | "fuzzy" | "none";
}

export function emptyRef(raw = ""): CandidateRef {
  return {
    raw,
    resolvedId: null,
    suggestedLabel: null,
    suggestedId: null,
    confidence: 0,
    requiresConfirmation: false,
    dictionaryRuleId: null,
    matchOrigin: "none",
  };
}


/** Campos obligatorios para poder crear un draft. */
export const REQUIRED_CANDIDATE_FIELDS = [
  "service_date",
  "start_time",
  "end_time",
] as const;

export type RequiredCandidateField = (typeof REQUIRED_CANDIDATE_FIELDS)[number];

export interface ServiceCandidate {
  /** Identidad local del candidato dentro de la bandeja (no es un id de BD). */
  id: string;
  /** `import_batches.id` — source tracking único, sin modelo paralelo. */
  sourceBatchId: string | null;
  /** `raw_*_import_rows.id` o referencia textual de la fuente. */
  sourceRowId: string | null;
  sourceReference: string;
  source: IntakeSource;
  /** SIEMPRE del contexto autenticado. Nunca inferido del contenido. */
  companyId: string;

  serviceDate: string | null; // YYYY-MM-DD
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm

  clientCandidate: CandidateRef;
  venueCandidate: CandidateRef;
  locationCandidate: CandidateRef;

  serviceType: string | null;
  requestedWorkers: number | null;
  roleCandidates: string[];
  notes: string | null;

  /** 0..1 por campo. Sólo informativo para la bandeja. */
  confidenceByField: Record<string, number>;
  missingFields: string[];
  duplicateStatus: DuplicateStatus;
  duplicateShiftId: string | null;
  reviewStatus: ReviewStatus;
  /** id del `scheduled_shifts` creado (idempotencia en memoria). */
  createdShiftId: string | null;
}

export interface CreateCandidateInput
  extends Partial<Omit<ServiceCandidate, "id" | "companyId" | "source">> {
  id: string;
  companyId: string;
  source: IntakeSource;
}

export function createCandidate(input: CreateCandidateInput): ServiceCandidate {
  const base: ServiceCandidate = {
    id: input.id,
    sourceBatchId: input.sourceBatchId ?? null,
    sourceRowId: input.sourceRowId ?? null,
    sourceReference: input.sourceReference ?? "",
    source: input.source,
    companyId: input.companyId,
    serviceDate: input.serviceDate ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    clientCandidate: input.clientCandidate ?? emptyRef(),
    venueCandidate: input.venueCandidate ?? emptyRef(),
    locationCandidate: input.locationCandidate ?? emptyRef(),
    serviceType: input.serviceType ?? null,
    requestedWorkers: input.requestedWorkers ?? null,
    roleCandidates: input.roleCandidates ?? [],
    notes: input.notes ?? null,
    confidenceByField: input.confidenceByField ?? {},
    missingFields: [],
    duplicateStatus: input.duplicateStatus ?? "no_match",
    duplicateShiftId: input.duplicateShiftId ?? null,
    reviewStatus: input.reviewStatus ?? "pending",
    createdShiftId: input.createdShiftId ?? null,
  };
  return recomputeCandidate(base);
}

/** Recalcula `missingFields` y degrada `reviewStatus` si falta información. */
export function recomputeCandidate(c: ServiceCandidate): ServiceCandidate {
  const missing: string[] = [];
  if (!c.serviceDate) missing.push("service_date");
  if (!c.startTime) missing.push("start_time");
  if (!c.endTime) missing.push("end_time");
  if (c.clientCandidate.requiresConfirmation) missing.push("client_confirmation");
  if (c.venueCandidate.requiresConfirmation) missing.push("venue_confirmation");

  let status = c.reviewStatus;
  if (status !== "created" && status !== "excluded") {
    status = missing.length > 0 ? "needs_input" : status === "needs_input" ? "pending" : status;
  }
  return { ...c, missingFields: missing, reviewStatus: status };
}

/**
 * TRES NIVELES DE READINESS — nunca se mezclan:
 *
 *   A. READY_TO_CREATE_DRAFT      → mínimo indispensable para representar el trabajo
 *   B. READY_TO_PUBLISH           → información operativa completa
 *   C. READY_TO_EXPORT_CONNECTEAM → además, Job/Sub item y horario real
 *
 * Un servicio con A=true, B=false y C=false es válido y debe poder guardarse.
 */
export interface CandidateReadiness {
  readyToCreateDraft: boolean;
  /** Razones que impiden guardar el borrador. Vacío = se puede crear. */
  draftBlockers: string[];
  /** Pendientes que impiden publicar (no bloquean el borrador). */
  publishGaps: string[];
  /** Pendientes que impiden exportar a Connecteam (no bloquean el borrador). */
  exportGaps: string[];
  /** Entidades detectadas sin vincular ("Imperial — pendiente de vincular"). */
  pendingEntities: string[];
}

const clean = (v: string | null | undefined) => (v ?? "").trim();

/** Referencia mínima que identifica el trabajo sin inventar datos. */
export function candidateReference(c: ServiceCandidate): string {
  return (
    clean(c.clientCandidate.raw) ||
    clean(c.venueCandidate.raw) ||
    clean(c.locationCandidate.raw) ||
    clean(c.serviceType) ||
    clean(c.notes)
  );
}

export function getCandidateReadiness(c: ServiceCandidate): CandidateReadiness {
  const draftBlockers: string[] = [];
  if (c.reviewStatus === "excluded") draftBlockers.push("excluded");
  if (c.createdShiftId) draftBlockers.push("already_created");
  if (!c.companyId) draftBlockers.push("missing_company");
  if (!c.serviceDate) draftBlockers.push("missing_service_date");
  if (!candidateReference(c)) draftBlockers.push("missing_reference");
  if (c.duplicateStatus === "exact_duplicate") draftBlockers.push("exact_duplicate");
  if (c.duplicateStatus === "possible_duplicate" && c.reviewStatus !== "accepted") {
    draftBlockers.push("possible_duplicate_needs_review");
  }

  const publishGaps: string[] = [];
  if (!c.startTime) publishGaps.push("start_time");
  if (!c.endTime) publishGaps.push("end_time");
  if (!c.requestedWorkers) publishGaps.push("requested_workers");
  if (!c.clientCandidate.resolvedId && clean(c.clientCandidate.raw)) {
    publishGaps.push("client_link");
  }
  if (!c.locationCandidate.resolvedId && clean(c.venueCandidate.raw)) {
    publishGaps.push("venue_link");
  }

  const exportGaps: string[] = [...publishGaps.filter((g) => g !== "requested_workers")];
  if (!c.clientCandidate.resolvedId && !c.locationCandidate.resolvedId) {
    if (!exportGaps.includes("connecteam_job")) exportGaps.push("connecteam_job");
  }

  const pendingEntities: string[] = [];
  if (clean(c.clientCandidate.raw) && !c.clientCandidate.resolvedId) {
    pendingEntities.push(clean(c.clientCandidate.raw));
  }
  if (clean(c.venueCandidate.raw) && !c.locationCandidate.resolvedId) {
    const raw = clean(c.venueCandidate.raw);
    if (!pendingEntities.includes(raw)) pendingEntities.push(raw);
  }

  return {
    readyToCreateDraft: draftBlockers.length === 0,
    draftBlockers,
    publishGaps,
    exportGaps,
    pendingEntities,
  };
}

/**
 * ¿Se puede convertir en draft? Regla única compartida por UI y helper.
 * Sólo evalúa el nivel A: cliente/venue/hora fin/personal pendientes NO bloquean.
 */
export function canCreateDraft(c: ServiceCandidate): { ok: boolean; reason?: string } {
  const { draftBlockers } = getCandidateReadiness(c);
  if (draftBlockers.length === 0) return { ok: true };
  return { ok: false, reason: draftBlockers[0] };
}


/** Título por defecto del draft. Nunca inventa cliente. */
export function candidateTitle(c: ServiceCandidate): string {
  const parts = [
    c.clientCandidate.raw?.trim(),
    c.venueCandidate.raw?.trim(),
    c.serviceType?.trim(),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : "Servicio sin título";
}
