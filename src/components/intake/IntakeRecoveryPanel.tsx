/**
 * Smart Intake — Operational Recovery Layer (superficie).
 *
 * Se muestra cuando el proveedor de IA falla. No es otra bandeja ni otro
 * pipeline: produce candidatos del MISMO modelo canónico y los entrega a la
 * bandeja de revisión compartida. Nada se crea aquí.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, RotateCcw, ListChecks } from "lucide-react";
import {
  describeOutcome,
  runStructuralRecovery,
  type IntakeSource,
  type RecoveryResult,
  type ServiceCandidate,
} from "@/lib/intake";
import type { ProviderFailureKind } from "@/lib/intake/recovery";

const FIELD_LABEL: Record<string, string> = {
  service_date: "Fecha",
  start_time: "Inicio",
  end_time: "Fin",
  venue: "Lugar / Job",
  client: "Cliente",
  location: "Dirección",
  workers: "Personal",
};

const STATE_LABEL: Record<string, string> = {
  detected: "detectado",
  approximate: "aproximado",
  confirmed: "confirmado",
  missing: "pendiente",
};

interface Props {
  companyId: string;
  source: IntakeSource;
  referenceDate: string;
  batchId: string | null;
  failureKind: ProviderFailureKind | null;
  /** Recuperación ya calculada por el orquestador (si hubo texto disponible). */
  recovery: RecoveryResult | null;
  onRecovered: (candidates: ServiceCandidate[]) => void;
  onRetry: () => void;
  onReset: () => void;
  isBusy?: boolean;
}

export function IntakeRecoveryPanel({
  companyId,
  source,
  referenceDate,
  batchId,
  failureKind,
  recovery,
  onRecovered,
  onRetry,
  onReset,
  isBusy,
}: Props) {
  const [manualText, setManualText] = useState("");
  const [manual, setManual] = useState<RecoveryResult | null>(null);

  const active = manual ?? recovery;
  const copy = useMemo(
    () =>
      describeOutcome(active?.outcome ?? "TECHNICAL_FAILURE_NO_EVIDENCE", {
        failureKind: failureKind ?? "unknown",
      }),
    [active?.outcome, failureKind],
  );

  const handleManual = () => {
    if (!manualText.trim() || !companyId) return;
    setManual(
      runStructuralRecovery({
        text: manualText,
        companyId, // SIEMPRE del contexto autenticado
        batchId,
        source,
        referenceDate,
        sourceReference: "recuperación estructural (escrito por la persona)",
        failureKind: failureKind ?? "unknown",
      }),
    );
  };

  const candidates = active?.candidates ?? [];

  return (
    <section
      className="space-y-4 rounded-lg border border-dashed border-border bg-muted/30 p-4"
      aria-label="Recuperación del análisis"
    >
      <header className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold leading-snug">{copy.title}</h3>
          <p className="text-xs text-muted-foreground">{copy.fact}</p>
          <p className="text-xs text-muted-foreground">{copy.consequence}</p>
        </div>
      </header>

      {candidates.length > 0 && (
        <div className="space-y-3">
          {candidates.map((c) => {
            const meta = active?.fieldMeta[c.id] ?? {};
            const values: Record<string, string | null> = {
              service_date: c.serviceDate,
              start_time: c.startTime,
              end_time: c.endTime,
              venue: c.venueCandidate.raw || null,
              client: c.clientCandidate.raw || null,
              location: c.locationCandidate.raw || null,
              workers: c.requestedWorkers != null ? String(c.requestedWorkers) : null,
            };
            return (
              <article key={c.id} className="rounded-md border border-border bg-background p-3">
                <ul className="space-y-1.5 text-sm">
                  {Object.entries(FIELD_LABEL).map(([field, label]) => {
                    const state = meta[field]?.state ?? (values[field] ? "detected" : "missing");
                    return (
                      <li key={field} className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="flex items-center gap-2 text-right">
                          <span className={values[field] ? "" : "text-muted-foreground"}>
                            {values[field] ?? "—"}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {STATE_LABEL[state]}
                          </Badge>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}

          {active?.recurrence && (
            <p className="text-xs text-muted-foreground">
              Recurrencia detectada: “{active.recurrence.raw}”
              {active.recurrence.times ? ` (${active.recurrence.times} veces)` : ""}. Se conserva como
              dato; las fechas se confirman contigo.
            </p>
          )}
        </div>
      )}

      {candidates.length === 0 && (
        <div className="space-y-2">
          <label htmlFor="recovery-text" className="text-xs text-muted-foreground">
            Escribe lo que muestra la fuente (fecha, horario, job, dirección). No inventamos nada:
            sólo leemos lo que escribas.
          </label>
          <Textarea
            id="recovery-text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={4}
            placeholder="Monday, Aug 10, 2026 · 4:00 PM - 9:00 PM · Job: ELUM FRANKLHALL"
          />
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 w-full sm:w-auto"
            onClick={handleManual}
            disabled={!manualText.trim()}
          >
            Buscar el turno en este texto
          </Button>
          {manual && manual.candidates.length === 0 && (
            <p className="text-xs text-muted-foreground">{manual.notices[0]}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {candidates.length > 0 && (
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => onRecovered(candidates)}
            disabled={isBusy}
          >
            <ListChecks className="mr-2 h-4 w-4" />
            Revisar lo encontrado
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          onClick={onRetry}
          disabled={isBusy}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reintentar análisis
        </Button>
        <Button type="button" variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={onReset}>
          Empezar de nuevo
        </Button>
      </div>
    </section>
  );
}

export default IntakeRecoveryPanel;
