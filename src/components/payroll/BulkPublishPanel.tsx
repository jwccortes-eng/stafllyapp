/**
 * BulkPublishPanel — publicación múltiple controlada de recibos de pago.
 *
 * Flujo obligatorio: preview (solo lectura) → selección → confirmación → RPC
 * server-side → resultado. No existe "publicar todo" a ciegas.
 * El total mostrado es siempre `frozen_total_preview` (el que congelará el
 * servidor), nunca el desglose.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import {
  bulkMoney,
  bulkPublish,
  fetchBulkPreview,
  type BulkPreviewRow,
  type BulkPublishResult,
} from "@/lib/payroll/bulk-publish";

interface Props {
  periodId: string;
}

type FilterKey = "all" | "ready" | "published" | "blocked" | "override" | "no_portal";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "ready", label: "Listos" },
  { key: "published", label: "Publicados" },
  { key: "blocked", label: "Bloqueados" },
  { key: "override", label: "Con override" },
  { key: "no_portal", label: "Sin portal" },
];

export default function BulkPublishPanel({ periodId }: Props) {
  const [rows, setRows] = useState<BulkPreviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [result, setResult] = useState<BulkPublishResult | null>(null);

  const load = useCallback(async () => {
    if (!periodId) return;
    setLoading(true);
    try {
      const data = await fetchBulkPreview(periodId);
      setRows(data);
      setSelected(new Set());
    } catch (e: any) {
      notifyError({
        title: "No se pudo cargar la previsualización",
        fact: e?.message ?? "Error desconocido.",
        consequence: "No puedes publicar recibos hasta resolverlo.",
        cause: e,
      });
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const ready = rows.filter((r) => r.readiness === "ready");
    return {
      ready: ready.length,
      published: rows.filter((r) => r.readiness === "published").length,
      blocked: rows.filter((r) => r.readiness === "blocked").length,
      overrides: rows.filter((r) => r.has_override).length,
      noPortal: rows.filter((r) => !r.portal_access).length,
      pendingTotal: ready.reduce((s, r) => s + r.frozen_total_preview, 0),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.worker_name ?? ""} ${r.employer_identification ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case "ready":
          return r.readiness === "ready";
        case "published":
          return r.readiness === "published";
        case "blocked":
          return r.readiness === "blocked";
        case "override":
          return r.has_override;
        case "no_portal":
          return !r.portal_access;
        default:
          return true;
      }
    });
  }, [rows, search, filter]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.employee_id)),
    [rows, selected],
  );
  const selectedTotal = selectedRows.reduce((s, r) => s + r.frozen_total_preview, 0);
  const selectedOverrides = selectedRows.filter((r) => r.has_override).length;
  const selectedNoPortal = selectedRows.filter((r) => !r.portal_access).length;

  const toggle = (row: BulkPreviewRow) => {
    if (row.readiness !== "ready") return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(row.employee_id) ? next.delete(row.employee_id) : next.add(row.employee_id);
      return next;
    });
  };

  const selectReady = () => {
    setSelected(new Set(visible.filter((r) => r.readiness === "ready").map((r) => r.employee_id)));
  };

  const openConfirm = () => {
    if (selectedRows.length === 0) {
      notifyWarning({
        title: "No hay recibos seleccionados",
        fact: "Selecciona al menos un trabajador listo.",
        consequence: "No se publicó nada.",
      });
      return;
    }
    setConfirmChecked(false);
    setConfirmOpen(true);
  };

  const runPublish = async () => {
    if (!confirmChecked) return;
    setWorking(true);
    try {
      const res = await bulkPublish(periodId, selectedRows.map((r) => r.employee_id));
      setResult(res);
      setConfirmOpen(false);
      notifySuccess({
        title: `${res.published_count} recibo(s) publicado(s)`,
        fact: `Total congelado: ${bulkMoney(res.published_total)}. Omitidos: ${res.skipped_count}, bloqueados: ${res.blocked_count}, fallidos: ${res.failed_count}.`,
        consequence: "Los trabajadores con acceso al portal ya pueden verlos.",
      });
      await load();
    } catch (e: any) {
      notifyError({
        title: "No se publicaron los recibos",
        fact: e?.message ?? "Error desconocido.",
        consequence: "Ningún recibo cambió de estado.",
        cause: e,
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Publicación de recibos
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando previsualización…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este periodo no tiene pagos base ni movimientos para publicar.
          </p>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              <Kpi label="Listos" value={String(kpis.ready)} />
              <Kpi label="Publicados" value={String(kpis.published)} />
              <Kpi label="Bloqueados" value={String(kpis.blocked)} />
              <Kpi label="Overrides" value={String(kpis.overrides)} />
              <Kpi label="Sin portal" value={String(kpis.noPortal)} />
              <Kpi label="Pendiente por congelar" value={bulkMoney(kpis.pendingTotal)} />
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o Employer ID"
                className="h-9 w-full sm:w-64"
              />
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={filter === f.key ? "default" : "outline"}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="secondary" onClick={selectReady}>
                Seleccionar listos
              </Button>
            </div>

            {/* Lista (cards en móvil y escritorio, sin tabla horizontal) */}
            <div className="space-y-2">
              {visible.map((r) => (
                <RowCard
                  key={r.employee_id}
                  row={r}
                  checked={selected.has(r.employee_id)}
                  onToggle={() => toggle(r)}
                />
              ))}
              {visible.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin resultados para este filtro.</p>
              )}
            </div>

            {/* CTA sticky */}
            <div className="sticky bottom-0 -mx-6 mt-2 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-6 py-3 backdrop-blur">
              <div className="text-sm">
                <span className="font-semibold">{selectedRows.length}</span> seleccionado(s) ·{" "}
                <span className="font-mono font-semibold">{bulkMoney(selectedTotal)}</span>
              </div>
              <Button size="sm" onClick={openConfirm} disabled={working || selectedRows.length === 0}>
                {working ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Revisar y publicar
              </Button>
            </div>

            {result && (
              <div className="rounded-md border p-3 text-sm">
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Resultado de la publicación
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li>
                    Publicados: {result.published_count} ·{" "}
                    <span className="font-mono">{bulkMoney(result.published_total)}</span>
                  </li>
                  <li>Omitidos (ya publicados): {result.skipped_count}</li>
                  <li>Bloqueados: {result.blocked_count}</li>
                  <li>Fallidos: {result.failed_count}</li>
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publicar {selectedRows.length} recibo(s)</DialogTitle>
            <DialogDescription>
              El total se congela en el servidor. Esta acción no envía notificaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total a congelar</p>
              <p className="font-mono text-2xl font-semibold">{bulkMoney(selectedTotal)}</p>
            </div>
            <ul className="space-y-1 text-muted-foreground">
              <li>Con total aprobado externo: {selectedOverrides}</li>
              <li>Sin acceso al portal: {selectedNoPortal}</li>
              <li>Ya publicados (se omitirán): {kpis.published}</li>
              <li>Bloqueados (no incluidos): {kpis.blocked}</li>
            </ul>
            {selectedNoPortal > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {selectedNoPortal} trabajador(es) no verán el recibo hasta activar su acceso al
                portal. No se crean cuentas ni se envían invitaciones.
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirmChecked}
                onCheckedChange={(v) => setConfirmChecked(v === true)}
              />
              <span>Confirmo que revisé el total y los overrides.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={working}>
              Cancelar
            </Button>
            <Button onClick={runPublish} disabled={!confirmChecked || working}>
              {working ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}

function RowCard({
  row,
  checked,
  onToggle,
}: {
  row: BulkPreviewRow;
  checked: boolean;
  onToggle: () => void;
}) {
  const isReady = row.readiness === "ready";
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Checkbox checked={checked} disabled={!isReady} onCheckedChange={onToggle} className="mt-1" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{row.worker_name ?? "Sin nombre"}</p>
          {row.employer_identification && (
            <span className="text-xs text-muted-foreground">ID {row.employer_identification}</span>
          )}
          {row.readiness === "published" && <Badge>Publicado</Badge>}
          {row.readiness === "blocked" && <Badge variant="destructive">Bloqueado</Badge>}
          {row.has_override && <Badge variant="secondary">Total aprobado externo</Badge>}
          {!row.portal_access && <Badge variant="outline">Sin acceso al portal</Badge>}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
          <span>Base {bulkMoney(row.base)}</span>
          <span>Extras {bulkMoney(row.extras)}</span>
          <span>Descuentos −{bulkMoney(row.deductions)}</span>
          <span>Desglose {bulkMoney(row.computed_total)}</span>
        </div>
        {row.blocking_reason && (
          <p className="mt-1 text-xs text-destructive">{row.blocking_reason}</p>
        )}
      </div>
      <div className="text-right">
        <p className="text-[11px] text-muted-foreground">
          {row.readiness === "published" ? "Total congelado" : "Total a congelar"}
        </p>
        <p className="font-mono text-sm font-semibold">
          {bulkMoney(
            row.readiness === "published" && row.published_frozen_total !== null
              ? row.published_frozen_total
              : row.frozen_total_preview,
          )}
        </p>
      </div>
    </div>
  );
}
