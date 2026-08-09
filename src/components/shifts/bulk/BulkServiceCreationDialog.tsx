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
import { ScrollArea } from "@/components/ui/scroll-area";
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
  value, raw, catalog, placeholder, onChange,
}: {
  value: string | null;
  raw: string;
  catalog: CatalogItem[];
  placeholder: string;
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
      {focused && suggestions.length > 0 && (
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

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Crear varios servicios
            </DialogTitle>
            <DialogDescription>
              Escribe las filas y créalas como borradores. Lo que falte queda pendiente: no se
              inventa nada y no se publica nada.
            </DialogDescription>
          </DialogHeader>

          {/* ── Acciones masivas ── */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
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

          {/* ── Aplicar a la selección ── */}
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5" />
              Aplicar a {selected.size > 0 ? `${selected.size} fila(s) seleccionadas` : "todas las filas"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <Label className="text-[10px] text-muted-foreground">Cliente</Label>
                <EntityField
                  value={applyClient.id}
                  raw={applyClient.raw}
                  catalog={clients}
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
                <div>
                  <Label className="text-[10px] text-muted-foreground">Inicio</Label>
                  <Input type="time" value={applyStart} className="h-8 text-xs" onChange={(e) => setApplyStart(e.target.value)} />
                </div>
                <div>
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

          <ScrollArea className="flex-1 min-h-0 -mx-2 px-2">
            {/* ── Desktop: grilla editable ── */}
            <table className="hidden md:table w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 py-2"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Seleccionar todas" /></th>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Cliente</th>
                  <th className="py-2">Lugar</th>
                  <th className="py-2">Inicio</th>
                  <th className="py-2">Fin</th>
                  <th className="py-2">Personal</th>
                  <th className="py-2">Título</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60 align-top">
                    <td className="py-1.5">
                      <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleSelected(row.id)} aria-label="Seleccionar fila" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input type="date" value={row.date} className="h-8 text-xs w-[140px]"
                        onChange={(e) => patchRow(row.id, { date: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[150px]">
                      <EntityField value={row.clientId} raw={row.clientRaw} catalog={clients} placeholder="Cliente"
                        onChange={(v) => patchRow(row.id, { clientId: v.id, clientRaw: v.raw })} />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[150px]">
                      <EntityField value={row.locationId} raw={row.locationRaw} catalog={locations} placeholder="Lugar"
                        onChange={(v) => patchRow(row.id, { locationId: v.id, locationRaw: v.raw })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input type="time" value={row.startTime} className="h-8 text-xs w-[110px]"
                        onChange={(e) => patchRow(row.id, { startTime: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input type="time" value={row.endTime} className="h-8 text-xs w-[110px]"
                        onChange={(e) => patchRow(row.id, { endTime: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        type="number" min={1} value={row.headcount ?? ""} placeholder="Pendiente"
                        className="h-8 text-xs w-[100px]"
                        onChange={(e) => patchRow(row.id, { headcount: e.target.value ? Number(e.target.value) : null })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[150px]">
                      <Input value={row.title} placeholder="Tipo o título" className="h-8 text-xs"
                        onChange={(e) => patchRow(row.id, { title: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2">{rowStatusBadge(row)}</td>
                    <td className="py-1.5">
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
                ))}
              </tbody>
            </table>

            {/* ── Mobile: una tarjeta por fila, sin scroll horizontal ── */}
            <div className="md:hidden space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleSelected(row.id)} aria-label="Seleccionar fila" />
                      <span className="text-xs font-medium truncate">{dayLabel(row.date)}</span>
                    </div>
                    {rowStatusBadge(row)}
                  </div>
                  <Input type="date" value={row.date} className="h-9 text-xs"
                    onChange={(e) => patchRow(row.id, { date: e.target.value })} />
                  <EntityField value={row.clientId} raw={row.clientRaw} catalog={clients} placeholder="Cliente"
                    onChange={(v) => patchRow(row.id, { clientId: v.id, clientRaw: v.raw })} />
                  <EntityField value={row.locationId} raw={row.locationRaw} catalog={locations} placeholder="Lugar"
                    onChange={(v) => patchRow(row.id, { locationId: v.id, locationRaw: v.raw })} />
                  <div className="grid grid-cols-3 gap-2">
                    <Input type="time" value={row.startTime} className="h-9 text-xs"
                      onChange={(e) => patchRow(row.id, { startTime: e.target.value })} />
                    <Input type="time" value={row.endTime} className="h-9 text-xs"
                      onChange={(e) => patchRow(row.id, { endTime: e.target.value })} />
                    <Input type="number" min={1} value={row.headcount ?? ""} placeholder="Personal" className="h-9 text-xs"
                      onChange={(e) => patchRow(row.id, { headcount: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <Input value={row.title} placeholder="Tipo o título" className="h-9 text-xs"
                    onChange={(e) => patchRow(row.id, { title: e.target.value })} />
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => duplicateRow(row.id)}>
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-destructive" onClick={() => removeRow(row.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {rows.length === 0 && (
              <p className="py-10 text-center text-xs text-muted-foreground">
                Sin filas todavía. Agrega una o pega una lista de fechas.
              </p>
            )}
          </ScrollArea>

          <DialogFooter className="border-t border-border pt-3">
            <div className="mr-auto text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Se crean como borradores. El personal pendiente no se completa solo.
              {plan.blocked.length > 0 && (
                <span className="text-destructive">
                  {" "}· {plan.blocked.length} fila(s) sin información obligatoria no se crearán.
                </span>
              )}
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cerrar
            </Button>
            <Button onClick={() => setPreviewOpen(true)} disabled={readyCount === 0 || submitting || !companyId || !userId}>
              Crear {readyCount} borrador{readyCount === 1 ? "" : "es"}
            </Button>
          </DialogFooter>
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
