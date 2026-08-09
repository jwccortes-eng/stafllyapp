/**
 * Preparar semana para Connecteam
 * ================================
 *
 * Rediseño UX del puente Stafly → Connecteam. La pantalla no administra un
 * CSV: ayuda a preparar una semana de operación. Responde en segundos qué
 * sale, qué no sale, por qué y cómo resolverlo por lote.
 *
 * UI-only: mismo motor de exportación, mismo CSV, mismas reglas. No toca
 * payroll, time_entries, assignments ni scheduled_shifts.
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLog } from "@/hooks/useAuditLog";
import {
  needsProvisionalEnd,
  resolveProvisionalEnd,
  withProvisionalEnd,
  provisionalNote,
  buildProvisionalTrace,
  PROVISIONAL_COPY,
  type ProvisionalEndDecision,
} from "@/lib/integrations/connecteam-provisional";
import {
  getProvisionalSuggestion,
  rememberProvisionalUse,
} from "@/lib/integrations/connecteam-provisional-memory";
import {
  groupByCause,
  primaryCauseFor,
  causeShortLabel,
  type ExportCauseKey,
} from "@/lib/integrations/connecteam-export-groups";
import { ProvisionalEndPanel } from "./ProvisionalEndPanel";
import { ConnecteamMappingSheet } from "./ConnecteamMappingSheet";
import { connecteamSubjectsForShift } from "@/lib/integrations/connecteam-compat";
import { mappingKey, type MappingSubject } from "@/lib/integrations/connecteam-mapping";


import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, AlertTriangle, CheckCircle2, ShieldX, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  buildConnecteamRow,
  serializeConnecteamCsv,
  validateShiftForExport,
  effectiveAssignmentsForExport,
  bulkExportFilename,
  CSV_UTF8_BOM,
  countCsvDataRows,
  findDuplicateRowSignatures,
  type ValidationResult,
  type ConnecteamRow,
} from "@/lib/integrations/connecteam-export";
import { downloadCsv } from "@/lib/import-review/csv-export";
import type { Shift, Assignment, Employee, SelectOption } from "@/components/shifts/types";
import { useCanExportConnecteam, EXPORT_PERMISSION_DENIED_COPY } from "@/lib/integrations/connecteam-export-permission";
import { useConnecteamMapping } from "@/hooks/useConnecteamMapping";
import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shifts: Shift[];
  assignments: Assignment[];
  employees: Employee[];
  clients: SelectOption[];
  locations: SelectOption[];
  categories?: SelectOption[];
  selectedCompanyId: string | null;
  defaultTimezone?: string;
}

interface Row {
  shift: Shift;
  validation: ValidationResult;
  row: ConnecteamRow;
  assigned: number;
  openSlots: number;
  /** Hora final provisional aplicada solo a esta exportación ("" = ninguna). */
  provisionalEnd: string;
  cause: ExportCauseKey | null;
  clientName: string;
  ref: string;
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function shortDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return "—";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}`;
}

export function ExportConnecteamBulkDialog({
  open, onOpenChange, shifts, assignments, employees, clients, locations, categories,
  selectedCompanyId, defaultTimezone,
}: Props) {
  const canExport = useCanExportConnecteam();
  const { user } = useAuth();
  const { logAudit } = useAuditLog();

  const { mapping } = useConnecteamMapping();
  const buildCtx = useMemo(() => ({
    clients, locations, employees, assignments, categories, defaultTimezone, mapping,
  }), [clients, locations, employees, assignments, categories, defaultTimezone, mapping]);

  const [provisional, setProvisional] = useState<ProvisionalEndDecision | null>(null);

  const suggestion = useMemo(
    () => (open ? getProvisionalSuggestion(selectedCompanyId) : null),
    [open, selectedCompanyId],
  );

  /** Servicios cuya hora final todavía no existe en Stafly. */
  const pendingEnd = useMemo(
    () =>
      shifts
        .filter((s) => needsProvisionalEnd(s))
        .map((s) => ({ shift: s, ref: getShiftDisplayIdentity(s as any).primaryRef })),
    [shifts],
  );

  /**
   * Copia efectiva SOLO para el CSV: aplica la hora final provisional y deja
   * constancia en la nota. `scheduled_shifts` no se toca.
   */
  const effectiveShifts = useMemo(() => {
    return shifts.map((shift) => {
      if (!provisional || !needsProvisionalEnd(shift)) return { shift, provisionalEnd: "" };
      const end = resolveProvisionalEnd(shift, provisional);
      if (!end) return { shift, provisionalEnd: "" };
      const withEnd = withProvisionalEnd(shift, end);
      const note = provisionalNote(end, provisional);
      return {
        shift: {
          ...withEnd,
          notes: [withEnd.notes?.trim(), note].filter(Boolean).join(" · "),
        } as Shift,
        provisionalEnd: end,
      };
    });
  }, [shifts, provisional]);

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) map.set(c.id, c.name);
    return map;
  }, [clients]);

  const rows: Row[] = useMemo(() => {
    return effectiveShifts.map(({ shift, provisionalEnd }) => {
      const validation = validateShiftForExport(shift, buildCtx, {
        isAdmin: canExport,
        selectedCompanyId,
        shiftCompanyId: (shift as any).company_id ?? null,
      });
      const row = buildConnecteamRow(shift, buildCtx);
      const assigned = effectiveAssignmentsForExport(shift.id, assignments).length;
      const capacity = Number(shift.slots ?? 0);
      const openSlots = Math.max(0, capacity - assigned);
      const clientName = shift.client_id ? clientNameById.get(shift.client_id) ?? "" : "";
      return {
        shift,
        validation,
        row,
        assigned,
        openSlots,
        provisionalEnd,
        cause: primaryCauseFor(validation, { hasClient: !!clientName }),
        clientName: clientName || "Sin cliente",
        ref: getShiftDisplayIdentity(shift as any).primaryRef,
      };
    });
  }, [effectiveShifts, buildCtx, canExport, selectedCompanyId, assignments, clientNameById]);

  const summary = useMemo(() => {
    const total = rows.length;
    const exportable = rows.filter((r) => r.validation.status !== "blocked").length;
    return { total, exportable, attention: total - exportable };
  }, [rows]);

  const weekLabel = useMemo(() => {
    const dates = rows.map((r) => r.shift.date).filter(Boolean).sort();
    if (dates.length === 0) return "—";
    const first = shortDate(dates[0]);
    const last = shortDate(dates[dates.length - 1]);
    return first === last ? first : `${first} → ${last}`;
  }, [rows]);

  const groups = useMemo(
    () => groupByCause(rows.filter((r) => r.cause), (r) => r.cause),
    [rows],
  );
  const activeGroups = groups.filter((g) => g.items.length > 0);
  const singleCause = activeGroups.length === 1 ? activeGroups[0] : null;

  // ── Destino Connecteam pendiente ────────────────────────────────────────
  // Servicios bloqueados exclusivamente porque su cliente/lugar todavía no
  // tiene Job/Sub item declarado en ESTA compañía. Se resuelve una vez por
  // sujeto y se reutiliza; no se configura turno por turno.
  const [mappingOpen, setMappingOpen] = useState(false);

  const missingDestinationRows = useMemo(
    () => rows.filter((r) => r.cause === "missing_destination"),
    [rows],
  );

  /** Sujetos únicos (cliente/lugar/título) de los servicios sin destino. */
  const missingDestinationSubjects = useMemo(() => {
    const byKey = new Map<string, MappingSubject>();
    for (const r of missingDestinationRows) {
      for (const s of connecteamSubjectsForShift(r.shift, buildCtx)) {
        byKey.set(mappingKey(s.kind, s.id), s);
      }
    }
    return Array.from(byKey.values());
  }, [missingDestinationRows, buildCtx]);



  const duplicateCount = useMemo(() => {
    const exportable = rows.filter((r) => r.validation.status !== "blocked");
    return findDuplicateRowSignatures(exportable.map((r) => r.row)).length;
  }, [rows]);

  const handleDownload = () => {
    if (!canExport) {
      toast.error(EXPORT_PERMISSION_DENIED_COPY);
      return;
    }
    const exportable = rows.filter((r) => r.validation.status !== "blocked");
    if (exportable.length === 0) {
      toast.error("Todavía no hay servicios listos. Resuelve los datos pendientes y vuelve aquí.");
      return;
    }
    const csvBody = serializeConnecteamCsv(exportable.map((r) => r.row));
    const csv = CSV_UTF8_BOM + csvBody;
    const dataRows = countCsvDataRows(csv);
    const filename = bulkExportFilename();
    downloadCsv(filename, csv);

    if (provisional) {
      rememberProvisionalUse(selectedCompanyId, provisional);
      const traces = exportable
        .filter((r) => r.provisionalEnd)
        .map((r) =>
          buildProvisionalTrace({
            shift: r.shift,
            ref: r.ref,
            provisionalEnd: r.provisionalEnd,
            decision: provisional,
            confirmedBy: user?.id ?? null,
            batchRef: filename,
          }),
        );
      if (traces.length > 0) {
        void logAudit({
          action: "export",
          entityType: "connecteam_export",
          details: {
            batch_ref: filename,
            rows: dataRows,
            provisional_rows: traces.length,
            provisional: true,
            traces,
          },
        });
      }
    }

    toast.success(
      `Archivo listo — ${dataRows} servicio${dataRows === 1 ? "" : "s"} para Connecteam.`,
      {
        description: provisional
          ? PROVISIONAL_COPY.exportWarning
          : "Los servicios se siguen administrando desde Stafly.",
      },
    );
    onOpenChange(false);
  };

  const canDownload = canExport && summary.exportable > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border/30">
          <DialogTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Preparar semana para Connecteam
          </DialogTitle>
          <DialogDescription className="text-xs">
            Los servicios seguirán administrándose desde Stafly. Aquí solo prepararemos el archivo
            que Connecteam necesita.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5 space-y-4">
            {!canExport && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-xs text-destructive flex items-start gap-2">
                <ShieldX className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Sin permiso para exportar</p>
                  <p className="mt-0.5 opacity-90">{EXPORT_PERMISSION_DENIED_COPY}</p>
                </div>
              </div>
            )}

            {/* Resumen operativo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryTile label="Semana" text={weekLabel} />
              <SummaryTile label="Servicios seleccionados" value={summary.total} />
              <SummaryTile label="Listos" value={summary.exportable} tone="ok" />
              <SummaryTile
                label="Necesitan atención"
                value={summary.attention}
                tone={summary.attention > 0 ? "warn" : undefined}
              />
            </div>

            {summary.attention > 0 ? (
              <p className="text-xs text-muted-foreground">
                {summary.attention} necesitan un dato antes de exportarse. Los listos se exportan igual.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-earning" />
                Todos los servicios de esta semana están listos para Connecteam.
              </p>
            )}

            {/* Una sola causa → una sola tarjeta con resolución por lote */}
            {singleCause && singleCause.meta.key === "pending_end" ? (
              <ProvisionalEndPanel
                pending={pendingEnd}
                applied={provisional}
                onApply={setProvisional}
                onClear={() => setProvisional(null)}
                suggestion={suggestion}
              />
            ) : (
              activeGroups.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Qué falta
                  </p>
                  <div className="rounded-xl border border-border/30 divide-y divide-border/30 bg-card">
                    {groups.map((g) => (
                      <div
                        key={g.meta.key}
                        className="px-3 py-2.5 flex items-start gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground">{g.meta.label}</p>
                          <p className="text-muted-foreground mt-0.5">
                            {g.items.length} servicio{g.items.length === 1 ? "" : "s"}
                            {g.items.length > 0 && ` · ${g.meta.explanation}`}
                          </p>
                        </div>
                        {g.items.length > 0 && g.meta.batchActionLabel && (
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {g.meta.batchActionLabel} abajo
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {groups.some((g) => g.meta.key === "pending_end" && g.items.length > 0) && (
                    <ProvisionalEndPanel
                      pending={pendingEnd}
                      applied={provisional}
                      onApply={setProvisional}
                      onClear={() => setProvisional(null)}
                      suggestion={suggestion}
                    />
                  )}
                </div>
              )
            )}

            {/* Tabla operativa: QK · Cliente · Fecha · Estado · Problema */}
            {rows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Servicios de la semana
                </p>
                <div className="rounded-xl border border-border/30 divide-y divide-border/30 bg-card overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[92px_1fr_72px_150px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <span>QK</span>
                    <span>Cliente</span>
                    <span>Fecha</span>
                    <span>Estado</span>
                  </div>
                  {rows.slice(0, 40).map((r) => {
                    const ready = r.validation.status !== "blocked";
                    return (
                      <div
                        key={r.shift.id}
                        className="grid grid-cols-2 sm:grid-cols-[92px_1fr_72px_150px] gap-2 px-3 py-2 text-xs items-center"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">{r.ref}</span>
                        <span className="truncate text-foreground">{r.clientName}</span>
                        <span className="text-muted-foreground">{shortDate(r.shift.date)}</span>
                        <span
                          className={cn(
                            "flex items-center gap-1.5",
                            ready ? "text-earning" : "text-warning",
                          )}
                        >
                          {ready ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Listo{r.provisionalEnd ? " (hora provisional)" : ""}
                              </span>
                            </>
                          ) : (
                            <>
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{causeShortLabel(r.cause)}</span>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {rows.length > 40 && (
                  <p className="text-[10px] text-muted-foreground">…y {rows.length - 40} más.</p>
                )}
              </div>
            )}

            {duplicateCount > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3 text-xs text-warning flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    {duplicateCount} combinación{duplicateCount === 1 ? "" : "es"} de servicios idénticos
                  </p>
                  <p className="mt-0.5 opacity-90">
                    Connecteam fusiona turnos con la misma fecha, horario, título y Job: importaría
                    menos servicios de los que estás exportando. Diferencia el título o el horario.
                  </p>
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Preparar el archivo no publica servicios, no notifica a nadie y no cambia
              asignaciones, horas ni payroll.
            </p>
          </div>
        </ScrollArea>

        <DialogFooter className="p-4 border-t border-border/30 flex-row justify-end gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!canDownload}
            className="gap-1.5"
            title={!canExport ? EXPORT_PERMISSION_DENIED_COPY : !canDownload ? "Todavía no hay servicios listos" : undefined}
          >
            <Download className="h-3.5 w-3.5" />
            Descargar CSV ({summary.exportable})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({
  label, value, text, tone,
}: { label: string; value?: number; text?: string; tone?: "ok" | "warn" }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        tone === "ok" && "border-earning/30 bg-earning/5",
        tone === "warn" && "border-warning/30 bg-warning/5",
        !tone && "border-border/30 bg-muted/20",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-semibold text-foreground tabular-nums", text ? "text-sm" : "text-lg")}>
        {text ?? value}
      </p>
    </div>
  );
}
