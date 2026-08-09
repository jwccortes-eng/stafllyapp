import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, AlertTriangle, CheckCircle2, Info, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CONNECTEAM_HEADERS,
  buildConnecteamRow,
  serializeConnecteamCsv,
  validateShiftForExport,
  exportFilename,
  type ConnecteamRow,
  type ValidationResult,
} from "@/lib/integrations/connecteam-export";
import { downloadCsv } from "@/lib/import-review/csv-export";
import type { Shift, Assignment, Employee, SelectOption } from "@/components/shifts/types";
import { useCanExportConnecteam, EXPORT_PERMISSION_DENIED_COPY } from "@/lib/integrations/connecteam-export-permission";
import { ExportStateBadges } from "./ExportStateBadges";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shift: Shift | null;
  assignments: Assignment[];
  employees: Employee[];
  clients: SelectOption[];
  locations: SelectOption[];
  categories?: SelectOption[];
  selectedCompanyId: string | null;
  shiftCompanyId?: string | null;
  defaultTimezone?: string;
}

const STATUS_META: Record<ValidationResult["status"], { label: string; tone: string; Icon: any }> = {
  ready:        { label: "Listo para exportar",      tone: "bg-earning/10 text-earning border-earning/30",       Icon: CheckCircle2 },
  needs_review: { label: "Revisar antes de exportar", tone: "bg-warning/10 text-warning border-warning/30",       Icon: AlertTriangle },
  blocked:      { label: "Bloqueado",                 tone: "bg-destructive/10 text-destructive border-destructive/30", Icon: ShieldX },
};

export function ExportConnecteamPreviewDialog({
  open, onOpenChange, shift, assignments, employees, clients, locations, categories,
  selectedCompanyId, shiftCompanyId, defaultTimezone,
}: Props) {
  // Canonical, tenant-aware authorization — same policy on every entry point.
  const canExport = useCanExportConnecteam();
  const buildCtx = useMemo(() => ({
    clients, locations, employees, assignments, categories, defaultTimezone,
  }), [clients, locations, employees, assignments, categories, defaultTimezone]);

  const validation: ValidationResult | null = useMemo(() => {
    if (!shift) return null;
    return validateShiftForExport(shift, buildCtx, { isAdmin: canExport, selectedCompanyId, shiftCompanyId });
  }, [shift, buildCtx, canExport, selectedCompanyId, shiftCompanyId]);

  const row: ConnecteamRow | null = useMemo(() => {
    if (!shift) return null;
    return buildConnecteamRow(shift, buildCtx);
  }, [shift, buildCtx]);

  const canDownload = canExport && validation?.status !== "blocked";

  const handleDownload = () => {
    if (!shift || !row || !canDownload) return;
    const csv = serializeConnecteamCsv([row]);
    downloadCsv(exportFilename(shift), csv);
    toast.success("CSV de Connecteam descargado.");
    onOpenChange(false);
  };

  if (!shift) return null;

  const meta = validation ? STATUS_META[validation.status] : null;
  const Icon = meta?.Icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border/30">
          <DialogTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportar a Connecteam
          </DialogTitle>
          <DialogDescription className="text-xs">
            Exporta este turno como CSV compatible con el template de importación de Connecteam.
            Connecteam sigue operativo temporalmente — esto es solo un puente, no una sincronización.
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

            {/* Status banner — Stafly vs Connecteam */}
            {meta && Icon && validation && (
              <div className={cn("rounded-xl border px-3.5 py-2.5 flex items-start gap-2.5", meta.tone)}>
                <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  <ExportStateBadges
                    className="mt-1"
                    publicationStatus={(shift as any).publication_status}
                    status={validation.status}
                  />
                  {validation.warnings.length === 0 && (
                    <p className="text-xs opacity-80 mt-0.5">Sin advertencias.</p>
                  )}
                </div>
              </div>
            )}


            {/* v1.2: Job/Sub item resolution badge */}
            {validation?.meta && (
              <div className="rounded-xl border border-border/30 bg-muted/20 px-3.5 py-2.5 text-xs space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">Job:</span>
                  <span>{validation.meta.job || <span className="italic text-muted-foreground">vacío</span>}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-semibold">Sub item:</span>
                  <span>{validation.meta.subItem || <span className="italic text-muted-foreground">vacío</span>}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {validation.meta.jobConfidence === "inferred" && (
                    <>
                      <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Regla beta</Badge>
                      {validation.meta.jobRuleId && (
                        <code className="text-[10px] text-muted-foreground">{validation.meta.jobRuleId}</code>
                      )}
                    </>
                  )}
                  {validation.meta.jobConfidence === "fallback" && (
                    <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Fallback — puede mostrar "Select" en Connecteam</Badge>
                  )}
                  {validation.meta.jobConfidence === "exact" && (
                    <Badge variant="outline" className="text-[10px] border-earning/40 text-earning">Hint explícito</Badge>
                  )}
                </div>
              </div>
            )}


            {/* Warnings */}
            {validation && validation.warnings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Advertencias
                </p>
                <ul className="space-y-1.5">
                  {validation.warnings.map((w, i) => {
                    const I = w.severity === "block" ? ShieldX : w.severity === "warn" ? AlertTriangle : Info;
                    const tone = w.severity === "block"
                      ? "text-destructive"
                      : w.severity === "warn"
                      ? "text-warning"
                      : "text-muted-foreground";
                    return (
                      <li key={`${w.code}-${i}`} className="flex items-start gap-2 text-xs">
                        <I className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", tone)} />
                        <span className="text-foreground/85">{w.message}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Preview — desktop: scrollable horizontal table; mobile-friendly: key/value list under sm: */}
            {row && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Preview · columnas Connecteam
                </p>

                {/* Mobile/vertical list */}
                <div className="sm:hidden rounded-xl border border-border/30 divide-y divide-border/30 bg-card">
                  {CONNECTEAM_HEADERS.map(h => (
                    <div key={h} className="px-3 py-2 flex items-start justify-between gap-3">
                      <span className="text-[11px] font-medium text-muted-foreground shrink-0">{h}</span>
                      <span className="text-[12px] text-foreground text-right break-words min-w-0">
                        {row[h] || <span className="text-muted-foreground/50 italic">vacío</span>}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block rounded-xl border border-border/30 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          {CONNECTEAM_HEADERS.map(h => (
                            <th key={h} className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-border/30">
                          {CONNECTEAM_HEADERS.map(h => (
                            <td key={h} className="px-2.5 py-1.5 align-top max-w-[180px]">
                              {row[h]
                                ? <span className="break-words">{row[h]}</span>
                                : <span className="text-muted-foreground/50 italic">vacío</span>}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
                  <li><strong>Users</strong>: no se exportan en v1.1 — asigna los workers dentro de Connecteam. <strong>Number of users</strong> mantiene la capacidad/slots del turno.</li>
                  <li><strong>Job</strong>: si Connecteam lo muestra como "Select", crea un Job con el mismo nombre exacto o configura un <em>connecteam_job_name</em> en el venue/cliente.</li>
                  <li><strong>Address</strong>: se prioriza la dirección física; el nombre del venue solo se usa como último recurso.</li>
                  <li>El número de turno legacy (<code>shift_code</code>) viaja únicamente en la columna Note como referencia. Las horas programadas no se usan para nómina — payroll depende solo de registros de reloj reales.</li>
                </ul>

              </div>
            )}
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
            title={!canDownload ? "Resuelve los bloqueos antes de descargar" : undefined}
          >
            <Download className="h-3.5 w-3.5" />
            Descargar CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
