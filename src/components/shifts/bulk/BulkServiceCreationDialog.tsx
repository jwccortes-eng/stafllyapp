import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays, ClipboardList, Copy, Link2, Loader2, Plus, Trash2, Users, Wand2, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { rankCatalogMatches } from "@/lib/intake/entity-linking";
import { SeriesPreviewDialog } from "@/components/shifts/series/SeriesPreviewDialog";
import {
  buildBulkPlan, buildBulkPreview, bulkResultMessage, bulkRowStatusLabel, duplicateBulkRow,
  newBulkBatchId, newBulkRow, parsePastedDates, summarizeBulkOutcomes, validateBulkRow,
  type BulkServiceRow,
} from "@/lib/shifts/bulk-service-creation";
import { createBulkDraftServices } from "@/lib/shifts/bulk-create-write";

interface CatalogItem { id: string; name: string; client_id?: string | null }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string | null;
  userId: string | null;
  clients: CatalogItem[];
  locations: CatalogItem[];
  /** Fecha visible en el calendario: sirve de referencia al pegar fechas. */
  referenceDate: string;
  onCreated?: () => void;
}

interface PersistedSession {
  batchId: string;
  rows: BulkServiceRow[];
}

const sessionKey = (companyId: string) => `stafly.bulk-service-creation.${companyId}`;

function readSession(companyId: string): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed?.batchId || !Array.isArray(parsed.rows)) return null;
    return { batchId: parsed.batchId, rows: parsed.rows.map((r) => newBulkRow(r)) };
  } catch {
    return null;
  }
}

function dayLabel(date: string) {
  if (!date) return "Sin fecha";
  try {
    return format(new Date(`${date}T12:00:00`), "EEE d MMM", { locale: es });
  } catch {
    return date;
  }
}

/** Campo de entidad con resolución existente: exacta → diccionario → fuzzy → humano. */
function EntityField({
  value, raw, catalog, placeholder, onQuickCreate, onChange,
}: {
  value: string | null;
  raw: string;
  catalog: CatalogItem[];
  placeholder: string;
  /** Alta rápida canónica (sólo clientes). */
  onQuickCreate?: (name: string) => void;
  onChange: (next: { id: string | null; raw: string }) => void;
}) {
  const [focused, setFocused] = useState(false);
  const linked = value ? catalog.find((c) => c.id === value) ?? null : null;
  const suggestions = useMemo(() => {
    if (linked || !raw.trim()) return [];
    return rankCatalogMatches(raw, catalog.map((c) => ({ id: c.id, name: c.name })));
  }, [linked, raw, catalog]);

  if (linked) {
    return (
      <div className="flex items-center gap-1 min-w-0">
        <Badge variant="secondary" className="max-w-full truncate gap-1">
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{linked.name}</span>
        </Badge>
        <Button
          variant="ghost" size="icon" className="h-6 w-6 shrink-0"
          onClick={() => onChange({ id: null, raw: linked.name })}
          aria-label="Desvincular"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <Input
        value={raw}
        placeholder={placeholder}
        className="h-8 text-xs"
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onChange={(e) => onChange({ id: null, raw: e.target.value })}
      />
      {focused && (suggestions.length > 0 || (onQuickCreate && raw.trim().length >= 2)) && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s.id}
              type="button"
              className="w-full px-2 py-1.5 text-left text-xs hover:bg-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange({ id: s.id, raw: s.label })}
            >
              <span className="font-medium">{s.label}</span>
              <span className="ml-1 text-[10px] text-muted-foreground">{s.reason}</span>
            </button>
          ))}
          {onQuickCreate && raw.trim().length >= 2 && (
            <button
              type="button"
              className="w-full border-t border-border/50 px-2 py-1.5 text-left text-xs font-semibold text-primary hover:bg-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onQuickCreate(raw.trim())}
            >
              Crear cliente “{raw.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}


export function BulkServiceCreationDialog({
  open, onOpenChange, companyId, userId, clients, locations, referenceDate, onCreated,
}: Props) {
  const [batchId, setBatchId] = useState(() => newBulkBatchId());
  const [rows, setRows] = useState<BulkServiceRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const hydrated = useRef(false);

  // Aplicar a selección
  const [applyClient, setApplyClient] = useState<{ id: string | null; raw: string }>({ id: null, raw: "" });
  const [applyLocation, setApplyLocation] = useState<{ id: string | null; raw: string }>({ id: null, raw: "" });
  const [applyStart, setApplyStart] = useState("");
  const [applyEnd, setApplyEnd] = useState("");
  const [applyHeadcount, setApplyHeadcount] = useState("");
  const [applyNotes, setApplyNotes] = useState("");

  // CLIENT TRUTH LAYER V1 — alta rápida de cliente sin salir del workspace.
  const [extraClients, setExtraClients] = useState<CatalogItem[]>([]);
  const [quickClient, setQuickClient] = useState<{ target: string; name: string } | null>(null);
  const clientCatalog = useMemo<CatalogItem[]>(() => {
    const seen = new Set(clients.map((c) => c.id));
    return [...clients, ...extraClients.filter((c) => !seen.has(c.id))];
  }, [clients, extraClients]);

  // Recuperación tras refresh antes de guardar: la sesión vive por empresa.
  useEffect(() => {
    if (!open || !companyId || hydrated.current) return;
    const found = readSession(companyId);
    if (found) {
      setBatchId(found.batchId);
      setRows(found.rows);
    } else {
      setBatchId(newBulkBatchId());
      setRows([newBulkRow({ date: referenceDate })]);
    }
    hydrated.current = true;
  }, [open, companyId, referenceDate]);

  useEffect(() => {
    if (!open) hydrated.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || !companyId || !hydrated.current) return;
    try {
      sessionStorage.setItem(sessionKey(companyId), JSON.stringify({ batchId, rows }));
    } catch { /* almacenamiento lleno o bloqueado: la vista sigue funcionando */ }
  }, [open, companyId, batchId, rows]);

  const clearSession = useCallback(() => {
    if (!companyId) return;
    try { sessionStorage.removeItem(sessionKey(companyId)); } catch { /* noop */ }
  }, [companyId]);

  const patchRow = (id: string, patch: Partial<BulkServiceRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((prev) => [...prev, newBulkRow({ date: prev[prev.length - 1]?.date || referenceDate })]);

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const duplicateRow = (id: string) =>
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0) return prev;
      const copy = duplicateBulkRow(prev[idx]);
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });

  const toggleSelected = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const targetIds = useMemo(
    () => (selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows).map((r) => r.id),
    [rows, selected],
  );

  const applyToSelection = (patch: Partial<BulkServiceRow>) =>
    setRows((prev) => prev.map((r) => (targetIds.includes(r.id) ? { ...r, ...patch } : r)));

  const copyWeek = () => {
    const source = rows.filter((r) => (selected.size > 0 ? selected.has(r.id) : true) && r.date);
    if (source.length === 0) return;
    const shifted = source.map((r) => {
      const d = new Date(`${r.date}T12:00:00`);
      d.setDate(d.getDate() + 7);
      return duplicateBulkRow({ ...r, date: d.toISOString().slice(0, 10) });
    });
    setRows((prev) => [...prev, ...shifted]);
  };

  const applyPastedDates = () => {
    const { dates, unparsed } = parsePastedDates(pasteText, referenceDate);
    if (dates.length === 0) {
      notifyWarning({
        title: "No reconocimos fechas",
        fact: "El texto pegado no contiene fechas legibles.",
        consequence: "No se agregó ninguna fila. Puedes escribirlas manualmente.",
      });
      return;
    }
    // La primera fila vacía sirve de plantilla para heredar contexto.
    const template = rows.find((r) => selected.has(r.id)) ?? rows[rows.length - 1] ?? newBulkRow();
    const created = dates.map((date) =>
      duplicateBulkRow({ ...template, date }),
    );
    setRows((prev) => {
      const base = prev.filter((r) => validateBulkRow(r).status !== "blocked" || r.date || r.title || r.clientRaw);
      return [...base, ...created];
    });
    setPasteText("");
    setPasteOpen(false);
    if (unparsed.length > 0) {
      notifyWarning({
        title: `${created.length} filas agregadas`,
        fact: `${unparsed.length} línea(s) no se pudieron leer como fecha.`,
        consequence: "Revísalas y agrégalas manualmente si hacen falta.",
      });
    }
  };

  const plan = useMemo(
    () => buildBulkPlan({ rows, batchId, companyId: companyId ?? "" }),
    [rows, batchId, companyId],
  );
  const preview = useMemo(() => buildBulkPreview(plan), [plan]);

  const handleConfirm = async () => {
    if (!companyId || !userId || submitting) return;
    setSubmitting(true);
    setProgress({ done: 0, total: plan.rows.length });
    const outcomes = await createBulkDraftServices(
      plan,
      { companyId, userId },
      (done, total) => setProgress({ done, total }),
    );
    const summary = summarizeBulkOutcomes(outcomes);
    setSubmitting(false);
    setProgress(null);

    if (summary.failed > 0) {
      notifyError({
        title: "Creación masiva incompleta",
        fact: bulkResultMessage(summary),
        consequence: "Las filas que fallaron siguen en la vista; reintentar no duplica lo ya creado.",
        cause: outcomes.filter((o) => o.status === "failed"),
      });
      const okIds = new Set(outcomes.filter((o) => o.status !== "failed").map((o) => o.rowId));
      setRows((prev) => prev.filter((r) => !okIds.has(r.id)));
      setPreviewOpen(false);
      onCreated?.();
      return;
    }

    notifySuccess({
      title: bulkResultMessage(summary),
      fact: "Cada Servicio nació como borrador con su propia referencia QK.",
      consequence: "Puedes completar pendientes y publicarlos cuando estén listos.",
    });
    clearSession();
    setRows([]);
    setSelected(new Set());
    setBatchId(newBulkBatchId());
    setPreviewOpen(false);
    onOpenChange(false);
    onCreated?.();
  };

  const readyCount = plan.rows.length;
  const blockedCount = plan.blocked.length;
  const incompleteCount = useMemo(
    () => rows.filter((r) => validateBulkRow(r).status === "incomplete").length,
    [rows],
  );
  const scopeLabel = selected.size > 0
    ? `${selected.size} fila${selected.size === 1 ? "" : "s"} seleccionada${selected.size === 1 ? "" : "s"}`
    : "todas las filas";

  const rowStatusBadge = (row: BulkServiceRow) => {
    const v = validateBulkRow(row);
    const variant = v.status === "ready" ? "default" : v.status === "incomplete" ? "secondary" : "destructive";
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={variant} className="text-[10px] whitespace-nowrap">
              {bulkRowStatusLabel(v.status)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-xs">
            {v.blockers.length > 0
              ? `Falta: ${v.blockers.join(", ")}`
              : v.pending.length > 0
                ? `Pendiente (no bloquea): ${v.pending.join(", ")}`
                : "Sin pendientes"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  /** Error inline por campo: la fila y el campo exactos, nunca "búscalo tú". */
  const fieldError = (row: BulkServiceRow, field: "date" | "identity") => {
    const v = validateBulkRow(row);
    if (field === "date" && v.blockers.includes("Fecha")) return "Falta la fecha";
    if (field === "identity" && v.blockers.some((b) => b.startsWith("Cliente"))) {
      return "Falta cliente, lugar o título";
    }
    return null;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
        <DialogContent
          className={cn(
            // Workspace operativo: usa el viewport, no una tarjeta centrada.
            "w-[96vw] max-w-[1800px] sm:max-w-[96vw] lg:max-w-[96vw] xl:max-w-[96vw]",
            "h-[94vh] max-h-[94vh] p-0 gap-0",
            "overflow-hidden flex flex-col sm:rounded-2xl",
          )}
        >
          {/* ── Header sticky ── */}
          <div className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/95 backdrop-blur px-5 py-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-primary" />
                Crear varios servicios
              </DialogTitle>
              <DialogDescription className="text-xs">
                Organiza varios trabajos y guárdalos como borradores. Lo que falte queda pendiente:
                no se inventa nada y no se publica nada.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" /> Agregar fila
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setPasteOpen(true)}>
                <CalendarDays className="h-3.5 w-3.5" /> Pegar fechas
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={copyWeek}>
                <Copy className="h-3.5 w-3.5" /> Copiar semana (+7 días)
              </Button>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {rows.length} fila{rows.length === 1 ? "" : "s"}
                {selected.size > 0 ? ` · ${selected.size} seleccionada${selected.size === 1 ? "" : "s"}` : ""}
              </span>
            </div>
          </div>

          {/* ── Cuerpo: scroll vertical interno del workspace ── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            {/* ── Aplicar a la selección ── */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" />
                  Aplicar a
                </p>
                <Badge variant={selected.size > 0 ? "default" : "secondary"} className="text-[10px]">
                  {scopeLabel}
                </Badge>
                {selected.size > 0 && (
                  <Button
                    variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                    onClick={() => setSelected(new Set())}
                  >
                    Quitar selección
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                <div className="lg:col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Cliente</Label>
                  <EntityField
                    value={applyClient.id}
                    raw={applyClient.raw}
                    catalog={clientCatalog}
                    placeholder="Imperial…"
                    onChange={setApplyClient}
                  />
                </div>
                <div className="lg:col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Lugar</Label>
                  <EntityField
                    value={applyLocation.id}
                    raw={applyLocation.raw}
                    catalog={locations}
                    placeholder="Salón, venue…"
                    onChange={setApplyLocation}
                  />
                </div>
                <div className="flex gap-1">
                  <div className="min-w-0 flex-1">
                    <Label className="text-[10px] text-muted-foreground">Inicio</Label>
                    <Input type="time" value={applyStart} className="h-8 text-xs" onChange={(e) => setApplyStart(e.target.value)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Label className="text-[10px] text-muted-foreground">Fin</Label>
                    <Input type="time" value={applyEnd} className="h-8 text-xs" onChange={(e) => setApplyEnd(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Personal</Label>
                  <Input
                    type="number" min={1} value={applyHeadcount} className="h-8 text-xs"
                    onChange={(e) => setApplyHeadcount(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={applyNotes}
                  placeholder="Notas para copiar a la selección"
                  className="h-8 text-xs"
                  onChange={(e) => setApplyNotes(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm" variant="secondary" className="h-8 text-xs"
                    onClick={() => applyToSelection({ clientId: applyClient.id, clientRaw: applyClient.raw })}
                    disabled={!applyClient.id && !applyClient.raw.trim()}
                  >
                    Cliente
                  </Button>
                  <Button
                    size="sm" variant="secondary" className="h-8 text-xs"
                    onClick={() => applyToSelection({ locationId: applyLocation.id, locationRaw: applyLocation.raw })}
                    disabled={!applyLocation.id && !applyLocation.raw.trim()}
                  >
                    Lugar
                  </Button>
                  <Button
                    size="sm" variant="secondary" className="h-8 text-xs"
                    onClick={() => applyToSelection({
                      ...(applyStart ? { startTime: applyStart } : {}),
                      ...(applyEnd ? { endTime: applyEnd } : {}),
                    })}
                    disabled={!applyStart && !applyEnd}
                  >
                    Horario
                  </Button>
                  <Button
                    size="sm" variant="secondary" className="h-8 text-xs"
                    onClick={() => applyToSelection({ headcount: applyHeadcount ? Number(applyHeadcount) : null })}
                    disabled={!applyHeadcount}
                  >
                    Personal
                  </Button>
                  <Button
                    size="sm" variant="secondary" className="h-8 text-xs"
                    onClick={() => applyToSelection({ notes: applyNotes })}
                    disabled={!applyNotes.trim()}
                  >
                    Notas
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Desktop: grilla amplia, cabecera sticky ── */}
            <div className="hidden md:block rounded-xl border border-border">
              <table className="w-full text-xs table-fixed">
                <colgroup>
                  <col className="w-10" />
                  <col className="w-[150px]" />
                  <col />
                  <col />
                  <col className="w-[110px]" />
                  <col className="w-[110px]" />
                  <col className="w-[96px]" />
                  <col />
                  <col className="w-[210px]" />
                  <col className="w-[90px]" />

                </colgroup>
                <thead className="sticky top-0 z-20 bg-muted/60 backdrop-blur">
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Seleccionar todas" /></th>
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Lugar</th>
                    <th className="px-2 py-2">Inicio</th>
                    <th className="px-2 py-2">Fin</th>
                    <th className="px-2 py-2">Personal</th>
                    <th className="px-2 py-2">Título</th>
                    <th className="px-2 py-2">Estado</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const v = validateBulkRow(row);
                    const dateError = fieldError(row, "date");
                    const identityError = fieldError(row, "identity");
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-t border-border/60 align-top",
                          v.status === "blocked" && "bg-destructive/5",
                        )}
                      >
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleSelected(row.id)} aria-label={`Seleccionar fila ${index + 1}`} />
                          </div>
                          <span className="mt-1 block text-[10px] text-muted-foreground">{index + 1}</span>
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="date" value={row.date}
                            className={cn("h-8 text-xs w-full", dateError && "border-destructive")}
                            onChange={(e) => patchRow(row.id, { date: e.target.value })}
                          />
                          {dateError && <p className="mt-1 text-[10px] text-destructive">{dateError}</p>}
                        </td>
                        <td className="px-2 py-2">
                          <EntityField value={row.clientId} raw={row.clientRaw} catalog={clientCatalog} onQuickCreate={(name) => setQuickClient({ target: row.id, name })} placeholder="Cliente"
                            onChange={(v2) => patchRow(row.id, { clientId: v2.id, clientRaw: v2.raw })} />
                          {identityError && <p className="mt-1 text-[10px] text-destructive">{identityError}</p>}
                        </td>
                        <td className="px-2 py-2">
                          <EntityField value={row.locationId} raw={row.locationRaw} catalog={locations} placeholder="Lugar"
                            onChange={(v2) => patchRow(row.id, { locationId: v2.id, locationRaw: v2.raw })} />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="time" value={row.startTime} className="h-8 text-xs w-full"
                            onChange={(e) => patchRow(row.id, { startTime: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="time" value={row.endTime} className="h-8 text-xs w-full"
                            onChange={(e) => patchRow(row.id, { endTime: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number" min={1} value={row.headcount ?? ""} placeholder="—"
                            className="h-8 text-xs w-full"
                            onChange={(e) => patchRow(row.id, { headcount: e.target.value ? Number(e.target.value) : null })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input value={row.title} placeholder="Tipo o título" className="h-8 text-xs w-full"
                            onChange={(e) => patchRow(row.id, { title: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">{rowStatusBadge(row)}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateRow(row.id)} aria-label="Duplicar fila">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRow(row.id)} aria-label="Eliminar fila">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile: una tarjeta por fila, sin scroll horizontal ── */}
            <div className="md:hidden space-y-3">
              {rows.map((row, index) => {
                const dateError = fieldError(row, "date");
                const identityError = fieldError(row, "identity");
                return (
                  <div key={row.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleSelected(row.id)} aria-label={`Seleccionar servicio ${index + 1}`} />
                        <span className="text-xs font-medium truncate">
                          Servicio {index + 1} · {dayLabel(row.date)}
                        </span>
                      </div>
                      {rowStatusBadge(row)}
                    </div>
                    <Input
                      type="date" value={row.date}
                      className={cn("h-10 text-xs", dateError && "border-destructive")}
                      onChange={(e) => patchRow(row.id, { date: e.target.value })}
                    />
                    {dateError && <p className="text-[11px] text-destructive">{dateError}</p>}
                    <EntityField value={row.clientId} raw={row.clientRaw} catalog={clientCatalog} onQuickCreate={(name) => setQuickClient({ target: row.id, name })} placeholder="Cliente"
                      onChange={(v2) => patchRow(row.id, { clientId: v2.id, clientRaw: v2.raw })} />
                    {identityError && <p className="text-[11px] text-destructive">{identityError}</p>}
                    <EntityField value={row.locationId} raw={row.locationRaw} catalog={locations} placeholder="Lugar"
                      onChange={(v2) => patchRow(row.id, { locationId: v2.id, locationRaw: v2.raw })} />
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="time" value={row.startTime} className="h-10 text-xs"
                        onChange={(e) => patchRow(row.id, { startTime: e.target.value })} />
                      <Input type="time" value={row.endTime} className="h-10 text-xs"
                        onChange={(e) => patchRow(row.id, { endTime: e.target.value })} />
                      <Input type="number" min={1} value={row.headcount ?? ""} placeholder="Personal" className="h-10 text-xs"
                        onChange={(e) => patchRow(row.id, { headcount: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <Input value={row.title} placeholder="Tipo o título" className="h-10 text-xs"
                      onChange={(e) => patchRow(row.id, { title: e.target.value })} />
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-9 text-xs gap-1" onClick={() => duplicateRow(row.id)}>
                        <Copy className="h-3.5 w-3.5" /> Duplicar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-9 text-xs gap-1 text-destructive" onClick={() => removeRow(row.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {rows.length === 0 && (
              <p className="py-10 text-center text-xs text-muted-foreground">
                Sin filas todavía. Agrega una o pega una lista de fechas.
              </p>
            )}
          </div>

          {/* ── Footer sticky ── */}
          <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur px-5 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {rows.length} fila{rows.length === 1 ? "" : "s"}
                </span>
                <span>{readyCount} lista{readyCount === 1 ? "" : "s"} para crear</span>
                {incompleteCount > 0 && <span>{incompleteCount} con pendientes</span>}
                {blockedCount > 0 && (
                  <span className="text-destructive">
                    {blockedCount} necesita{blockedCount === 1 ? "" : "n"} información
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline" className="min-h-[44px] flex-1 sm:flex-none"
                  onClick={() => onOpenChange(false)} disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  className="min-h-[44px] flex-1 sm:flex-none"
                  onClick={() => setPreviewOpen(true)}
                  disabled={readyCount === 0 || submitting || !companyId || !userId}
                >
                  Crear {readyCount} borrador{readyCount === 1 ? "" : "es"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* ── Pegar fechas ── */}
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pegar fechas</DialogTitle>
            <DialogDescription>
              Una fecha por línea (Aug 30, Sep 1…). Cada fecha crea una fila editable; nada se
              guarda todavía.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={9}
            placeholder={"Aug 30\nAug 31\nSep 1"}
            className="text-xs font-mono"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>Cancelar</Button>
            <Button onClick={applyPastedDates} disabled={!pasteText.trim()}>Agregar filas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Vista previa obligatoria (mismo diálogo que las series) ── */}
      <SeriesPreviewDialog
        open={previewOpen}
        onOpenChange={(v) => { if (!submitting) setPreviewOpen(v); }}
        preview={preview}
        routeLabel="Crear varios servicios"
        confirmLabel={
          progress
            ? `Creando ${progress.done}/${progress.total}…`
            : `Crear ${readyCount} borrador${readyCount === 1 ? "" : "es"}`
        }
        submitting={submitting}
        onConfirm={handleConfirm}
      />

      {/* ── Alta rápida canónica de cliente (sin duplicados silenciosos) ── */}
      <QuickCreateClientDialog
        open={quickClient !== null}
        onOpenChange={(v) => { if (!v) setQuickClient(null); }}
        companyId={companyId}
        initialName={quickClient?.name ?? ""}
        onResolved={(client) => {
          setExtraClients((prev) =>
            prev.some((c) => c.id === client.id) ? prev : [...prev, { id: client.id, name: client.name }]);
          const target = quickClient?.target;
          if (target) patchRow(target, { clientId: client.id, clientRaw: client.name });
          setQuickClient(null);
        }}
      />


      {submitting && (
        <div className={cn("fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-xl",
          "border border-border bg-card px-3 py-2 text-xs shadow-lg")}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Creando borradores {progress ? `${progress.done}/${progress.total}` : ""}
        </div>
      )}
    </>
  );
}
