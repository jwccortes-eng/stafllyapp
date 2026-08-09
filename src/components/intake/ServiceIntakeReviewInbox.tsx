/**
 * Bandeja de revisión canónica de Smart Service Intake.
 *
 * UNA sola bandeja para todos los canales (excel, csv, texto, imagen, pdf, audio).
 * No se crea una bandeja distinta por source y no se escribe en base de datos:
 * el componente emite intenciones y el contenedor llama al helper canónico.
 *
 * Semántica compartida mobile/desktop: cada candidato es un "trabajo detectado
 * por IA" con fecha protagonista, confianza humana y edición contextual.
 */

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { canCreateDraft, type ServiceCandidate } from "@/lib/intake/candidate";
import type { ConfidenceLevel, UnresolvedElement } from "@/lib/intake/visual-extraction";
import CandidateQuickEditSheet from "@/components/intake/CandidateQuickEditSheet";
import EntityResolutionSheet from "@/components/intake/EntityResolutionSheet";
import { confirmRef } from "@/lib/intake/entity-resolution";
import { CalendarDays, ChevronDown, Eye, Link2, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ServiceIntakeReviewInboxProps {
  candidates: ServiceCandidate[];
  /** Corrección rápida de un campo editable del candidato. */
  onPatch: (candidateId: string, patch: Partial<ServiceCandidate>) => void;
  /** Confirmación humana de una coincidencia sugerida (cliente o venue). */
  onConfirmMatch?: (candidateId: string, field: "client" | "venue") => void;
  onAccept: (candidateIds: string[]) => void;
  onExclude: (candidateIds: string[]) => void;
  /** CTA único: crear los Servicios draft de los candidatos seleccionados. */
  onCreateDrafts: (candidateIds: string[]) => void;
  isBusy?: boolean;
  /** Etiqueta del origen, sólo informativa. */
  sourceLabel?: string;
  /** Avisos por candidato (abreviación sugerida, fecha por confirmar…). */
  noticesByCandidate?: Record<string, string[]>;
  /** Abrir el servicio existente con el que podría duplicarse. */
  onViewDuplicate?: (shiftId: string) => void;
  /** Confianza por campo (HIGH/MEDIUM/LOW/MISSING) para orígenes visuales. */
  confidenceByCandidate?: Record<string, Record<string, ConfidenceLevel>>;
  /** Elementos detectados que necesitan revisión humana. Nunca se descartan. */
  unresolvedElements?: UnresolvedElement[];
  /** Ver la fuente original del candidato (texto, imagen, PDF o transcripción). */
  onReviewSource?: (candidateId: string) => void;
  /**
   * Ecosystem Intake Engine — resolución inline de cliente y lugar.
   * Con `companyId` presente, la bandeja ofrece buscar, vincular o crear
   * la entidad sin salir de la revisión. Nunca crea nada en silencio.
   */
  companyId?: string | null;
  /** Origen del intake, sólo para trazabilidad del aprendizaje por empresa. */
  intakeSource?: string;
}

const FIELD_LABELS: Record<string, string> = {
  date: "Fecha",
  service_date: "Fecha",
  venue: "Lugar",
  service_type: "Servicio",
  start_time: "Hora inicio",
  end_time: "Hora fin",
  client: "Cliente",
  client_confirmation: "Confirmar cliente",
  venue_confirmation: "Confirmar lugar",
  workers: "Personal",
  location: "Dirección",
};

const LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  HIGH: "alta",
  MEDIUM: "media",
  LOW: "baja",
  MISSING: "sin dato",
};

type FilterKey = "all" | "ready" | "needs_review" | "duplicates" | "created";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "ready", label: "Listos" },
  { key: "needs_review", label: "Necesitan revisión" },
  { key: "duplicates", label: "Duplicados" },
  { key: "created", label: "Creados" },
];

/** Un candidato es "listo" cuando la regla canónica permite crear el draft. */
function isReady(c: ServiceCandidate): boolean {
  return c.reviewStatus !== "created" && canCreateDraft(c).ok;
}

function needsReview(c: ServiceCandidate): boolean {
  return (
    c.reviewStatus !== "created" &&
    c.reviewStatus !== "excluded" &&
    !isReady(c)
  );
}

function matchesFilter(c: ServiceCandidate, filter: FilterKey): boolean {
  switch (filter) {
    case "ready":
      return isReady(c);
    case "needs_review":
      return needsReview(c);
    case "duplicates":
      return c.duplicateStatus !== "no_match";
    case "created":
      return c.reviewStatus === "created";
    default:
      return true;
  }
}

type HumanConfidence = "high" | "review" | "incomplete";

function humanConfidence(c: ServiceCandidate): HumanConfidence {
  if (c.missingFields.length > 0) return "incomplete";
  const values = Object.values(c.confidenceByField ?? {});
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 1;
  if (c.duplicateStatus !== "no_match") return "review";
  return avg >= 0.85 ? "high" : "review";
}

const CONFIDENCE_COPY: Record<HumanConfidence, string> = {
  high: "Alta confianza",
  review: "Revisar",
  incomplete: "Información incompleta",
};

function formatDate(value: string | null): { day: string; rest: string } {
  if (!value) return { day: "—", rest: "Fecha por confirmar" };
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return { day: value, rest: "" };
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = parsed
    .toLocaleDateString("es", { month: "short" })
    .replace(".", "")
    .toUpperCase();
  const weekday = parsed.toLocaleDateString("es", { weekday: "long" });
  return { day: `${day} ${month}`, rest: weekday };
}

function missingLabels(c: ServiceCandidate): string[] {
  return c.missingFields.map((f) => FIELD_LABELS[f] ?? f);
}

export function ServiceIntakeReviewInbox({
  candidates,
  onPatch,
  onConfirmMatch,
  onAccept,
  onExclude,
  onCreateDrafts,
  isBusy,
  sourceLabel,
  noticesByCandidate,
  onViewDuplicate,
  confidenceByCandidate,
  unresolvedElements,
  onReviewSource,
  companyId,
  intakeSource,
}: ServiceIntakeReviewInboxProps) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailIds, setDetailIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState<{ id: string; kind: "client" | "venue" } | null>(null);

  /**
   * Selección inicial: todo lo que ya está listo, nunca duplicados exactos.
   * Sólo corre cuando aparecen candidatos nuevos en la bandeja.
   */
  const knownIds = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected((prev) => {
      const alive = new Set(candidates.map((c) => c.id));
      const kept = prev.filter((id) => alive.has(id));
      const seeded = candidates
        .filter((c) => isReady(c) && c.duplicateStatus !== "exact_duplicate")
        .map((c) => c.id);
      return kept.length > 0 ? kept : seeded;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownIds]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (!matchesFilter(c, filter)) return false;
      if (!q) return true;
      return [
        c.clientCandidate.raw,
        c.venueCandidate.raw,
        c.serviceType ?? "",
        c.serviceDate ?? "",
        c.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [candidates, filter, search]);

  const counts = useMemo(
    () => ({
      ready: candidates.filter(isReady).length,
      needsReview: candidates.filter(needsReview).length,
      created: candidates.filter((c) => c.reviewStatus === "created").length,
      duplicates: candidates.filter((c) => c.duplicateStatus !== "no_match").length,
    }),
    [candidates],
  );

  /** Sólo se envía lo seleccionado que además sigue siendo creable. */
  const creatableSelected = useMemo(
    () => candidates.filter((c) => selected.includes(c.id) && isReady(c)).map((c) => c.id),
    [candidates, selected],
  );

  const allCreated = candidates.length > 0 && counts.ready === 0 && counts.created > 0;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleDetail = (id: string) =>
    setDetailIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAllValid = () =>
    setSelected(
      candidates
        .filter((c) => isReady(c) && c.duplicateStatus !== "exact_duplicate")
        .map((c) => c.id),
    );

  const editing = candidates.find((c) => c.id === editingId) ?? null;

  const handleCreate = () => {
    if (submitting || isBusy || creatableSelected.length === 0) return;
    setSubmitting(true);
    onCreateDrafts(creatableSelected);
  };

  useEffect(() => {
    if (!isBusy) setSubmitting(false);
  }, [isBusy]);

  const chips = (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {FILTERS.map((f) => {
        const count =
          f.key === "ready"
            ? counts.ready
            : f.key === "needs_review"
              ? counts.needsReview
              : f.key === "duplicates"
                ? counts.duplicates
                : f.key === "created"
                  ? counts.created
                  : candidates.length;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm transition-colors",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} · {count}
          </button>
        );
      })}
    </div>
  );

  const candidateCard = (c: ServiceCandidate) => {
    const date = formatDate(c.serviceDate);
    const level = humanConfidence(c);
    const created = c.reviewStatus === "created";
    const excluded = c.reviewStatus === "excluded";
    const missing = missingLabels(c);
    const showDetail = detailIds.includes(c.id);

    return (
      <Card
        key={c.id}
        className={cn(
          "space-y-3 p-4",
          created && "border-primary/40 bg-muted/30",
          excluded && "opacity-60",
        )}
      >
        <div className="flex items-start gap-3">
          {/* Área táctil de 44px alrededor del control de inclusión. */}
          <span className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center">
            <Checkbox
              className="h-6 w-6"
              checked={selected.includes(c.id)}
              disabled={created || excluded}
              onCheckedChange={() => toggle(c.id)}
              aria-label={`Incluir ${c.venueCandidate.raw || c.id}`}
            />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {date.day}
                  {date.rest ? <span className="normal-case">· {date.rest}</span> : null}
                </p>
                <p className="truncate text-base font-semibold">
                  {c.venueCandidate.raw || c.clientCandidate.raw || "Lugar sin identificar"}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {c.serviceType || "Tipo por confirmar"}
                </p>
              </div>
              <Badge
                variant={
                  level === "high" ? "secondary" : level === "review" ? "outline" : "destructive"
                }
                className="shrink-0"
              >
                {CONFIDENCE_COPY[level]}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Hora</p>
                <p className="font-medium">
                  {c.startTime
                    ? `${c.startTime}${c.endTime ? `–${c.endTime}` : ""}`
                    : "Por completar"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Personal</p>
                <p className="font-medium">{c.requestedWorkers ?? "Por completar"}</p>
              </div>
            </div>

            {missing.length > 0 && (
              <p className="text-sm text-destructive">Campos pendientes: {missing.join(", ")}</p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {created && <Badge variant="secondary">Borrador creado</Badge>}
              {excluded && <Badge variant="outline">Excluido</Badge>}
              {c.duplicateStatus === "exact_duplicate" && (
                <Badge variant="destructive">Ya existe</Badge>
              )}
              {c.duplicateStatus === "possible_duplicate" && (
                <Badge variant="outline">Posible duplicado</Badge>
              )}
              {c.venueCandidate.matchOrigin === "dictionary" && (
                <Badge variant="secondary">Aprendido: {c.venueCandidate.suggestedLabel}</Badge>
              )}
              {c.clientCandidate.matchOrigin === "dictionary" && (
                <Badge variant="secondary">Aprendido: {c.clientCandidate.suggestedLabel}</Badge>
              )}
            </div>

            {c.duplicateStatus !== "no_match" && c.duplicateShiftId && onViewDuplicate && (
              <Button
                size="sm"
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => onViewDuplicate(c.duplicateShiftId!)}
              >
                Ver servicio existente
              </Button>
            )}

            {c.clientCandidate.requiresConfirmation && c.clientCandidate.suggestedLabel && onConfirmMatch && (
              <Button
                variant="outline"
                className="min-h-11 w-full justify-start"
                onClick={() => onConfirmMatch(c.id, "client")}
              >
                Confirmar cliente: {c.clientCandidate.suggestedLabel}
              </Button>
            )}
            {c.venueCandidate.requiresConfirmation && c.venueCandidate.suggestedLabel && onConfirmMatch && (
              <Button
                variant="outline"
                className="min-h-11 w-full justify-start"
                onClick={() => onConfirmMatch(c.id, "venue")}
              >
                Confirmar lugar: {c.venueCandidate.suggestedLabel}
              </Button>
            )}

            {/* Ecosystem Intake Engine: buscar, vincular o crear sin salir. */}
            {companyId && !created && (
              <div className="flex flex-wrap gap-2">
                {!c.clientCandidate.resolvedId && (
                  <Button
                    variant="secondary"
                    className="min-h-11 flex-1 justify-start"
                    onClick={() => setResolving({ id: c.id, kind: "client" })}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Resolver cliente
                  </Button>
                )}
                {!c.locationCandidate.resolvedId && (
                  <Button
                    variant="secondary"
                    className="min-h-11 flex-1 justify-start"
                    onClick={() => setResolving({ id: c.id, kind: "venue" })}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Resolver lugar
                  </Button>
                )}
              </div>
            )}

            {c.duplicateStatus === "possible_duplicate" && c.reviewStatus !== "accepted" && !created && (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                onClick={() => onAccept([c.id])}
              >
                No es duplicado, crear igual
              </Button>
            )}

            {(noticesByCandidate?.[c.id]?.length ?? 0) > 0 && (
              <ul className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {noticesByCandidate![c.id].map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}

            {confidenceByCandidate?.[c.id] && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleDetail(c.id)}
                  className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", showDetail && "rotate-180")}
                  />
                  Detalle de confianza
                </button>
                {showDetail && (
                  <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Confianza por campo">
                    {Object.entries(confidenceByCandidate[c.id])
                      .filter(([field]) => FIELD_LABELS[field])
                      .map(([field, lvl]) => (
                        <span
                          key={field}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            lvl === "HIGH" && "border-primary/40 text-foreground",
                            lvl === "MEDIUM" && "border-border text-muted-foreground",
                            lvl === "LOW" && "border-destructive/40 text-destructive",
                            lvl === "MISSING" && "border-dashed border-border text-muted-foreground",
                          )}
                        >
                          {FIELD_LABELS[field]} · {LEVEL_LABELS[lvl]}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                className="min-h-11 flex-1"
                disabled={created}
                onClick={() => setEditingId(c.id)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>
              {onReviewSource && (
                <Button
                  variant="ghost"
                  className="min-h-11 flex-1"
                  onClick={() => onReviewSource(c.id)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Ver fuente
                </Button>
              )}
              <Button
                variant="ghost"
                className="min-h-11 flex-1 text-muted-foreground"
                disabled={created}
                onClick={() => onExclude([c.id])}
              >
                <X className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <section className="space-y-4" aria-label="Bandeja de revisión de intake">
      <div className="space-y-1">
        <p className="text-sm font-medium">Trabajos detectados</p>
        <p className="text-xs text-muted-foreground">
          {candidates.length} detectados{sourceLabel ? ` · ${sourceLabel}` : ""} · nada se crea sin
          tu confirmación
        </p>
      </div>

      {chips}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar lugar, tipo o fecha"
          className="h-11 w-full sm:w-64"
          aria-label="Buscar candidatos"
        />
        <Button variant="outline" className="min-h-11 sm:ml-auto" onClick={selectAllValid}>
          Seleccionar todos los válidos
        </Button>
        {!isMobile && (
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => onExclude(visible.filter((c) => selected.includes(c.id)).map((c) => c.id))}
          >
            Excluir selección
          </Button>
        )}
      </div>

      <div className={cn("space-y-3", !isMobile && "grid grid-cols-1 gap-3 space-y-0 xl:grid-cols-2")}>
        {visible.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No hay trabajos para este filtro.
          </p>
        )}
        {visible.map(candidateCard)}
      </div>

      {(unresolvedElements?.length ?? 0) > 0 && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="text-sm font-medium">Necesitan revisión ({unresolvedElements!.length})</p>
          <p className="text-xs text-muted-foreground">
            Detectamos estos elementos pero no pudimos convertirlos en un servicio. No se
            descartaron: decides tú.
          </p>
          <ul className="space-y-2">
            {unresolvedElements!.map((u) => (
              <li key={u.id} className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">{u.detectedText}</p>
                <p className="text-muted-foreground">{u.reason}</p>
                {u.suggestion && <p className="text-muted-foreground">Sugerencia: {u.suggestion}</p>}
                <p className="text-muted-foreground">
                  {[u.fileName, u.region.page ? `página ${u.region.page}` : null, u.region.label]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+5rem)] backdrop-blur sm:mx-0 sm:px-0 sm:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <p className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Vamos a
        </p>
        <p className="pb-2 text-xs text-muted-foreground">
          + Crear {creatableSelected.length}{" "}
          {creatableSelected.length === 1 ? "servicio en borrador" : "servicios en borrador"} · no
          se publica, no se asigna, no se notifica
        </p>
        <p className="pb-2 text-xs text-muted-foreground">
          {creatableSelected.length} seleccionados · {counts.needsReview} necesitan revisión
          {counts.created > 0 ? ` · ${counts.created} ya creados` : ""}
        </p>
        <Button
          className="h-14 w-full text-base"
          disabled={isBusy || submitting || creatableSelected.length === 0}
          onClick={handleCreate}
        >
          {allCreated
            ? "Lote procesado"
            : `Crear ${creatableSelected.length} ${creatableSelected.length === 1 ? "borrador" : "borradores"}`}
        </Button>
      </div>

      {companyId && resolving && (
        <EntityResolutionSheet
          open
          onOpenChange={(open) => { if (!open) setResolving(null); }}
          kind={resolving.kind}
          companyId={companyId}
          source={intakeSource}
          linkedClientId={candidates.find((c) => c.id === resolving.id)?.clientCandidate.resolvedId ?? null}
          raw={
            resolving.kind === "client"
              ? candidates.find((c) => c.id === resolving.id)?.clientCandidate.raw ?? ""
              : candidates.find((c) => c.id === resolving.id)?.venueCandidate.raw ?? ""
          }
          onResolved={(kind, entity) => {
            const target = candidates.find((c) => c.id === resolving.id);
            if (!target) return;
            if (kind === "client") {
              onPatch(target.id, {
                clientCandidate: confirmRef(target.clientCandidate, entity.id, entity.name),
              });
            } else {
              onPatch(target.id, {
                venueCandidate: confirmRef(target.venueCandidate, entity.id, entity.name),
                locationCandidate: confirmRef(target.locationCandidate, entity.id, entity.name),
              });
            }
            setResolving(null);
          }}
        />
      )}

      <CandidateQuickEditSheet
        candidate={editing}
        open={editingId !== null}
        onOpenChange={(open) => setEditingId(open ? editingId : null)}
        onSave={onPatch}
      />
    </section>
  );
}

export default ServiceIntakeReviewInbox;
