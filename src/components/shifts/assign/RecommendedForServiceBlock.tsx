/**
 * ELDM Fase 1C — bloque reutilizable "Recomendados para este servicio".
 *
 * Presentacional puro: no asigna, no publica, no muta nada.
 * Muestra confianza (HIGH/MEDIUM/LOW), razones a favor, contradicciones,
 * disponibilidad y compliance operativo. El admin decide siempre.
 */
import * as React from "react";
import { UserPlus, Info, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MT } from "@/lib/mobile/mobile-scale";
import { WorkerCard } from "@/components/ocs";
import { Button } from "@/components/ui/button";
import type { StatusKey } from "@/lib/status/status-registry";
import type {
  ComplianceState,
  RecommendationSortMode,
  WorkerRecommendation,
  WorkerRecommendationResult,
} from "@/lib/eldm-recommendation";

const CONFIDENCE_STATUS: Record<WorkerRecommendation["confidence"], StatusKey> = {
  HIGH: "ready",
  MEDIUM: "warning",
  LOW: "pending",
};

const CONFIDENCE_HINT: Record<WorkerRecommendation["confidence"], string> = {
  HIGH: "Evidencia suficiente, reciente y consistente.",
  MEDIUM: "Evidencia útil con contradicciones o volumen limitado.",
  LOW: "Poca certeza contextual. No significa mal trabajador.",
};

const COMPLIANCE_TEXT: Record<ComplianceState, string> = {
  current: "Documentación vigente",
  missing: "Documentación faltante",
  expired: "Documentación vencida",
  blocked: "Bloqueado por cumplimiento",
  unknown: "Cumplimiento sin verificar",
};

const AVAILABILITY_TEXT: Record<WorkerRecommendation["availability"], string> = {
  available: "Disponibilidad confirmada",
  unavailable: "No disponible confirmado",
  unknown: "Disponibilidad sin confirmar",
};

const SORT_LABEL: Record<RecommendationSortMode, string> = {
  best_context: "Mejor contexto",
  venue_experience: "Experiencia en el lugar",
  availability: "Disponibilidad",
  acceptance_history: "Historial de aceptación",
  recent_outcomes: "Resultados recientes",
};

interface RecommendationRowProps {
  rec: WorkerRecommendation;
  onAdd?: (personId: string, name: string) => void;
  onViewContext?: (rec: WorkerRecommendation) => void;
  adding?: boolean;
}

function RecommendationRow({ rec, onAdd, onViewContext, adding }: RecommendationRowProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <WorkerCard
      name={rec.name}
      role={rec.role ?? undefined}
      status={rec.eligible ? CONFIDENCE_STATUS[rec.confidence] : "blocked"}
      statusLabel={rec.eligible ? rec.confidence : "No elegible"}
      blocker={rec.eligible ? null : rec.blockers.map((b) => b.text).join(" ")}
      recommendation={rec.eligible ? rec.headline : undefined}
      mode="interactive"
      action={
        rec.eligible && onAdd
          ? {
              label: "Agregar",
              icon: UserPlus,
              loading: adding,
              onClick: () => onAdd(rec.personId, rec.name),
              "aria-label": `Agregar a ${rec.name} a este servicio`,
            }
          : undefined
      }
      actions={
        onViewContext
          ? [
              {
                label: "Ver contexto",
                icon: Info,
                onClick: () => onViewContext(rec),
                "aria-label": `Ver contexto de ${rec.name}`,
              },
            ]
          : []
      }
      primary={
        <div className="space-y-1.5">
          <p className={cn(MT.caption, "text-muted-foreground")}>
            {AVAILABILITY_TEXT[rec.availability]} · {COMPLIANCE_TEXT[rec.compliance]}
          </p>
          {rec.supporting.length > 0 && (
            <ul className={cn(MT.caption, "space-y-0.5 text-muted-foreground")}>
              {rec.supporting.slice(0, 4).map((s) => (
                <li key={s.code}>· {s.text}</li>
              ))}
            </ul>
          )}
          {rec.contradicting.length > 0 && (
            <ul className={cn(MT.caption, "space-y-0.5 text-status-warning")}>
              {rec.contradicting.map((c) => (
                <li key={c.code}>· {c.text}</li>
              ))}
            </ul>
          )}
        </div>
      }
      footer={
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(MT.caption, "flex min-h-[44px] items-center gap-1 text-muted-foreground")}
            aria-expanded={open}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            ¿Por qué?
          </button>
          {open && (
            <div className={cn(MT.caption, "space-y-1 text-muted-foreground")}>
              <p>{CONFIDENCE_HINT[rec.confidence]}</p>
              <p>
                Experiencia: lugar {rec.venueExperience} · cliente {rec.clientExperience} · tipo de
                servicio {rec.serviceTypeExperience}
              </p>
              <p>
                Respuestas: aceptó {rec.acceptedCount} · rechazó {rec.rejectedCount}
              </p>
              {rec.lastRelevantActivityAt && (
                <p>Última actividad relevante: {rec.lastRelevantActivityAt.slice(0, 10)}</p>
              )}
            </div>
          )}
        </div>
      }
    />
  );
}

export interface RecommendedForServiceBlockProps {
  result: WorkerRecommendationResult;
  onAdd?: (personId: string, name: string) => void;
  onViewContext?: (rec: WorkerRecommendation) => void;
  onSortChange?: (sort: RecommendationSortMode) => void;
  addingPersonId?: string | null;
  className?: string;
}

export function RecommendedForServiceBlock({
  result,
  onAdd,
  onViewContext,
  onSortChange,
  addingPersonId,
  className,
}: RecommendedForServiceBlockProps) {
  const [showOthers, setShowOthers] = React.useState(false);
  const [showNotEligible, setShowNotEligible] = React.useState(false);

  return (
    <section className={cn("space-y-3", className)} aria-label="Recomendados para este servicio">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold">Recomendados para este servicio</h3>
        <p className={cn(MT.caption, "text-muted-foreground")}>
          El sistema sugiere con historial real. La decisión final es tuya.
        </p>
        {onSortChange && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(Object.keys(SORT_LABEL) as RecommendationSortMode[]).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={result.sort === mode ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => onSortChange(mode)}
              >
                {SORT_LABEL[mode]}
              </Button>
            ))}
          </div>
        )}
      </header>

      {result.recommended.length === 0 ? (
        <p className={cn(MT.caption, "text-muted-foreground")}>
          Todavía no hay historial suficiente para recomendar. Revisa la lista completa.
        </p>
      ) : (
        <div className="space-y-2">
          {result.recommended.map((rec) => (
            <RecommendationRow
              key={rec.personId}
              rec={rec}
              onAdd={onAdd}
              onViewContext={onViewContext}
              adding={addingPersonId === rec.personId}
            />
          ))}
        </div>
      )}

      {result.otherEligible.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            className={cn(MT.caption, "min-h-[44px] text-muted-foreground underline")}
            aria-expanded={showOthers}
          >
            Ver por qué no aparecen arriba ({result.otherEligible.length})
          </button>
          {showOthers &&
            result.otherEligible.map((rec) => (
              <div key={rec.personId} className="space-y-1">
                <RecommendationRow
                  rec={rec}
                  onAdd={onAdd}
                  onViewContext={onViewContext}
                  adding={addingPersonId === rec.personId}
                />
                {rec.notHighlightedReason && (
                  <p className={cn(MT.caption, "pl-1 text-muted-foreground")}>
                    {rec.notHighlightedReason}
                  </p>
                )}
              </div>
            ))}
        </div>
      )}

      {result.notEligible.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowNotEligible((v) => !v)}
            className={cn(MT.caption, "min-h-[44px] text-muted-foreground underline")}
            aria-expanded={showNotEligible}
          >
            No elegibles por regla operativa ({result.notEligible.length})
          </button>
          {showNotEligible &&
            result.notEligible.map((rec) => (
              <RecommendationRow key={rec.personId} rec={rec} onViewContext={onViewContext} />
            ))}
        </div>
      )}
    </section>
  );
}
