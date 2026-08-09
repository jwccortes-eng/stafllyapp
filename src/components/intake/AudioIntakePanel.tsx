/**
 * Smart Service Intake — Fase 4: panel "Nota de voz".
 *
 * Único punto de entrada del canal de audio (grabación en vivo, nota de voz
 * reenviada, MP3/M4A/WAV/OGG). Reutiliza la bandeja compartida y el helper
 * canónico: no hay otra bandeja ni otro draft engine.
 *
 * Garantías de superficie:
 *  - no publica, no asigna, no notifica, no toca payroll ni time_entries;
 *  - la creación de borradores exige revisión humana explícita;
 *  - el audio no se conserva: sólo queda la transcripción como evidencia;
 *  - `company_id` sale del contexto autenticado, jamás del contenido del audio.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mic, Square, X, Sparkles } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import AnalyzingNarrative from "@/components/intake/premium/AnalyzingNarrative";
import UnderstoodPanel from "@/components/intake/premium/UnderstoodPanel";
import ServiceIntakeReviewInbox from "@/components/intake/ServiceIntakeReviewInbox";
import { useRememberCorrection } from "@/components/intake/RememberCorrectionPrompt";
import { confirmRef, recomputeCandidate, type ServiceCandidate } from "@/lib/intake";
import { createDraftServicesFromCandidates, applyOutcome } from "@/lib/intake/create-draft-service";
import { closeServiceIntakeBatch, summarizeCandidates } from "@/lib/intake/batch";
import { buildIntakeTelemetry, logIntakeTelemetry } from "@/lib/intake/telemetry";
import { refreshDuplicateStatus } from "@/lib/intake/text-intake";
import {
  MAX_AUDIO_FILES,
  runAudioIntake,
  validateAudioFile,
  type AudioIntakeResult,
} from "@/lib/intake/audio-intake";
import type { ConfidenceLevel } from "@/lib/intake/visual-extraction";
import { useIntakeReviewPersistence } from "@/lib/intake/review-persistence";

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AudioIntakePanel() {
  const { selectedCompanyId } = useCompany();
  // Fase 5 — el diccionario del tenant sólo aprende de confirmaciones humanas.
  const { ask: askRemember, dialog: rememberDialog } = useRememberCorrection(
    selectedCompanyId,
    "voice_note",
  );
  const { user } = useAuth();
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);
  const corrections = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<AudioIntakeResult | null>(null);
  const [candidates, setCandidates] = useState<ServiceCandidate[]>([]);

  // Persistencia de revisión (UI-only): refrescar o cambiar de pestaña no pierde el lote.
  const { restored, save } = useIntakeReviewPersistence<AudioIntakeResult | null>(
    selectedCompanyId,
    "voice_note",
  );
  useEffect(() => {
    if (!restored) return;
    setCandidates(restored.candidates);
    if (restored.extra) setResult(restored.extra);
  }, [restored]);
  useEffect(() => {
    save({ batchId: result?.batchId ?? null, candidates, extra: result });
  }, [candidates, result, save]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
    const errors: string[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      const error = validateAudioFile(file);
      if (error) errors.push(error);
      else accepted.push(file);
    }
    if (errors.length > 0) {
      notifyWarning({
        title: "Algunos audios no se pueden analizar",
        fact: errors.join(" "),
        consequence: "Sólo analizaremos los audios válidos.",
      });
    }
    setFiles((prev) => [...prev, ...accepted].slice(0, MAX_AUDIO_FILES));
  }, []);

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach((t) => t.stop());
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type });
        const error = validateAudioFile(file);
        if (error) {
          notifyWarning({
            title: "Grabación demasiado corta",
            fact: "No alcanzamos a capturar audio con contenido.",
            consequence: "Vuelve a grabar hablando unos segundos.",
          });
          return;
        }
        setFiles((prev) => [...prev, file].slice(0, MAX_AUDIO_FILES));
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (error) {
      notifyError({
        title: "No pudimos usar el micrófono",
        fact: "El navegador no dio permiso de grabación.",
        consequence: "Puedes subir la nota de voz como archivo.",
        cause: error,
      });
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setFiles([]);
    setResult(null);
    setCandidates([]);
    corrections.current = 0;
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedCompanyId || !user?.id) {
      notifyError({
        title: "Falta contexto de empresa",
        fact: "No hay una empresa seleccionada.",
        consequence: "Selecciona una empresa antes de analizar la nota de voz.",
      });
      return;
    }
    if (files.length === 0) return;

    setIsProcessing(true);
    try {
      const run = await runAudioIntake({
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
          sourceText: run.transcripts.map((t) => t.transcript).join("|"),
        }),
      );

      if (run.candidates.length === 0) {
        notifyWarning({
          title: "No encontramos servicios",
          fact: "La nota no menciona trabajos que podamos interpretar.",
          consequence: "No se creó nada. Puedes volver a grabar o pegar el texto.",
        });
      } else {
        notifyInfo({
          title: `${run.candidates.length} servicios escuchados`,
          fact:
            run.unresolved.length > 0
              ? `${run.unresolved.length} elementos necesitan tu revisión.`
              : "Todo lo dicho se interpretó.",
          consequence: "Revisa y confirma: nada se crea sin tu aprobación.",
        });
      }
    } catch (error) {
      notifyError({
        title: "No pudimos analizar la nota de voz",
        fact: "La transcripción o la extracción falló.",
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
      const transcript = result?.transcripts.find((t) => t.fileName === meta.fileName)?.transcript;
      notifyInfo({
        title: "Lo que se escuchó",
        fact:
          [meta.fileName, meta.region.label, meta.sourceExcerpt ? `“${meta.sourceExcerpt}”` : null]
            .filter(Boolean)
            .join(" · ") || "Sin fragmento registrado.",
        consequence:
          meta.extractionNotes ??
          (transcript ? `Transcripción: “${transcript.slice(0, 240)}”` : "Verifica antes de crear."),
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
            source: "voice_note",
            candidates: next,
            humanCorrections: corrections.current,
            extractionFailures: blocked.length,
            sourceText: result?.transcripts.map((t) => t.transcript).join("|") ?? "",
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
    [selectedCompanyId, user?.id, candidates, result, navigate],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mic className="h-4 w-4 text-primary" />
          Nota de voz
          <Badge variant="outline" className="ml-auto font-normal">
            No publica nada
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Graba o sube una nota de voz con los trabajos del día. La escuchamos, te mostramos lo que
          entendimos y tú decides. El audio no se guarda: sólo queda la transcripción.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          {isRecording ? (
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 w-full sm:w-auto"
              onClick={stopRecording}
            >
              <Square className="mr-2 h-4 w-4" />
              Detener ({formatSeconds(seconds)})
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onClick={startRecording}
              disabled={files.length >= MAX_AUDIO_FILES}
            >
              <Mic className="mr-2 h-4 w-4" />
              Grabar nota
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => inputRef.current?.click()}
          >
            Subir audio
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.wav,.ogg,.oga,.opus,.webm"
            className="hidden"
            aria-label="Notas de voz con los trabajos"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs">{f.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
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
            disabled={isProcessing || isRecording || files.length === 0}
            className="min-h-11 w-full sm:w-auto"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!isProcessing && <Sparkles className="mr-2 h-4 w-4" />}
            Analizar
          </Button>
          {(files.length > 0 || candidates.length > 0) && (
            <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={reset}>
              Empezar de nuevo
            </Button>
          )}
        </div>

        <AnalyzingNarrative active={isProcessing} />

        {(result?.warnings.length ?? 0) > 0 && (
          <ul className="space-y-1 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {result!.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        {result && result.transcripts.some((t) => t.transcript) && (
          <details className="rounded-md border border-border px-3 py-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Ver lo que escuchamos
            </summary>
            <div className="mt-2 space-y-2">
              {result.transcripts.map((t, i) => (
                <p key={i} className="text-muted-foreground">
                  <span className="font-medium text-foreground">{t.fileName}: </span>
                  {t.transcript || "Sin transcripción."}
                </p>
              ))}
            </div>
          </details>
        )}

        {result && (candidates.length > 0 || result.unresolved.length > 0) && (
          <>
            <p className="text-xs text-muted-foreground">
              Escuchamos {candidates.length} servicios
              {result.unresolved.length > 0
                ? ` y ${result.unresolved.length} elementos necesitan revisión`
                : ""}
              .
            </p>
            <UnderstoodPanel candidates={candidates} />
            <ServiceIntakeReviewInbox
            companyId={selectedCompanyId}
            intakeSource="voice_note"
              candidates={candidates}
              sourceLabel="nota de voz"
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

export default AudioIntakePanel;
