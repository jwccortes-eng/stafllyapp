/**
 * Smart Service Intake — Fase 3: orquestación del canal visual.
 *
 * Reutiliza EXACTAMENTE el carril canónico de Fase 1/2:
 *   import_batches (batch_type='service_intake', source='image'|'screenshot'|'pdf')
 *     → archivo original en bucket privado (URL firmada, nunca público)
 *       → extracción visual suggestion-only (edge function)
 *         → candidatos normalizados (módulo puro)
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
import { fingerprintText } from "./telemetry";
import {
  dedupeAcrossPages,
  normalizeVisualExtraction,
  type RawVisualExtraction,
  type UnresolvedElement,
  type VisualCandidateMeta,
  type VisualNotice,
} from "./visual-extraction";

export const VISUAL_INTAKE_BUCKET = "service-intake-files";

export const ACCEPTED_VISUAL_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const MAX_VISUAL_FILES = 8;
export const MAX_VISUAL_FILE_BYTES = 15 * 1024 * 1024;

export function classifyVisualSource(file: { name: string; type: string }): IntakeSource {
  const type = (file.type || "").toLowerCase();
  if (type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (/screenshot|captura|screen shot/i.test(file.name)) return "screenshot";
  return "image";
}

export function validateVisualFile(file: File): string | null {
  const type = (file.type || "").toLowerCase();
  const okType =
    (ACCEPTED_VISUAL_MIME as readonly string[]).includes(type) ||
    /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
  if (!okType) return `${file.name}: formato no soportado. Usa JPG, PNG, WEBP o PDF.`;
  if (file.size > MAX_VISUAL_FILE_BYTES) return `${file.name}: el archivo supera 15 MB.`;
  if (file.size === 0) return `${file.name}: el archivo está vacío.`;
  return null;
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
}

export interface VisualIntakeInput {
  /** SIEMPRE del contexto autenticado. Nunca del contenido visual. */
  companyId: string;
  userId: string;
  files: File[];
  /** Hoy del sistema, YYYY-MM-DD. */
  referenceDate: string;
}

/** Por qué un archivo no produjo resultado. Distingue fallo de "sin servicios". */
export interface VisualExtractionFailure {
  fileName: string;
  code: string;
  detail: string | null;
}

export interface VisualIntakeResult {
  batchId: string | null;
  candidates: ServiceCandidate[];
  meta: Record<string, VisualCandidateMeta>;
  unresolved: UnresolvedElement[];
  notices: VisualNotice[];
  warnings: string[];
  source: IntakeSource;
  fileCount: number;
  pageCount: number;
  duplicatePagesRemoved: number;
  extractionFailures: number;
  /** Detalle de los fallos técnicos (403/429/parse/descarga). */
  failures: VisualExtractionFailure[];
  /** true = el análisis no se completó; NUNCA decir "no encontramos servicios". */
  analysisIncomplete: boolean;
  latencyMs: number;
}

const FAILURE_COPY: Record<string, string> = {
  ai_error: "el análisis no se completó",
  unparseable_extraction: "la respuesta del análisis no se pudo leer",
  file_unreadable: "no pudimos abrir el archivo",
  file_download_failed: "no pudimos descargar el archivo",
  tenant_path_mismatch: "el archivo no pertenece a esta empresa",
};

export function describeVisualFailure(code: string): string {
  return FAILURE_COPY[code] ?? "el análisis no se completó";
}


/**
 * Procesa imágenes / PDFs de punta a punta hasta dejar candidatos listos para
 * revisión humana. NO crea ningún Servicio.
 */
export async function runVisualIntake(input: VisualIntakeInput): Promise<VisualIntakeResult> {
  if (!input.companyId) throw new Error("companyId requerido (contexto autenticado)");
  if (!input.userId) throw new Error("userId requerido (contexto autenticado)");
  if (input.files.length === 0) throw new Error("Selecciona al menos un archivo");
  if (input.files.length > MAX_VISUAL_FILES) {
    throw new Error(`Máximo ${MAX_VISUAL_FILES} archivos por análisis`);
  }

  const startedAt = Date.now();
  const warnings: string[] = [];
  const source: IntakeSource = input.files.some((f) => classifyVisualSource(f) === "pdf")
    ? "pdf"
    : classifyVisualSource(input.files[0]);

  // 1. Batch canónico (trazabilidad del origen).
  const batchId = await createServiceIntakeBatch({
    companyId: input.companyId,
    createdBy: input.userId,
    source,
    fileName: input.files.map((f) => f.name).join(", ").slice(0, 200),
  });
  if (!batchId) {
    throw new Error("No pudimos registrar el lote de importación");
  }

  // 2. Subida al bucket privado, siempre bajo el prefijo del tenant.
  const uploaded: Array<{ path: string; name: string; type: string }> = [];
  for (const [i, file] of input.files.entries()) {
    const path = `${input.companyId}/${batchId}/${i + 1}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage
      .from(VISUAL_INTAKE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) {
      warnings.push(`No pudimos subir ${file.name}: ${error.message}`);
      continue;
    }
    uploaded.push({ path, name: file.name, type: file.type || "" });
  }
  if (uploaded.length === 0) {
    throw new Error("No se pudo subir ningún archivo");
  }

  // 3. Extracción visual suggestion-only (servidor, con guardia de tenant).
  const { data, error } = await supabase.functions.invoke("visual-service-intake", {
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
  if (error) throw error;
  if ((data as any)?.error) throw new Error(String((data as any).error));

  const results: Array<{
    file_name?: string;
    storage_path?: string;
    error?: string;
    extraction?: RawVisualExtraction;
  }> = Array.isArray((data as any)?.extractions) ? (data as any).extractions : [];

  // 4. Normalización pura (nada se inventa; lo ambiguo va a "Necesitan revisión").
  let candidates: ServiceCandidate[] = [];
  const meta: Record<string, VisualCandidateMeta> = {};
  const unresolved: UnresolvedElement[] = [];
  const notices: VisualNotice[] = [];
  let pageCount = 0;
  let extractionFailures = 0;
  const failures: VisualExtractionFailure[] = [];

  results.forEach((entry, index) => {
    if (entry.error || !entry.extraction) {
      extractionFailures += 1;
      const code = entry.error ?? "ai_error";
      failures.push({
        fileName: entry.file_name ?? "archivo",
        code,
        detail: (entry as { error_detail?: string }).error_detail ?? null,
      });
      warnings.push(
        `${entry.file_name ?? "Un archivo"}: ${describeVisualFailure(code)}.`,
      );
      return;
    }

    const normalized = normalizeVisualExtraction({
      extraction: entry.extraction,
      companyId: input.companyId,
      batchId,
      source,
      referenceDate: input.referenceDate,
      fileName: entry.file_name ?? null,
      idPrefix: `f${index + 1}`,
    });
    candidates = candidates.concat(normalized.candidates);
    Object.assign(meta, normalized.meta);
    unresolved.push(...normalized.unresolved);
    notices.push(...normalized.notices);
    warnings.push(...normalized.warnings);
    pageCount += normalized.pageCount;
  });

  // 5. Dedupe entre páginas del mismo lote (PDF multipágina, capturas repetidas).
  const deduped = dedupeAcrossPages(candidates);
  candidates = deduped.candidates;

  // 6. Fuente original guardada de forma trazable.
  const rows = [
    ...uploaded.map((u, i) => ({
      rowNumber: i + 1,
      raw: {
        kind: "source_file",
        source,
        storage_path: u.path,
        file_name: u.name,
        mime_type: u.type,
      } as Record<string, unknown>,
      rowHash: `${batchId}|file-${i + 1}`,
    })),
    ...candidates.map((c, i) => ({
      rowNumber: uploaded.length + i + 1,
      raw: {
        kind: "visual_region",
        candidate_id: c.id,
        source_reference: c.sourceReference,
        page: meta[c.id]?.region.page ?? null,
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
    warnings.push(
      `${deduped.removed} bloques repetidos entre páginas se unificaron en un solo candidato.`,
    );
  }

  return {
    batchId,
    candidates,
    meta,
    unresolved,
    notices,
    warnings,
    source,
    fileCount: uploaded.length,
    pageCount: pageCount || uploaded.length,
    duplicatePagesRemoved: deduped.removed,
    extractionFailures,
    failures,
    analysisIncomplete: extractionFailures > 0,
    latencyMs: Date.now() - startedAt,

  };
}

/** Fingerprint no sensible del lote para telemetría y correlación de reintentos. */
export function fingerprintFiles(files: File[]): string {
  return fingerprintText(files.map((f) => `${f.name}:${f.size}`).join("|"));
}
