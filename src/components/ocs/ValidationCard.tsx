/**
 * OX-4 — ValidationCard.
 * Responde: "¿Qué decisión debo tomar?"
 *
 * OX-4.4.1 — Centrada en la persona y la operación:
 *   Identidad (avatar + nombre) → Contexto (cliente · fecha · turno) →
 *   Decisión pendiente → Evidencia principal → Consecuencia →
 *   CTA principal → Historial, conversación y evidencia secundaria.
 *
 * Presentacional puro: no consulta, no muta, no calcula payroll.
 */
import * as React from "react";
import { Scale, ChevronDown, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MT, TAP, FOCUS_RING } from "@/lib/mobile/mobile-scale";
import { OperationalCard, type OcsAction } from "./OperationalCard";
import type { OcsDensity, OcsMode, OcsVariant } from "./tokens";
import type { StatusKey } from "@/lib/status/status-registry";

export interface ValidationEvidenceItem {
  label: string;
  value: React.ReactNode;
  /** Marca el dato que motiva la revisión. */
  attention?: boolean;
}

/** Persona sobre la que se decide. */
export interface ValidationCardPerson {
  name: string;
  avatarUrl?: string | null;
  role?: string | null;
}

/** Dato humano real ya registrado (quién envió, quién revisó, cuándo). */
export interface ValidationCardHumanNote {
  label: string;
  value: string;
}

/** Comentario ya existente en el propio flujo. No es un chat nuevo. */
export interface ValidationCardMessage {
  id: string;
  author: string;
  authorRole: string;
  body: string;
  at?: string | null;
}

export interface ValidationCardProps {
  /** Identidad: persona o turno. Nunca un código técnico. */
  title: string;
  subtitle?: string | null;
  /** Avatar e identidad de la persona implicada, cuando aplica. */
  person?: ValidationCardPerson | null;
  /** Decisión pendiente en una frase. Se lee en menos de 3 segundos. */
  headline?: string | null;
  /** Tipo de decisión y otros chips de contexto. */
  contextChips?: string[];
  status?: StatusKey | (string & {});
  statusLabel?: string;
  /** Evidencia que sostiene la decisión. */
  evidence?: ValidationEvidenceItem[];
  /** Evidencia de apoyo: siempre colapsada. */
  secondaryEvidence?: ValidationEvidenceItem[];
  /** Personas implicadas y última actualización. */
  humanContext?: ValidationCardHumanNote[];
  /** Comentarios ya registrados en el flujo (worker, supervisor, cliente). */
  conversation?: ValidationCardMessage[];
  /** Consecuencia de aprobar o rechazar. Obligatoria para decidir informado. */
  consequence: string;
  /** Decisión afirmativa. Única acción principal. */
  decision?: OcsAction;
  /** Decisiones alternativas (rechazar, ajustar, escalar). */
  alternatives?: OcsAction[];
  onClick?: () => void;
  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  className?: string;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function EvidenceGrid({ items }: { items: ValidationEvidenceItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-2 min-w-0">
          <dt className={cn(MT.caption, "text-muted-foreground truncate")}>{item.label}</dt>
          <dd
            className={cn(
              MT.body,
              "font-semibold tabular-nums shrink-0",
              item.attention && "text-status-warning",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ValidationCard({
  title,
  subtitle,
  person,
  headline,
  contextChips = [],
  status = "needs_review",
  statusLabel,
  evidence = [],
  secondaryEvidence = [],
  humanContext = [],
  conversation = [],
  consequence,
  decision,
  alternatives,
  onClick,
  variant = "standard",
  mode = "interactive",
  density = "auto",
  className,
}: ValidationCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const hasDetail =
    secondaryEvidence.length > 0 || humanContext.length > 0 || conversation.length > 0;

  return (
    <OperationalCard
      status={status}
      statusLabel={statusLabel}
      leading={
        person ? (
          <Avatar className="h-11 w-11">
            {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
            <AvatarFallback className={MT.caption}>{initials(person.name)}</AvatarFallback>
          </Avatar>
        ) : (
          <span
            aria-hidden
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"
          >
            <Scale className="h-4 w-4" />
          </span>
        )
      }
      title={title}
      subtitle={subtitle ?? undefined}
      context={
        contextChips.length > 0 || person?.role ? (
          <>
            {person?.role ? (
              <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5">
                {person.role}
              </span>
            ) : null}
            {contextChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5"
              >
                {chip}
              </span>
            ))}
          </>
        ) : undefined
      }
      primary={
        <div className="space-y-2.5">
          {headline ? (
            <p className={cn(MT.bodyStrong, "text-foreground")}>{headline}</p>
          ) : null}
          {evidence.length > 0 ? <EvidenceGrid items={evidence} /> : null}
          {conversation.length > 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 space-y-2">
              {conversation.slice(0, expanded ? conversation.length : 1).map((m) => (
                <div key={m.id} className="min-w-0">
                  <p className={cn(MT.caption, "text-muted-foreground")}>
                    <MessageSquare className="inline h-3 w-3 mr-1 -mt-px" aria-hidden />
                    {m.author} · {m.authorRole}
                  </p>
                  <p className={cn(MT.body, "text-foreground")}>{m.body}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      }
      secondary={consequence}
      action={decision}
      actions={alternatives}
      footer={
        hasDetail ? (
          <div className="pt-1">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className={cn(
                TAP,
                FOCUS_RING,
                MT.body,
                "w-full flex items-center justify-between gap-2 rounded-xl px-2 text-muted-foreground",
              )}
            >
              <span>{expanded ? "Ocultar detalle" : "Ver detalle e historial"}</span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
                aria-hidden
              />
            </button>
            {expanded ? (
              <div className="mt-2 space-y-3 border-t border-border/60 pt-3">
                {secondaryEvidence.length > 0 ? (
                  <EvidenceGrid items={secondaryEvidence} />
                ) : null}
                {humanContext.length > 0 ? (
                  <dl className="space-y-1">
                    {humanContext.map((n) => (
                      <div key={`${n.label}-${n.value}`} className="flex justify-between gap-2">
                        <dt className={cn(MT.caption, "text-muted-foreground")}>{n.label}</dt>
                        <dd className={cn(MT.caption, "text-foreground text-right")}>{n.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : undefined
      }
      onClick={onClick}
      variant={variant}
      mode={mode}
      density={density}
      className={className}
      aria-label={`Decisión pendiente: ${title}${headline ? ` — ${headline}` : ""}`}
    />
  );
}
