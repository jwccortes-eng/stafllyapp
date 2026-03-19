import { useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useCompensationRules } from "@/hooks/useCompensation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  ChevronRight, ArrowLeft, Eye, Check, X as XIcon,
} from "lucide-react";
import { format } from "date-fns";
import {
  findPayrollSheet, detectColumns, parsePayrollRows, interpretPayrollRows,
  type InterpretedEntry, type DetectedColumns, type PayrollRow,
} from "@/lib/payroll-interpreter";
import * as XLSX from "xlsx";

type WizardStep = "upload" | "preview" | "interpret" | "review" | "done";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  hourly: { label: "Hora", color: "text-primary" },
  daily: { label: "Día", color: "text-earning" },
  ride: { label: "Ride", color: "text-accent-foreground" },
  manual_adjustment: { label: "Manual", color: "text-warning" },
  mixed: { label: "Mixto", color: "text-destructive" },
  unknown: { label: "Desconocido", color: "text-muted-foreground" },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendiente", variant: "outline" },
  processing: { label: "Procesando", variant: "secondary" },
  completed: { label: "Completado", variant: "default" },
  error: { label: "Error", variant: "destructive" },
};

export default function PayrollImportReviewTab() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { data: rules } = useCompensationRules();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>("upload");
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [sheetData, setSheetData] = useState<any[][]>([]);
  const [columns, setColumns] = useState<DetectedColumns | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [parsedRows, setParsedRows] = useState<PayrollRow[]>([]);
  const [interpreted, setInterpreted] = useState<InterpretedEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");

  const { data: employees } = useQuery({
    queryKey: ["employees-for-import", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, employee_role")
        .eq("company_id", selectedCompanyId!)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: existingProfiles } = useQuery({
    queryKey: ["comp-profiles-for-import", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("compensation_profiles")
        .select("employee_id, default_hourly_rate")
        .eq("company_id", selectedCompanyId!)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ["payroll-import-batches", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_import_batches")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("imported_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array" });
        setSheetNames(wb.SheetNames);
        const payrollSheet = findPayrollSheet(wb.SheetNames);
        if (payrollSheet) {
          setSelectedSheet(payrollSheet);
          const ws = wb.Sheets[payrollSheet];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          setSheetData(data);

          if (data.length > 0) {
            const headers = data[0].map((h: any) => String(h ?? ""));
            const cols = detectColumns(headers);
            setColumns(cols);
            setHeaderRow(0);
          }
        }
        setStep("preview");
      } catch (err) {
        toast.error("Error al leer el archivo");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleSelectSheet = (name: string) => {
    setSelectedSheet(name);
    // Re-read from file would require storing workbook — for now just use name
  };

  const runInterpretation = () => {
    if (!columns || !employees) return;
    const rows = parsePayrollRows(sheetData, columns, headerRow);
    setParsedRows(rows);

    const existingRates = new Map<string, number>();
    (existingProfiles ?? []).forEach(p => {
      if (p.default_hourly_rate) existingRates.set(p.employee_id, p.default_hourly_rate);
    });

    const result = interpretPayrollRows(rows, rules ?? [], employees, existingRates);
    setInterpreted(result);
    setStep("interpret");
  };

  const saveImport = async () => {
    if (!user || !selectedCompanyId) return;
    setSaving(true);
    try {
      // 1. Create batch
      const warnings = interpreted.filter(e => e.confidenceScore < 60 || e.interpretedPaymentType === "unknown").length;
      const { data: batch, error: batchErr } = await supabase
        .from("payroll_import_batches")
        .insert({
          company_id: selectedCompanyId,
          file_name: fileName,
          imported_by: user.id,
          status: "completed",
          total_rows: interpreted.length,
          processed_rows: interpreted.length,
          warnings_count: warnings,
          errors_count: 0,
        })
        .select("id")
        .single();
      if (batchErr) throw batchErr;

      // 2. Insert interpreted entries
      const entries = interpreted.map(e => ({
        import_batch_id: batch.id,
        company_id: selectedCompanyId,
        employee_id: e.matchedEmployeeId,
        raw_employee_name: e.rawEmployeeName,
        raw_total_amount: e.rawTotalAmount,
        interpreted_payment_type: e.interpretedPaymentType,
        detected_hourly_rate: e.detectedHourlyRate,
        detected_daily_units: e.detectedDailyUnits,
        detected_daily_full_days: e.detectedDailyFullDays,
        detected_daily_half_days: e.detectedDailyHalfDays,
        detected_ride_type: e.detectedRideType,
        detected_ride_amount: e.detectedRideAmount,
        detected_manual_adjustment: e.detectedManualAdjustment,
        confidence_score: e.confidenceScore,
        interpretation_notes: e.interpretationNotes,
        suggested_compensation_change: e.suggestedCompensationChange,
        week_start: weekStart || null,
        week_end: weekEnd || null,
        raw_row_payload_json: e.rawRowPayload,
      }));

      const { error: entryErr } = await supabase
        .from("payroll_interpreted_entries")
        .insert(entries as any);
      if (entryErr) throw entryErr;

      toast.success(`${interpreted.length} filas importadas correctamente`);
      qc.invalidateQueries({ queryKey: ["payroll-import-batches"] });
      setStep("done");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    }
    setSaving(false);
  };

  const resetWizard = () => {
    setStep("upload");
    setFileName("");
    setSheetNames([]);
    setSelectedSheet("");
    setSheetData([]);
    setColumns(null);
    setParsedRows([]);
    setInterpreted([]);
    setWeekStart("");
    setWeekEnd("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const confidenceBadge = (score: number) => {
    if (score >= 90) return <Badge variant="default" className="text-[10px]">{score}%</Badge>;
    if (score >= 60) return <Badge variant="secondary" className="text-[10px]">{score}%</Badge>;
    return <Badge variant="destructive" className="text-[10px]">{score}%</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-xs">
        {(["upload", "preview", "interpret", "review", "done"] as WizardStep[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <span className={`px-2 py-1 rounded-lg font-medium ${step === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i + 1}. {s === "upload" ? "Subir" : s === "preview" ? "Vista previa" : s === "interpret" ? "Interpretar" : s === "review" ? "Revisar" : "Listo"}
            </span>
            {i < 4 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-10 text-center">
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm font-medium mb-1">Importar archivo de nómina</p>
            <p className="text-xs text-muted-foreground mb-5">
              Sube un archivo Excel (.xlsx) con la hoja "payroll" para interpretar pagos automáticamente.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Seleccionar archivo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Vista previa: {fileName}
            </CardTitle>
            <CardDescription className="text-xs">
              Hoja detectada: <Badge variant="outline" className="text-[10px] ml-1">{selectedSheet}</Badge>
              {" · "}{sheetData.length} filas · Columnas detectadas:{" "}
              {columns && Object.entries(columns).filter(([, v]) => v !== null).map(([k]) => k.replace("Col", "")).join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sheetData.length > 0 && (
              <div className="overflow-x-auto max-h-[300px] rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(sheetData[0] ?? []).map((h: any, i: number) => (
                        <TableHead key={i} className="text-[10px] whitespace-nowrap">{String(h ?? `Col ${i}`)}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheetData.slice(1, 11).map((row, ri) => (
                      <TableRow key={ri}>
                        {(row ?? []).map((cell: any, ci: number) => (
                          <TableCell key={ci} className="text-xs py-1 whitespace-nowrap">{String(cell ?? "")}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Semana inicio</label>
                <Input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} className="h-8" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Semana fin</label>
                <Input type="date" value={weekEnd} onChange={e => setWeekEnd(e.target.value)} className="h-8" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetWizard}><ArrowLeft className="h-3 w-3 mr-1" /> Volver</Button>
              <Button size="sm" onClick={runInterpretation}>
                <ChevronRight className="h-3 w-3 mr-1" /> Interpretar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Interpret / Review */}
      {(step === "interpret" || step === "review") && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Resultados de interpretación</CardTitle>
            <CardDescription className="text-xs">
              {interpreted.length} filas interpretadas ·{" "}
              {interpreted.filter(e => e.confidenceScore >= 80).length} alta confianza ·{" "}
              {interpreted.filter(e => e.suggestedCompensationChange).length} cambios sugeridos ·{" "}
              {interpreted.filter(e => e.interpretedPaymentType === "unknown").length} desconocidos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Empleado</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Tarifa</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="text-center">Conf.</TableHead>
                    <TableHead className="text-center">Cambio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interpreted.map((e, i) => {
                    const tl = TYPE_LABELS[e.interpretedPaymentType] ?? TYPE_LABELS.unknown;
                    return (
                      <TableRow key={i} className={e.suggestedCompensationChange ? "bg-warning/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{e.rowIndex}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{e.rawEmployeeName}</div>
                          {e.matchedEmployeeId ? (
                            <span className="text-[10px] text-earning">✓ Emparejado</span>
                          ) : (
                            <span className="text-[10px] text-destructive">✗ Sin emparejar</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">${e.rawTotalAmount}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${tl.color}`}>{tl.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {e.detectedHourlyRate ? `$${e.detectedHourlyRate}/h` :
                           e.detectedDailyFullDays != null ? `${e.detectedDailyFullDays}F+${e.detectedDailyHalfDays ?? 0}H` :
                           e.detectedRideType ? `${e.detectedRideType}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={e.interpretationNotes}>
                          {e.interpretationNotes.split(" | ").slice(-1)[0]}
                        </TableCell>
                        <TableCell className="text-center">{confidenceBadge(e.confidenceScore)}</TableCell>
                        <TableCell className="text-center">
                          {e.suggestedCompensationChange ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-warning mx-auto" />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setStep("preview")}>
                <ArrowLeft className="h-3 w-3 mr-1" /> Volver
              </Button>
              <Button size="sm" onClick={saveImport} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                Guardar importación
              </Button>
              <Button variant="outline" size="sm" onClick={resetWizard}>
                <XIcon className="h-3 w-3 mr-1" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <Card className="rounded-2xl">
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-earning mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Importación completada</p>
            <p className="text-xs text-muted-foreground mb-4">
              {interpreted.length} filas procesadas de "{fileName}"
            </p>
            <Button size="sm" onClick={resetWizard}>Importar otro archivo</Button>
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Historial de importaciones</CardTitle>
          <CardDescription className="text-xs">Archivos de nómina importados y su estado</CardDescription>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></div>
          ) : !batches || batches.length === 0 ? (
            <EmptyState icon={FileSpreadsheet} title="Sin importaciones" description="Aún no se han importado archivos de nómina." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Procesados</TableHead>
                  <TableHead className="text-center">Warnings</TableHead>
                  <TableHead className="text-center">Errores</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b: any) => {
                  const sc = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium text-sm">{b.file_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(b.imported_at), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell className="text-center text-sm">{b.total_rows}</TableCell>
                      <TableCell className="text-center text-sm">{b.processed_rows}</TableCell>
                      <TableCell className="text-center">
                        {b.warnings_count > 0 ? <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">{b.warnings_count}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {b.errors_count > 0 ? <Badge variant="destructive" className="text-[10px]">{b.errors_count}</Badge> : "—"}
                      </TableCell>
                      <TableCell><Badge variant={sc.variant} className="text-[10px]">{sc.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
