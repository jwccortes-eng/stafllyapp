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
import { ProvisionalEndPanel } from "./ProvisionalEndPanel";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, AlertTriangle, CheckCircle2, ShieldX, Info } from "lucide-react";
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
import { ADMIN_LEX } from "@/lib/ox/lexicon";
import { useCanExportConnecteam, EXPORT_PERMISSION_DENIED_COPY } from "@/lib/integrations/connecteam-export-permission";
import { ExportStateBadges } from "./ExportStateBadges";
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
}

export function ExportConnecteamBulkDialog({
  open, onOpenChange, shifts, assignments, employees, clients, locations, categories,
  selectedCompanyId, defaultTimezone,
}: Props) {
  // Canonical, tenant-aware authorization — same policy on every entry point.
  const canExport = useCanExportConnecteam();
  // Mapping Job/Sub item declarado por ESTA compañía (fuente canónica).
  const { mapping } = useConnecteamMapping();
  const buildCtx = useMemo(() => ({
    clients, locations, employees, assignments, categories, defaultTimezone, mapping,
  }), [clients, locations, employees, assignments, categories, defaultTimezone, mapping]);

  // ── Dato provisional para Connecteam (NO cambia el Servicio) ────────────
  const [provisional, setProvisional] = useState<ProvisionalEndDecision | null>(null);

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
      return { shift, validation, row, assigned, openSlots, provisionalEnd };
    });
  }, [effectiveShifts, buildCtx, canExport, selectedCompanyId, assignments]);

  const summary = useMemo(() => {
    const total = rows.length;
    const ready = rows.filter(r => r.validation.status === "ready").length;
    const review = rows.filter(r => r.validation.status === "needs_review").length;
    const blocked = rows.filter(r => r.validation.status === "blocked").length;
    const assigned = rows.reduce((sum, r) => sum + r.assigned, 0);
    const open = rows.reduce((sum, r) => sum + r.openSlots, 0);
    const exportable = total - blocked;
    return { total, ready, review, blocked, assigned, open, exportable };
  }, [rows]);

  const warningRows = useMemo(
    () => rows.filter(r => r.validation.warnings.some(w => w.severity !== "info")),
    [rows],
  );

  // Colisiones: filas que Connecteam vería como el MISMO turno y fusionaría.
  const duplicateCount = useMemo(() => {
    const exportable = rows.filter(r => r.validation.status !== "blocked");
    return findDuplicateRowSignatures(exportable.map(r => r.row)).length;
  }, [rows]);

  const handleDownload = () => {
    if (!canExport) {
      toast.error(EXPORT_PERMISSION_DENIED_COPY);
      return;
    }
    const exportable = rows.filter(r => r.validation.status !== "blocked");
    if (exportable.length === 0) {
      toast.error("No hay turnos exportables. Revisa los bloqueos.");
      return;
    }
    const csvBody = serializeConnecteamCsv(exportable.map(r => r.row));
    const csv = CSV_UTF8_BOM + csvBody;
    const dataRows = countCsvDataRows(csv);
    const filename = bulkExportFilename();
    downloadCsv(filename, csv);

    // Trazabilidad: una entrada por fila exportada con dato provisional.
    if (provisional) {
      const traces = exportable
        .filter((r) => r.provisionalEnd)
        .map((r) =>
          buildProvisionalTrace({
            shift: r.shift,
            ref: getShiftDisplayIdentity(r.shift as any).primaryRef,
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
      `CSV descargado — ${dataRows} fila${dataRows === 1 ? "" : "s"} para ${exportable.length} ${ADMIN_LEX.EntityPlural.toLowerCase()}.`,
      {
        description: provisional
          ? PROVISIONAL_COPY.exportWarning
          : "Una fila por servicio. Verifica el mismo número en el Overview de Connecteam.",
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
            Exportar {ADMIN_LEX.EntityPlural} → Connecteam (.csv)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Exporta los turnos del rango/filtros actuales al formato oficial de importación de Connecteam.
            Read-only — no modifica turnos, asignaciones, time entries ni payroll.
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

            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryTile label="Turnos" value={summary.total} />
              <SummaryTile label="Empleados asignados" value={summary.assigned} />
              <SummaryTile label="Cupos abiertos" value={summary.open} />
              <SummaryTile label="Exportables" value={summary.exportable} tone={canDownload ? "ok" : "danger"} />
            </div>

            {/* Status breakdown */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <Badge variant="outline" className="gap-1 border-earning/40 text-earning">
                <CheckCircle2 className="h-3 w-3" /> {summary.ready} listos
              </Badge>
              <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
                <AlertTriangle className="h-3 w-3" /> {summary.review} para revisar
              </Badge>
              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                <ShieldX className="h-3 w-3" /> {summary.blocked} bloqueados
              </Badge>
            </div>

            {/* Lectura del lote: los incompletos NO bloquean a los listos. */}
            <p className="text-xs text-muted-foreground">
              {summary.total} seleccionados · {summary.exportable} listos para Connecteam ·{" "}
              {summary.blocked} necesitan completar. Se exportan sólo los listos.
            </p>



            {summary.blocked > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive flex items-start gap-2">
                <ShieldX className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  Los turnos bloqueados no se incluirán en el CSV. Resuélvelos (fecha/hora/título/permisos)
                  y vuelve a exportar cuando estén listos.
                </p>
              </div>
            )}

            {/* Estado Stafly vs estado Connecteam — un borrador completo sí exporta */}
            {rows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Estado por servicio
                </p>
                <ul className="rounded-xl border border-border/30 divide-y divide-border/30 bg-card">
                  {rows.slice(0, 30).map((r) => (
                    <li key={r.shift.id} className="px-3 py-2 text-xs">
                      <p className="font-medium text-foreground truncate">
                        <span className="font-mono text-[10px] text-muted-foreground mr-1.5">
                          {getShiftDisplayIdentity(r.shift as any).primaryRef}
                        </span>
                        {r.shift.date} · {r.shift.title || "Sin título"}
                      </p>

                      <ExportStateBadges
                        className="mt-1"
                        publicationStatus={(r.shift as any).publication_status}
                        status={r.validation.status}
                      />
                      {r.validation.status === "blocked" && (
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {r.validation.warnings
                            .filter((w) => w.severity === "block")
                            .map((w, i) => (
                              <li key={`${w.code}-${i}`}>· {w.message}</li>
                            ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                {rows.length > 30 && (
                  <p className="text-[10px] text-muted-foreground">…y {rows.length - 30} más.</p>
                )}
              </div>
            )}

            {duplicateCount > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3 text-xs text-warning flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    {duplicateCount} combinación{duplicateCount === 1 ? "" : "es"} de filas idénticas
                  </p>
                  <p className="mt-0.5 opacity-90">
                    Connecteam fusiona filas con la misma fecha, horario, título y Job:
                    importaría menos turnos de los que estás exportando. Diferencia el título
                    o el horario antes de importar.
                  </p>
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              El CSV genera una fila por servicio exportable. Exportar un borrador genera solo
              el CSV: no lo publica, no notifica a nadie y no cambia asignaciones, horas ni payroll.
            </p>



            {/* Warnings list — top 20 shifts with issues */}
            {warningRows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Advertencias · {warningRows.length} turno{warningRows.length === 1 ? "" : "s"}
                </p>
                <ul className="rounded-xl border border-border/30 divide-y divide-border/30 bg-card">
                  {warningRows.slice(0, 20).map((r) => {
                    const worst = r.validation.warnings.reduce<"info" | "warn" | "block">((acc, w) => {
                      if (w.severity === "block") return "block";
                      if (w.severity === "warn" && acc !== "block") return "warn";
                      return acc;
                    }, "info");
                    const Icon = worst === "block" ? ShieldX : worst === "warn" ? AlertTriangle : Info;
                    const tone = worst === "block"
                      ? "text-destructive"
                      : worst === "warn"
                      ? "text-warning"
                      : "text-muted-foreground";
                    return (
                      <li key={r.shift.id} className="px-3 py-2 text-xs">
                        <div className="flex items-start gap-2">
                          <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", tone)} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground truncate">
                              {r.shift.date} · {(r.shift.title || "Sin título")}
                            </p>
                            <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                              {r.validation.warnings
                                .filter(w => w.severity !== "info")
                                .slice(0, 3)
                                .map((w, i) => (
                                  <li key={`${w.code}-${i}`}>· {w.message}</li>
                                ))}
                            </ul>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {warningRows.length > 20 && (
                  <p className="text-[10px] text-muted-foreground">
                    …y {warningRows.length - 20} más. Descarga el CSV para revisar todo en Excel/Numbers.
                  </p>
                )}
              </div>
            )}

            <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
              <li>El CSV usa las 16 columnas oficiales del importador de Connecteam, en orden.</li>
              <li><strong>Users</strong> viaja vacío por default — Connecteam requiere identificadores exactos. Asigna workers dentro de Connecteam. <strong>Number of users</strong> mantiene los slots.</li>
              <li>Codificación UTF-8 con BOM — abre correctamente en Excel con acentos.</li>
              <li>Puente temporal: no reemplaza Stafly ni sincroniza payroll.</li>
            </ul>
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
            title={!canExport ? EXPORT_PERMISSION_DENIED_COPY : !canDownload ? "No hay turnos exportables" : undefined}
          >
            <Download className="h-3.5 w-3.5" />
            Descargar CSV ({summary.exportable})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: "ok" | "danger" }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        tone === "ok" && "border-earning/30 bg-earning/5",
        tone === "danger" && "border-destructive/30 bg-destructive/5",
        !tone && "border-border/30 bg-muted/20",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}
