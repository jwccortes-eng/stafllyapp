/**
 * Smart Service Intake — Fase 4: orquestación del canal de audio.
 *
 * Reutiliza EXACTAMENTE el carril canónico de Fases 1/2/3:
 *   import_batches (batch_type='service_intake', source='voice_note')
 *     → audio temporal en bucket privado (se borra tras transcribir)
 *       → transcripción + extracción suggestion-only (edge function)
 *         → candidatos normalizados (módulo puro, contrato único)
 *           → bandeja compartida (revisión humana obligatoria)
 *             → scheduled_shifts (publication_status='draft') vía helper canónico
 *
 * Este módulo NO escribe en `scheduled_shifts`.
 */

import { supabase } from "@/integrations/supabase/client";
import { createServiceIntakeBatch, persistIntakeRawRows } from "./batch";
import { recomputeCandidate, type IntakeSource, type ServiceCandidate } from "./candidate";
import { applyDuplicateVerdict, detectDuplicate } from "./duplicate";
import { loadExistingServices, loadIntakeCatalogs, resolveCandidateEntities } from "./text-intake";
import { normalizeAudioExtraction } from "./audio-extraction";
import {
  classifyAnalysisOutcome,
  classifyProviderFailure,
  runStructuralRecovery,
  type IntakeAnalysisOutcome,
  type ProviderFailureKind,
  type RecoveryResult,
} from "./recovery";

import {
  dedupeAcrossPages,
  type RawVisualExtraction,
  type UnresolvedElement,
  type VisualCandidateMeta,
  type VisualNotice,
} from "./visual-extraction";

/** Mismo bucket privado que el canal visual: no hay un segundo almacén. */
export const AUDIO_INTAKE_BUCKET = "service-intake-files";

export const ACCEPTED_AUDIO_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
] as const;

export const MAX_AUDIO_FILES = 5;
export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
/** Menos de esto es un audio vacío (mic silenciado o toque accidental). */
export const MIN_AUDIO_FILE_BYTES = 2048;

export function validateAudioFile(file: File): string | null {
  const type = (file.type || "").toLowerCase().split(";")[0];
  const okType =
    (ACCEPTED_AUDIO_MIME as readonly string[]).includes(type) ||
    type.startsWith("audio/") ||
    /\.(mp3|m4a|wav|ogg|oga|opus|webm|aac)$/i.test(file.name);
  if (!okType) return `${file.name}: formato no soportado. Usa MP3, M4A, WAV u OGG.`;
  if (file.size > MAX_AUDIO_FILE_BYTES) return `${file.name}: el audio supera 25 MB.`;
  if (file.size < MIN_AUDIO_FILE_BYTES) return `${file.name}: el audio está vacío o es demasiado corto.`;
  return null;
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
}

export interface AudioIntakeInput {
  /** SIEMPRE del contexto autenticado. Nunca del contenido del audio. */
  companyId: string;
  userId: string;
  files: File[];
  /** Hoy del sistema, YYYY-MM-DD: ancla de "mañana", "el martes"… */
  referenceDate: string;
}

export interface AudioTranscriptEntry {
  fileName: string;
  transcript: string;
  error: string | null;
}

export interface AudioIntakeResult {
  batchId: string | null;
  candidates: ServiceCandidate[];
  meta: Record<string, VisualCandidateMeta>;
  unresolved: UnresolvedElement[];
  notices: VisualNotice[];
  warnings: string[];
  transcripts: AudioTranscriptEntry[];
  source: IntakeSource;
  fileCount: number;
  duplicatePagesRemoved: number;
  extractionFailures: number;
  /** true = el análisis no se completó; NUNCA decir "no encontramos servicios". */
  analysisIncomplete: boolean;
  /** Clasificación técnica del fallo (crédito, red, timeout…). */
  failureKind: ProviderFailureKind | null;
  /** Los tres resultados posibles del análisis, contrato compartido con visual. */
  outcome: IntakeAnalysisOutcome;
  /** Recuperación estructural sobre la transcripción cuando la extracción falló. */
  recovery: RecoveryResult | null;
  latencyMs: number;
}

const ERROR_LABELS: Record<string, string> = {
  tenant_path_mismatch: "el archivo no pertenece a esta empresa",
  file_unreadable: "no pudimos leer el archivo",
  file_download_failed: "no pudimos descargar el archivo",
  audio_empty: "el audio está vacío",
  transcription_failed: "no pudimos transcribir el audio",
  transcription_empty: "no se escuchó nada que transcribir",
  ai_error: "la extracción falló",
  unparseable_extraction: "la extracción devolvió un resultado ilegible",
};


/**
 * Procesa notas de voz de punta a punta hasta dejar candidatos listos para
 * revisión humana. NO crea ningún Servicio.
 */
export async function runAudioIntake(input: AudioIntakeInput): Promise<AudioIntakeResult> {
  if (!input.companyId) throw new Error("companyId requerido (contexto autenticado)");
  if (!input.userId) throw new Error("userId requerido (contexto autenticado)");
  if (input.files.length === 0) throw new Error("Selecciona o graba al menos un audio");
  if (input.files.length > MAX_AUDIO_FILES) {
    throw new Error(`Máximo ${MAX_AUDIO_FILES} audios por análisis`);
  }

  const startedAt = Date.now();
  const warnings: string[] = [];
  const source: IntakeSource = "voice_note";

  // 1. Batch canónico (trazabilidad del origen).
  const batchId = await createServiceIntakeBatch({
    companyId: input.companyId,
    createdBy: input.userId,
    source,
    fileName: input.files.map((f) => f.name).join(", ").slice(0, 200),
  });
  if (!batchId) throw new Error("No pudimos registrar el lote de importación");

  // 2. Subida temporal al bucket privado, bajo el prefijo del tenant.
  //    La edge function borra cada objeto apenas lo transcribe.
  const uploaded: Array<{ path: string; name: string; type: string }> = [];
  for (const [i, file] of input.files.entries()) {
    const path = `${input.companyId}/${batchId}/audio-${i + 1}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage
      .from(AUDIO_INTAKE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "audio/webm" });
    if (error) {
      warnings.push(`No pudimos subir ${file.name}: ${error.message}`);
      continue;
    }
    uploaded.push({ path, name: file.name, type: file.type || "" });
  }
  if (uploaded.length === 0) throw new Error("No se pudo subir ningún audio");

  // 3. Transcripción + extracción suggestion-only (servidor, con guardia de tenant).
  const { data, error } = await supabase.functions.invoke("audio-service-intake", {
    body: {
      company_id: input.companyId,
      batch_id: batchId,
      reference_date: input.referenceDate,
      files: uploaded.map((u) => ({
        storage_path: u.path,
        mime_type: u.type,
        file_name: u.name,
      })),
    },
  });
  // Un fallo del proveedor (créditos, límite, caída) NO se lanza como excepción
  // genérica: se conserva como fallo técnico por archivo para que el resultado
  // pueda decir "no pudimos analizar" en vez de "no encontramos servicios".
  let requestFailure: { code: string; detail: string } | null = null;
  if (error) {
    let detail = "";
    let code = "";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.clone().json();
        detail = String(body?.error ?? "");
        code = String(body?.code ?? "");
      }
    } catch {
      /* noop */
    }
    requestFailure = {
      code: code || "transcription_failed",
      detail: detail || (error as Error).message || "El análisis de audio no se completó",
    };
  } else if ((data as any)?.error) {
    requestFailure = {
      code: String((data as any).code ?? "ai_error"),
      detail: String((data as any).error),
    };
  }

  const results: Array<{
    file_name?: string;
    transcript?: string;
    error?: string;
    extraction?: RawVisualExtraction;
  }> = requestFailure
    ? uploaded.map((u) => ({ file_name: u.name, error: requestFailure!.code }))
    : Array.isArray((data as any)?.results)
      ? (data as any).results
      : [];


  // 4. Normalización pura (fechas relativas resueltas; nada se inventa).
  let candidates: ServiceCandidate[] = [];
  const meta: Record<string, VisualCandidateMeta> = {};
  const unresolved: UnresolvedElement[] = [];
  const notices: VisualNotice[] = [];
  const transcripts: AudioTranscriptEntry[] = [];
  let extractionFailures = 0;

  results.forEach((entry, index) => {
    const fileName = entry.file_name ?? `audio ${index + 1}`;
    transcripts.push({
      fileName,
      transcript: entry.transcript ?? "",
      error: entry.error ?? null,
    });

    if (entry.error || !entry.extraction) {
      extractionFailures += 1;
      warnings.push(
        `No pudimos usar ${fileName}: ${
          ERROR_LABELS[entry.error ?? ""] ?? requestFailure?.detail ?? "fallo técnico del análisis"
        }.`,
      );

      return;
    }

    const normalized = normalizeAudioExtraction({
      extraction: entry.extraction,
      companyId: input.companyId,
      batchId,
      source,
      referenceDate: input.referenceDate,
      fileName,
      transcript: entry.transcript ?? null,
      idPrefix: `a${index + 1}`,
    });
    candidates = candidates.concat(normalized.candidates);
    Object.assign(meta, normalized.meta);
    unresolved.push(...normalized.unresolved);
    notices.push(...normalized.notices);
    warnings.push(...normalized.warnings);
  });

  // 5. Dedupe dentro del mismo lote (la misma nota repetida, o repetida al hablar).
  const deduped = dedupeAcrossPages(candidates);
  candidates = deduped.candidates;

  // 6. Trazabilidad: se guarda la TRANSCRIPCIÓN, nunca el audio.
  const rows = [
    ...transcripts.map((t, i) => ({
      rowNumber: i + 1,
      raw: {
        kind: "source_transcript",
        source,
        file_name: t.fileName,
        transcript: t.transcript,
        error: t.error,
        audio_retained: false,
      } as Record<string, unknown>,
      rowHash: `${batchId}|audio-${i + 1}`,
    })),
    ...candidates.map((c, i) => ({
      rowNumber: transcripts.length + i + 1,
      raw: {
        kind: "audio_segment",
        candidate_id: c.id,
        source_reference: c.sourceReference,
        region_label: meta[c.id]?.region.label ?? null,
        excerpt: meta[c.id]?.sourceExcerpt ?? null,
      } as Record<string, unknown>,
      rowHash: `${batchId}|${c.id}`,
    })),
  ];
  const idByHash = await persistIntakeRawRows(batchId, input.companyId, rows);
  candidates = candidates.map((c) => ({
    ...c,
    sourceRowId: idByHash.get(`${batchId}|${c.id}`) ?? null,
  }));

  // 7. Resolución canónica de venue/cliente (suggestion-only, nunca crea).
  const catalogs = await loadIntakeCatalogs(input.companyId);
  candidates = candidates.map((c) => resolveCandidateEntities(c, catalogs));

  // 8. Detección canónica de duplicados.
  const existing = await loadExistingServices(
    input.companyId,
    candidates.map((c) => c.serviceDate ?? ""),
  );
  candidates = candidates.map((c) =>
    recomputeCandidate(applyDuplicateVerdict(c, detectDuplicate(c, existing))),
  );

  if (deduped.removed > 0) {
    warnings.push(`${deduped.removed} servicios repetidos en la nota se unificaron en uno.`);
  }

  // 9. Contrato único de resultado: un fallo técnico jamás se cuenta como
  //    "no encontramos servicios". Si la transcripción existe, se intenta la
  //    misma recuperación estructural del canal visual.
  const failureKind = classifyProviderFailure({
    code: requestFailure?.code ?? transcripts.find((t) => t.error)?.error ?? null,
    message: requestFailure?.detail ?? null,
  });
  const recoveryText = transcripts
    .map((t) => t.transcript)
    .filter(Boolean)
    .join("\n")
    .trim();
  const recovery =
    candidates.length === 0 && extractionFailures > 0 && recoveryText
      ? runStructuralRecovery({
          text: recoveryText,
          companyId: input.companyId, // SIEMPRE del contexto autenticado
          batchId,
          source,
          referenceDate: input.referenceDate,
          sourceReference: "recuperación estructural de la transcripción",
          failureKind,
        })
      : null;

  const outcome = classifyAnalysisOutcome({
    candidateCount: candidates.length + (recovery?.candidates.length ?? 0),
    technicalFailure: extractionFailures > 0,
    evidence: recovery?.evidence ?? null,
  });

  return {
    batchId,
    candidates,
    meta,
    unresolved,
    notices,
    warnings,
    transcripts,
    source,
    fileCount: uploaded.length,
    duplicatePagesRemoved: deduped.removed,
    extractionFailures,
    analysisIncomplete: extractionFailures > 0,
    failureKind: extractionFailures > 0 ? failureKind : null,
    outcome:
      candidates.length > 0 && extractionFailures > 0 && recovery === null
        ? "ANALYSIS_SUCCESS"
        : outcome,
    recovery,
    latencyMs: Date.now() - startedAt,
  };

}
