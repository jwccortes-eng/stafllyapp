/**
 * Smart Service Intake — Fase 3: panel "Subir imagen o PDF".
 *
 * Único punto de entrada del canal visual (captura, foto, flyer, calendario,
 * PDF escaneado). Reutiliza la bandeja compartida y el helper canónico.
 *
 * Garantías de superficie:
 *  - no publica, no asigna, no notifica, no toca payroll ni time_entries;
 *  - la creación de borradores exige revisión humana explícita;
 *  - `company_id` sale del contexto autenticado, jamás del contenido visual.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import ServiceIntakeReviewInbox from "@/components/intake/ServiceIntakeReviewInbox";
import { useRememberCorrection } from "@/components/intake/RememberCorrectionPrompt";
import { confirmRef, recomputeCandidate, type ServiceCandidate } from "@/lib/intake";
import { createDraftServicesFromCandidates, applyOutcome } from "@/lib/intake/create-draft-service";
import { closeServiceIntakeBatch, summarizeCandidates } from "@/lib/intake/batch";
import { buildIntakeTelemetry, logIntakeTelemetry } from "@/lib/intake/telemetry";
import { refreshDuplicateStatus } from "@/lib/intake/text-intake";
import {
  MAX_VISUAL_FILES,
  runVisualIntake,
  validateVisualFile,
  type VisualIntakeResult,
} from "@/lib/intake/visual-intake";
import type { ConfidenceLevel } from "@/lib/intake/visual-extraction";
import { useIntakeReviewPersistence } from "@/lib/intake/review-persistence";
import { cn } from "@/lib/utils";

/**
 * UX Entry Pass — el mismo canal visual se presenta como "Imagen" o como "PDF".
 * Es sólo copy y filtro de tipos de archivo: el extractor y el carril canónico
 * son idénticos en ambos casos.
 */
export function VisualIntakePanel({ variant = "image" }: { variant?: "image" | "pdf" } = {}) {
  const isPdf = variant === "pdf";
  const { selectedCompanyId } = useCompany();
  // Fase 5 — el diccionario del tenant sólo aprende de confirmaciones humanas.
  const { ask: askRemember, dialog: rememberDialog } = useRememberCorrection(
    selectedCompanyId,
    "image",
  );
  const { user } = useAuth();
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const corrections = useRef(0);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<VisualIntakeResult | null>(null);
  const [candidates, setCandidates] = useState<ServiceCandidate[]>([]);

  // Persistencia de revisión (UI-only): refrescar o cambiar de pestaña no pierde el lote.
  const { restored, save } = useIntakeReviewPersistence<VisualIntakeResult | null>(
    selectedCompanyId,
    "image",
  );
  useEffect(() => {
    if (!restored) return;
    setCandidates(restored.candidates);
    if (restored.extra) setResult(restored.extra);
  }, [restored]);
  useEffect(() => {
    save({ batchId: result?.batchId ?? null, candidates, extra: result });
  }, [candidates, result, save]);

  const noticesByCandidate = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const n of result?.notices ?? []) {
      if (!n.candidateId) continue;
      (map[n.candidateId] ??= []).push(n.message);
    }
    return map;
  }, [result]);

  const confidenceByCandidate = useMemo(() => {
    const map: Record<string, Record<string, ConfidenceLevel>> = {};
    for (const [id, meta] of Object.entries(result?.meta ?? {})) {
      map[id] = meta.levels;
    }
    return map;
  }, [result]);

  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    const errors: string[] = [];
    const accepted: File[] = [];
    for (const file of list) {
      const error = validateVisualFile(file);
      if (error) errors.push(error);
      else accepted.push(file);
    }
    if (errors.length > 0) {
      notifyWarning({
        title: "Algunos archivos no se pueden analizar",
        fact: errors.join(" "),
        consequence: "Sólo analizaremos los archivos válidos.",
      });
    }
    setFiles((prev) => {
      const next = [...prev, ...accepted].slice(0, MAX_VISUAL_FILES);
      setPreviews((old) => {
        const map = { ...old };
        for (const f of accepted) {
          if (f.type.startsWith("image/") && !map[f.name]) {
            map[f.name] = URL.createObjectURL(f);
          }
        }
        return map;
      });
      return next;
    });
  }, []);

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setPreviews((prev) => {
      if (prev[name]) URL.revokeObjectURL(prev[name]);
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const reset = useCallback(() => {
    Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    setFiles([]);
    setPreviews({});
    setResult(null);
    setCandidates([]);
    corrections.current = 0;
  }, [previews]);

  const handleAnalyze = useCallback(async () => {
    if (!selectedCompanyId || !user?.id) {
      notifyError({
        title: "Falta contexto de empresa",
        fact: "No hay una empresa seleccionada.",
        consequence: "Selecciona una empresa antes de analizar el archivo.",
      });
      return;
    }
    if (files.length === 0) return;

    setIsProcessing(true);
    try {
      const run = await runVisualIntake({
        companyId: selectedCompanyId,
        userId: user.id,
        files,
        referenceDate: new Date().toISOString().slice(0, 10),
      });
      setResult(run);
      setCandidates(run.candidates);
      corrections.current = 0;

      logIntakeTelemetry(
        buildIntakeTelemetry({
          batchId: run.batchId,
          companyId: selectedCompanyId,
          source: run.source,
          candidates: run.candidates,
          extractionFailures: run.extractionFailures,
          sourceText: files.map((f) => `${f.name}:${f.size}`).join("|"),
        }),
      );

      if (run.candidates.length === 0) {
        notifyWarning({
          title: "No encontramos servicios",
          fact: "El archivo no muestra fechas ni eventos que podamos leer.",
          consequence: "No se creó nada. Prueba con una imagen más nítida o pega el texto.",
        });
      } else {
        notifyInfo({
          title: `${run.candidates.length} servicios detectados`,
          fact:
            run.unresolved.length > 0
              ? `${run.unresolved.length} elementos necesitan tu revisión.`
              : "Todos los bloques se interpretaron.",
          consequence: "Revisa y confirma: nada se crea sin tu aprobación.",
        });
      }
    } catch (error) {
      notifyError({
        title: "No pudimos analizar el archivo",
        fact: "La extracción visual falló.",
        consequence: "No se creó ningún servicio. Puedes reintentar.",
        cause: error,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedCompanyId, user?.id, files]);

  const handlePatch = useCallback((candidateId: string, patch: Partial<ServiceCandidate>) => {
    corrections.current += 1;
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? recomputeCandidate({ ...c, ...patch }) : c)),
    );
  }, []);

  const handleConfirmMatch = useCallback(
    (candidateId: string, field: "client" | "venue") => {
      corrections.current += 1;
      setCandidates((prev) =>
        prev.map((c) => {
          if (c.id !== candidateId) return c;
          if (field === "client") {
            const id = c.clientCandidate.suggestedId;
            if (!id) return c;
            askRemember({
              ruleType: "client_alias",
              rawValue: c.clientCandidate.raw,
              resolvedValue: c.clientCandidate.suggestedLabel ?? "",
              resolvedEntityId: id,
              resolvedEntityKind: "client",
            });
            return recomputeCandidate({ ...c, clientCandidate: confirmRef(c.clientCandidate, id) });
          }
          const id = c.venueCandidate.suggestedId;
          if (!id) return c;
          askRemember({
            ruleType: "venue_alias",
            rawValue: c.venueCandidate.raw,
            resolvedValue: c.venueCandidate.suggestedLabel ?? "",
            resolvedEntityId: id,
            resolvedEntityKind: "location",
          });
          return recomputeCandidate({
            ...c,
            venueCandidate: confirmRef(c.venueCandidate, id),
            locationCandidate: confirmRef(c.locationCandidate, id),
          });
        }),
      );
    },
    [askRemember],
  );

  const setStatus = useCallback(
    (ids: string[], reviewStatus: ServiceCandidate["reviewStatus"]) => {
      corrections.current += 1;
      setCandidates((prev) =>
        prev.map((c) =>
          ids.includes(c.id) && c.reviewStatus !== "created" ? { ...c, reviewStatus } : c,
        ),
      );
    },
    [],
  );

  const handleReviewSource = useCallback(
    (candidateId: string) => {
      const meta = result?.meta[candidateId];
      if (!meta) return;
      notifyInfo({
        title: "Fuente del candidato",
        fact:
          [
            meta.fileName,
            meta.region.page ? `página ${meta.region.page}` : null,
            meta.region.label,
            meta.sourceExcerpt ? `“${meta.sourceExcerpt}”` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Sin referencia visual registrada.",
        consequence: meta.extractionNotes ?? "Verifica contra la imagen original antes de crear.",
      });
    },
    [result],
  );

  const handleCreateDrafts = useCallback(
    async (ids: string[]) => {
      if (!selectedCompanyId || !user?.id || ids.length === 0) return;
      setIsCreating(true);
      try {
        const refreshed = await refreshDuplicateStatus(selectedCompanyId, candidates);
        setCandidates(refreshed);

        const targets = refreshed.filter((c) => ids.includes(c.id));
        const outcomes = await createDraftServicesFromCandidates(targets, {
          companyId: selectedCompanyId,
          userId: user.id,
        });

        let next = refreshed;
        for (const outcome of outcomes) {
          next = next.map((c) => (c.id === outcome.candidateId ? applyOutcome(c, outcome) : c));
        }
        setCandidates(next);

        const created = outcomes.filter((o) => o.status === "created").length;
        const reused = outcomes.filter((o) => o.status === "reused").length;
        const blocked = outcomes.filter((o) => o.status !== "created" && o.status !== "reused");

        if (result?.batchId) {
          await closeServiceIntakeBatch(result.batchId, summarizeCandidates(next));
        }

        logIntakeTelemetry(
          buildIntakeTelemetry({
            batchId: result?.batchId ?? null,
            companyId: selectedCompanyId,
            source: result?.source ?? "image",
            candidates: next,
            humanCorrections: corrections.current,
            extractionFailures: blocked.length,
            sourceText: files.map((f) => `${f.name}:${f.size}`).join("|"),
          }),
        );

        if (created > 0 || reused > 0) {
          notifySuccess({
            title: `${created} servicios en borrador`,
            fact:
              reused > 0
                ? `${created} creados y ${reused} ya existían de un intento anterior.`
                : "Quedaron guardados como borrador, sin publicar.",
            consequence: "Nadie fue asignado ni notificado. Publícalos desde Servicios.",
            action: {
              label: "Ver borradores",
              // Contexto: llevamos al día del primer borrador creado, no al listado genérico.
              onClick: () => {
                const firstDate = next.find((c) => c.reviewStatus === "created")?.serviceDate;
                navigate(firstDate ? `/app/shifts?date=${firstDate}&view=week` : "/app/shifts");
              },
            },
          });
        }
        if (blocked.length > 0) {
          notifyWarning({
            title: `${blocked.length} sin crear`,
            fact: "Faltan datos, hay duplicado o el lugar no está confirmado.",
            consequence: "Esos candidatos siguen en la bandeja para que los completes.",
          });
        }
      } catch (error) {
        notifyError({
          title: "No pudimos crear los borradores",
          fact: "La escritura falló.",
          consequence: "Nada quedó a medias: puedes reintentar sin duplicar.",
          cause: error,
        });
      } finally {
        setIsCreating(false);
      }
    },
    [selectedCompanyId, user?.id, candidates, result, files, navigate],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ImagePlus className="h-4 w-4 text-primary" />
          {isPdf ? "Subir PDF" : "Subir imagen o foto"}
          <Badge variant="outline" className="ml-auto font-normal">
            No publica nada
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {isPdf
            ? "Sube el PDF con la programación. Lo leemos página por página y te mostramos los servicios para revisar. Nada se crea hasta que lo confirmes."
            : "Sube una captura del calendario, una foto de la agenda o un flyer. Leemos los servicios y te los mostramos para revisar. Nada se crea hasta que lo confirmes."}
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "rounded-lg border border-dashed border-border p-4 text-center transition-colors",
            isDragging && "border-primary bg-muted/50",
          )}
        >
          <p className="text-sm text-muted-foreground">
            Arrastra aquí tus archivos o elige una opción
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => inputRef.current?.click()}
            >
              Elegir archivos
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn("min-h-11 sm:hidden", isPdf && "hidden")}
              onClick={() => cameraRef.current?.click()}
            >
              Tomar foto
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={isPdf ? "application/pdf" : "image/jpeg,image/jpg,image/png,image/webp,application/pdf"}
            className="hidden"
            aria-label="Archivos con los trabajos"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Tomar foto de los trabajos"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {files.map((f) => (
              <li
                key={f.name}
                className="relative overflow-hidden rounded-md border border-border p-2"
              >
                {previews[f.name] ? (
                  <img
                    src={previews[f.name]}
                    alt={`Vista previa de ${f.name}`}
                    className="h-24 w-full rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                    PDF
                  </div>
                )}
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{f.name}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1 h-6 w-6"
                  aria-label={`Quitar ${f.name}`}
                  onClick={() => removeFile(f.name)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            onClick={handleAnalyze}
            disabled={isProcessing || files.length === 0}
            className="min-h-11 w-full sm:w-auto"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Analizar
          </Button>
          {(files.length > 0 || candidates.length > 0) && (
            <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={reset}>
              Empezar de nuevo
            </Button>
          )}
        </div>

        {(result?.warnings.length ?? 0) > 0 && (
          <ul className="space-y-1 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {result!.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        {result && (candidates.length > 0 || result.unresolved.length > 0) && (
          <>
            <p className="text-xs text-muted-foreground">
              Encontramos {candidates.length} servicios
              {result.unresolved.length > 0
                ? ` y ${result.unresolved.length} elementos necesitan revisión`
                : ""}
              .
            </p>
            <ServiceIntakeReviewInbox
            companyId={selectedCompanyId}
            intakeSource="image"
              candidates={candidates}
              sourceLabel={result.source === "pdf" ? "PDF" : "imagen"}
              noticesByCandidate={noticesByCandidate}
              confidenceByCandidate={confidenceByCandidate}
              unresolvedElements={result.unresolved}
              onReviewSource={handleReviewSource}
              onPatch={handlePatch}
              onConfirmMatch={handleConfirmMatch}
              onAccept={(ids) => setStatus(ids, "accepted")}
              onExclude={(ids) => setStatus(ids, "excluded")}
              onCreateDrafts={handleCreateDrafts}
              onViewDuplicate={(shiftId) => navigate(`/app/shift-ops?shiftId=${shiftId}`)}
              isBusy={isCreating}
            />
          </>
        )}
      </CardContent>
      {rememberDialog}
    </Card>
  );
}

export default VisualIntakePanel;
