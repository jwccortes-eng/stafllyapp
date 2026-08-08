/**
 * Bandeja de revisión canónica de Smart Service Intake.
 *
 * UNA sola bandeja para todos los canales (excel, csv, texto, imagen, pdf,
 * audio futuro). No se crea una bandeja distinta por source.
 *
 * Mobile: cards con editar / aceptar / excluir y un único CTA.
 * Desktop: revisión masiva con filtros, selección múltiple y corrección rápida.
 *
 * El componente NO escribe en base de datos: emite intenciones y el
 * contenedor llama al helper canónico `createDraftServicesFromCandidates`.
 */

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { canCreateDraft, type ServiceCandidate } from "@/lib/intake/candidate";
import { cn } from "@/lib/utils";

export interface ServiceIntakeReviewInboxProps {
  candidates: ServiceCandidate[];
  /** Corrección rápida de un campo editable del candidato. */
  onPatch: (candidateId: string, patch: Partial<ServiceCandidate>) => void;
  /** Confirmación humana de una coincidencia sugerida (cliente o venue). */
  onConfirmMatch?: (candidateId: string, field: "client" | "venue") => void;
  onAccept: (candidateIds: string[]) => void;
  onExclude: (candidateIds: string[]) => void;
  /** CTA único: crear los Servicios draft de los candidatos aceptados. */
  onCreateDrafts: (candidateIds: string[]) => void;
  isBusy?: boolean;
  /** Etiqueta del origen, sólo informativa. */
  sourceLabel?: string;
  /** Avisos por candidato (abreviación sugerida, fecha por confirmar…). */
  noticesByCandidate?: Record<string, string[]>;
  /** Abrir el servicio existente con el que podría duplicarse. */
  onViewDuplicate?: (shiftId: string) => void;
}

type FilterKey = "all" | "pending" | "needs_input" | "duplicates" | "accepted" | "created";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Por revisar" },
  { key: "needs_input", label: "Falta información" },
  { key: "duplicates", label: "Posibles duplicados" },
  { key: "accepted", label: "Aceptados" },
  { key: "created", label: "Creados" },
];

function matchesFilter(c: ServiceCandidate, filter: FilterKey): boolean {
  switch (filter) {
    case "pending":
      return c.reviewStatus === "pending";
    case "needs_input":
      return c.reviewStatus === "needs_input";
    case "duplicates":
      return c.duplicateStatus !== "no_match";
    case "accepted":
      return c.reviewStatus === "accepted";
    case "created":
      return c.reviewStatus === "created";
    default:
      return true;
  }
}

function StatusBadges({ c }: { c: ServiceCandidate }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {c.reviewStatus === "created" && <Badge variant="secondary">Draft creado</Badge>}
      {c.reviewStatus === "excluded" && <Badge variant="outline">Excluido</Badge>}
      {c.missingFields.length > 0 && (
        <Badge variant="destructive">Falta: {c.missingFields.join(", ")}</Badge>
      )}
      {c.duplicateStatus === "exact_duplicate" && <Badge variant="destructive">Ya existe</Badge>}
      {c.duplicateStatus === "possible_duplicate" && (
        <Badge variant="outline">Posible duplicado</Badge>
      )}
      {c.clientCandidate.requiresConfirmation && (
        <Badge variant="outline">
          Posible coincidencia: {c.clientCandidate.suggestedLabel}
        </Badge>
      )}
      {c.venueCandidate.requiresConfirmation && (
        <Badge variant="outline">
          Posible lugar: {c.venueCandidate.suggestedLabel}
        </Badge>
      )}
    </div>
  );
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
}: ServiceIntakeReviewInboxProps) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

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

  const readyIds = useMemo(
    () => candidates.filter((c) => c.reviewStatus === "accepted" && canCreateDraft(c).ok).map((c) => c.id),
    [candidates],
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const targetIds = selected.length > 0 ? selected : visible.map((c) => c.id);

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">Revisión de candidatos</p>
        <p className="text-xs text-muted-foreground">
          {candidates.length} candidatos{sourceLabel ? ` · origen ${sourceLabel}` : ""} · nada se
          crea sin tu confirmación
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente, lugar o fecha"
          className="h-9 w-full sm:w-56"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const rowEditor = (c: ServiceCandidate) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Input
        aria-label="Fecha del servicio"
        type="date"
        value={c.serviceDate ?? ""}
        onChange={(e) => onPatch(c.id, { serviceDate: e.target.value || null })}
        className="h-9"
      />
      <Input
        aria-label="Hora de inicio"
        type="time"
        value={c.startTime ?? ""}
        onChange={(e) => onPatch(c.id, { startTime: e.target.value || null })}
        className="h-9"
      />
      <Input
        aria-label="Hora de fin"
        type="time"
        value={c.endTime ?? ""}
        onChange={(e) => onPatch(c.id, { endTime: e.target.value || null })}
        className="h-9"
      />
      <Input
        aria-label="Personas requeridas"
        type="number"
        min={1}
        value={c.requestedWorkers ?? ""}
        onChange={(e) =>
          onPatch(c.id, { requestedWorkers: e.target.value ? Number(e.target.value) : null })
        }
        className="h-9"
      />
    </div>
  );

  const actions = (c: ServiceCandidate) => (
    <div className="flex flex-wrap items-center gap-2">
      {c.clientCandidate.requiresConfirmation && onConfirmMatch && (
        <Button size="sm" variant="outline" onClick={() => onConfirmMatch(c.id, "client")}>
          Confirmar cliente
        </Button>
      )}
      {c.venueCandidate.requiresConfirmation && onConfirmMatch && (
        <Button size="sm" variant="outline" onClick={() => onConfirmMatch(c.id, "venue")}>
          Confirmar lugar
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={c.reviewStatus === "created" || c.missingFields.length > 0}
        onClick={() => onAccept([c.id])}
      >
        Aceptar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={c.reviewStatus === "created"}
        onClick={() => onExclude([c.id])}
      >
        Excluir
      </Button>
    </div>
  );

  return (
    <section className="space-y-4" aria-label="Bandeja de revisión de intake">
      {header}

      {!isMobile && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <Checkbox
            checked={selected.length > 0 && selected.length === visible.length}
            onCheckedChange={(v) => setSelected(v ? visible.map((c) => c.id) : [])}
            aria-label="Seleccionar todos los visibles"
          />
          <span className="text-xs text-muted-foreground">
            {selected.length > 0 ? `${selected.length} seleccionados` : "Selección múltiple"}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onAccept(targetIds)}>
              Aceptar selección
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onExclude(targetIds)}>
              Excluir selección
            </Button>
          </div>
        </div>
      )}

      <div className={cn("space-y-3", !isMobile && "space-y-2")}>
        {visible.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No hay candidatos para este filtro.
          </p>
        )}

        {visible.map((c) => (
          <Card key={c.id} className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              {!isMobile && (
                <Checkbox
                  checked={selected.includes(c.id)}
                  onCheckedChange={() => toggle(c.id)}
                  aria-label={`Seleccionar ${c.clientCandidate.raw || c.id}`}
                />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="truncate text-sm font-medium">
                    {c.clientCandidate.raw || "Cliente sin identificar"}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {c.venueCandidate.raw || "Lugar sin identificar"}
                  </span>
                </div>
                <StatusBadges c={c} />
                {rowEditor(c)}
                {actions(c)}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {readyIds.length} listos para crear como borrador
        </p>
        <Button
          disabled={isBusy || readyIds.length === 0}
          onClick={() => onCreateDrafts(readyIds)}
        >
          Crear {readyIds.length} servicios en borrador
        </Button>
      </div>
    </section>
  );
}

export default ServiceIntakeReviewInbox;
