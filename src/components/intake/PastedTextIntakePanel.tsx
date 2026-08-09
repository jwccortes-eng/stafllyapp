/**
 * Smart Service Intake — Fase 2: panel "Pegar texto".
 *
 * Único punto de entrada del canal de texto libre / WhatsApp pegado.
 * Reutiliza la bandeja compartida y el helper canónico de Fase 1.
 *
 * Garantías de superficie:
 *  - no publica, no asigna, no notifica a workers, no toca payroll;
 *  - la creación de borradores exige revisión humana explícita;
 *  - `company_id` sale del contexto autenticado, jamás del mensaje.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import ServiceIntakeReviewInbox from "@/components/intake/ServiceIntakeReviewInbox";
import { useRememberCorrection } from "@/components/intake/RememberCorrectionPrompt";
import {
  confirmRef,
  recomputeCandidate,
  type ServiceCandidate,
} from "@/lib/intake";
import { createDraftServicesFromCandidates, applyOutcome } from "@/lib/intake/create-draft-service";
import { runPastedTextIntake, refreshDuplicateStatus } from "@/lib/intake/text-intake";
import { closeServiceIntakeBatch, summarizeCandidates } from "@/lib/intake/batch";
import { buildIntakeTelemetry, logIntakeTelemetry } from "@/lib/intake/telemetry";
import type { TextParseNotice } from "@/lib/intake/text-parser";
import { useIntakeReviewPersistence } from "@/lib/intake/review-persistence";
import AnalyzingNarrative from "@/components/intake/premium/AnalyzingNarrative";
import UnderstoodPanel from "@/components/intake/premium/UnderstoodPanel";
import IntakeSuccessPanel, {
  type IntakeSuccessSummary,
} from "@/components/intake/premium/IntakeSuccessPanel";
import { buildUnderstanding } from "@/lib/intake/understanding";

const PLACEHOLDER = `Ejemplo:

"Millennium Hall
Bar Mitzvah
18 servers
6 PM"

No importa el formato.`;

export function PastedTextIntakePanel() {
  const { selectedCompanyId } = useCompany();
  // Fase 5 — el diccionario del tenant sólo aprende de confirmaciones humanas.
  const { ask: askRemember, dialog: rememberDialog } = useRememberCorrection(
    selectedCompanyId,
    "pasted_text",
  );
  const { user } = useAuth();
  const navigate = useNavigate();

  const { restored, save, clear } = useIntakeReviewPersistence<{
    text: string;
    notices: TextParseNotice[];
  }>(selectedCompanyId, "pasted_text");

  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ServiceCandidate[]>([]);
  const [notices, setNotices] = useState<TextParseNotice[]>([]);
  const corrections = useRef(0);
  const [success, setSuccess] = useState<IntakeSuccessSummary | null>(null);

  // Persistencia de revisión: volver de otra pestaña o refrescar no borra el lote.
  useEffect(() => {
    if (!restored) return;
    setCandidates(restored.candidates);
    setBatchId(restored.batchId);
    setNotices(restored.extra?.notices ?? []);
    setText((prev) => prev || restored.extra?.text || "");
  }, [restored]);

  useEffect(() => {
    save({ batchId, candidates, extra: { text, notices } });
  }, [batchId, candidates, notices, text, save]);

  const noticesByCandidate = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const n of notices) {
      if (!n.candidateId) continue;
      (map[n.candidateId] ??= []).push(n.message);
    }
    return map;
  }, [notices]);

  const globalNotices = useMemo(
    () => notices.filter((n) => !n.candidateId).map((n) => n.message),
    [notices],
  );

  const handleProcess = useCallback(async () => {
    if (!selectedCompanyId || !user?.id) {
      notifyError({
        title: "Falta contexto de empresa",
        fact: "No hay una empresa seleccionada.",
        consequence: "Selecciona una empresa antes de procesar el texto.",
      });
      return;
    }
    if (!text.trim()) return;

    setIsProcessing(true);
    try {
      const result = await runPastedTextIntake({
        companyId: selectedCompanyId,
        userId: user.id,
        text,
        referenceDate: new Date().toISOString().slice(0, 10),
      });
      setBatchId(result.batchId);
      setCandidates(result.candidates);
      setNotices(result.notices);
      corrections.current = 0;

      logIntakeTelemetry(
        buildIntakeTelemetry({
          batchId: result.batchId,
          companyId: selectedCompanyId,
          source: result.source,
          candidates: result.candidates,
          sourceText: text,
        }),
      );

      if (result.candidates.length === 0) {
        notifyWarning({
          title: "No encontramos trabajos",
          fact: "El texto no contiene información suficiente para proponer un servicio.",
          consequence: "Nada fue creado. Ajusta el mensaje y vuelve a procesar.",
        });
      } else {
        notifyInfo({
          title: `Entendí ${result.candidates.length} ${result.candidates.length === 1 ? "servicio" : "servicios"}`,
          fact: "Son propuestas, todavía no existen como servicios.",
          consequence: "Revísalas abajo y decide cuáles se crean como borrador.",
        });
      }
    } catch (error) {
      notifyError({
        title: "No pudimos procesar el texto",
        fact: "La lectura del mensaje falló.",
        consequence: "No se creó ningún servicio. Puedes reintentar.",
        cause: error,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedCompanyId, user?.id, text]);

  const handlePatch = useCallback(
    (candidateId: string, patch: Partial<ServiceCandidate>) => {
      corrections.current += 1;
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? recomputeCandidate({ ...c, ...patch }) : c)),
      );
    },
    [],
  );

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

  const handleCreateDrafts = useCallback(
    async (ids: string[]) => {
      if (!selectedCompanyId || !user?.id || ids.length === 0) return;
      setIsCreating(true);
      try {
        // Reverificamos duplicados con el estado actual antes de escribir.
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

        if (batchId) {
          await closeServiceIntakeBatch(batchId, summarizeCandidates(next));
        }

        logIntakeTelemetry(
          buildIntakeTelemetry({
            batchId,
            companyId: selectedCompanyId,
            source: "pasted_text",
            candidates: next,
            humanCorrections: corrections.current,
            extractionFailures: blocked.length,
            sourceText: text,
          }),
        );

        if (created > 0 || reused > 0) {
          const understanding = buildUnderstanding(next);
          setSuccess({
            created,
            reusedClients: understanding.memory.some((m) => m.includes("cliente")) ? 1 : 0,
            reusedVenues: understanding.memory.some((m) => m.includes("venue")) ? 1 : 0,
            aliasesLearned: understanding.memory.filter((m) => m.includes("alias")).length,
          });
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
    [selectedCompanyId, user?.id, candidates, batchId, text, navigate],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardPaste className="h-4 w-4 text-primary" />
          WhatsApp / Texto
          <Badge variant="outline" className="ml-auto font-normal">
            No publica nada
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pégame lo que recibiste: un mensaje, una lista o un párrafo suelto. Yo identifico los
          servicios, clientes y venues, y no creo nada hasta que lo revises.
        </p>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          className="min-h-[160px] text-sm"
          aria-label="Texto pegado con los trabajos"
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            onClick={handleProcess}
            disabled={isProcessing || !text.trim()}
            className="min-h-11 w-full sm:w-auto"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            ✨ Analizar
          </Button>
          {candidates.length > 0 && (
            <Button
              variant="ghost"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => {
                setCandidates([]);
                setNotices([]);
                setBatchId(null);
                setSuccess(null);
              }}
            >
              Empezar de nuevo
            </Button>
          )}
        </div>

        <AnalyzingNarrative active={isProcessing} />

        {success && (
          <IntakeSuccessPanel
            summary={success}
            onViewDrafts={() => {
              const firstDate = candidates.find((c) => c.reviewStatus === "created")?.serviceDate;
              navigate(firstDate ? `/app/shifts?date=${firstDate}&view=week` : "/app/shifts");
            }}
            onStartOver={() => {
              setSuccess(null);
              setCandidates([]);
              setNotices([]);
              setBatchId(null);
              setText("");
            }}
          />
        )}

        {!isProcessing && !success && candidates.length > 0 && (
          <UnderstoodPanel candidates={candidates} />
        )}

        {globalNotices.length > 0 && (
          <ul className="space-y-1 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {globalNotices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}

        {candidates.length > 0 && (
          <ServiceIntakeReviewInbox
            companyId={selectedCompanyId}
            intakeSource="pasted_text"
            candidates={candidates}
            sourceLabel="texto pegado"
            noticesByCandidate={noticesByCandidate}
            onPatch={handlePatch}
            onConfirmMatch={handleConfirmMatch}
            onAccept={(ids) => setStatus(ids, "accepted")}
            onExclude={(ids) => setStatus(ids, "excluded")}
            onCreateDrafts={handleCreateDrafts}
            onViewDuplicate={(shiftId) => navigate(`/app/shift-ops?shiftId=${shiftId}`)}
            isBusy={isCreating}
          />
        )}
      </CardContent>
      {rememberDialog}
    </Card>
  );
}

export default PastedTextIntakePanel;
