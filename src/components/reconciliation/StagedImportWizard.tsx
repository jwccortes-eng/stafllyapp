import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Eye, Loader2 } from "lucide-react";
import { parseAnyFileToJson } from "@/lib/safe-xlsx";
import { hashRow, detectColumns, type ColumnMapping } from "@/lib/reconciliation-engine";
import { normalizeScheduleRows, normalizeClockRows, normalizePayrollRows } from "@/lib/reconciliation-normalizer";
import type { EmployeeRecord } from "@/lib/reconciliation-engine";

type SourceType = "schedule" | "clock" | "payroll";
type Step = "upload" | "preview" | "normalize" | "review" | "save";

interface Props {
  companyId: string | null;
  onComplete: () => void;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  schedule: "Turnos Programados",
  clock: "Fichajes (Clock In/Out)",
  payroll: "Nómina / Payroll",
};

export default function StagedImportWizard({ companyId, onComplete }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [sourceType, setSourceType] = useState<SourceType>("schedule");
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [normalizedRows, setNormalizedRows] = useState<any[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);

  const loadEmployees = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, email, external_id, connecteam_id")
      .eq("company_id", companyId);
    setEmployees((data || []).map((d: any) => ({ ...d, phone: d.phone_number })) as EmployeeRecord[]);
  }, [companyId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    try {
      const rows = await parseAnyFileToJson(f, { defval: "" });
      setRawRows(rows);
      if (rows.length > 0) {
        const mapping = detectColumns(Object.keys(rows[0]));
        setColumnMapping(mapping);
      }
      setStep("preview");
      await loadEmployees();
    } catch (err: any) {
      toast({ title: "Error parsing file", description: err.message, variant: "destructive" });
    }
  };

  const handleNormalize = () => {
    const rawWithIds = rawRows.map((r, i) => ({
      id: `temp-${i}`,
      row_number: i + 1,
      raw_data: r,
    }));

    let result: any;
    if (sourceType === "schedule") result = normalizeScheduleRows(rawWithIds, employees);
    else if (sourceType === "clock") result = normalizeClockRows(rawWithIds, employees);
    else result = normalizePayrollRows(rawWithIds, employees);

    setNormalizedRows(result.normalized);
    setWarnings(result.warnings);
    setErrors(result.errors);
    setStep("review");
  };

  const handleSave = async () => {
    if (!companyId || !user?.id || !file) return;
    setSaving(true);
    setProgress(10);

    try {
      // 1. Create batch
      const { data: batch, error: batchErr } = await supabase
        .from("import_batches" as any)
        .insert({
          company_id: companyId,
          source: sourceType,
          batch_type: `recon_${sourceType}`,
          status: "processing",
          created_by: user.id,
          schedule_file_name: sourceType === "schedule" ? file.name : null,
          timeclock_file_name: sourceType === "clock" ? file.name : null,
          payroll_file_name: sourceType === "payroll" ? file.name : null,
        } as any)
        .select("id")
        .single();

      if (batchErr) throw batchErr;
      const batchId = (batch as any).id;
      setProgress(25);

      // 2. Insert raw rows
      const rawTable = sourceType === "schedule" ? "raw_schedule_import_rows"
        : sourceType === "clock" ? "raw_clock_import_rows"
        : "raw_payroll_import_rows";

      const rawInserts = rawRows.map((r, i) => ({
        batch_id: batchId,
        company_id: companyId,
        row_number: i + 1,
        raw_data: r,
        row_hash: hashRow(r),
      }));

      // Insert in chunks of 100
      for (let i = 0; i < rawInserts.length; i += 100) {
        const chunk = rawInserts.slice(i, i + 100);
        const { error } = await supabase.from(rawTable as any).insert(chunk as any);
        if (error) throw error;
        setProgress(25 + ((i / rawInserts.length) * 25));
      }
      setProgress(50);

      // 3. Fetch raw rows with IDs
      const { data: savedRaw } = await supabase
        .from(rawTable as any)
        .select("id, row_number, raw_data")
        .eq("batch_id", batchId)
        .order("row_number");
      setProgress(60);

      // 4. Normalize and insert
      const normTable = sourceType === "schedule" ? "normalized_schedule_rows"
        : sourceType === "clock" ? "normalized_clock_rows"
        : "normalized_payroll_rows";

      let normResult: any;
      const rawForNorm = (savedRaw || []).map((r: any) => ({
        id: r.id, row_number: r.row_number, raw_data: r.raw_data,
      }));

      if (sourceType === "schedule") normResult = normalizeScheduleRows(rawForNorm, employees);
      else if (sourceType === "clock") normResult = normalizeClockRows(rawForNorm, employees);
      else normResult = normalizePayrollRows(rawForNorm, employees);

      const normInserts = normResult.normalized.map((n: any) => ({
        ...n,
        batch_id: batchId,
        company_id: companyId,
      }));

      for (let i = 0; i < normInserts.length; i += 100) {
        const chunk = normInserts.slice(i, i + 100);
        const { error } = await supabase.from(normTable as any).insert(chunk as any);
        if (error) throw error;
        setProgress(60 + ((i / normInserts.length) * 25));
      }
      setProgress(85);

      // 5. Create exceptions for unmatched employees
      const unmatched = normResult.normalized.filter((n: any) => !n.matched_employee_id);
      if (unmatched.length > 0) {
        const exceptions = unmatched.map((n: any) => ({
          company_id: companyId,
          batch_id: batchId,
          exception_type: n.has_conflict ? "ambiguous_employee" : "unknown_employee",
          severity: n.has_conflict ? "medium" : "high",
          source_type: sourceType,
          description: `No match for "${n.employee_name_raw}" (method: ${n.employee_match_method})`,
          source_data: { name: n.employee_name_raw, phone: n.employee_phone, email: n.employee_email },
          status: "open",
        }));
        await supabase.from("reconciliation_exceptions" as any).insert(exceptions as any);
      }

      // 6. Update batch status
      await supabase.from("import_batches" as any)
        .update({ status: "completed" } as any)
        .eq("id", batchId);

      setProgress(100);
      setStep("save");
      toast({
        title: "Import completado",
        description: `${rawRows.length} filas importadas, ${unmatched.length} sin emparejar.`,
      });
      onComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setFile(null);
    setRawRows([]);
    setNormalizedRows([]);
    setWarnings([]);
    setErrors([]);
    setStep("upload");
    setProgress(0);
  };

  const matchedCount = normalizedRows.filter(r => r.matched_employee_id).length;
  const unmatchedCount = normalizedRows.filter(r => !r.matched_employee_id).length;
  const ambiguousCount = normalizedRows.filter(r => r.has_conflict).length;

  return (
    <div className="space-y-4">
      {/* Source type selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tipo de Archivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={sourceType} onValueChange={(v) => { setSourceType(v as SourceType); reset(); }}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 text-sm text-muted-foreground">
              {["upload", "preview", "normalize", "review", "save"].map((s, i) => (
                <Badge key={s} variant={step === s ? "default" : "outline"} className="text-xs">
                  {i + 1}. {s === "upload" ? "Subir" : s === "preview" ? "Vista previa" : s === "normalize" ? "Normalizar" : s === "review" ? "Revisar" : "Guardar"}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card>
          <CardContent className="py-12">
            <label className="flex flex-col items-center justify-center gap-3 cursor-pointer border-2 border-dashed border-border rounded-lg p-12 hover:border-primary/50 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Arrastra o selecciona un archivo Excel, CSV o TXT
              </span>
              <input type="file" accept=".xlsx,.xls,.csv,.txt,.tsv" className="hidden" onChange={handleFileSelect} />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Step: Preview */}
      {step === "preview" && rawRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Vista Previa: {file?.name}
              <Badge variant="secondary">{rawRows.length} filas</Badge>
            </CardTitle>
            <CardDescription>
              Columnas detectadas: {Object.entries(columnMapping).filter(([, v]) => v).map(([k, v]) => `${k}→"${v}"`).join(", ") || "Ninguna auto-detectada"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    {Object.keys(rawRows[0]).slice(0, 8).map(h => (
                      <TableHead key={h} className="text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawRows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      {Object.keys(rawRows[0]).slice(0, 8).map(h => (
                        <TableCell key={h} className="text-xs max-w-32 truncate">{row[h]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={handleNormalize}>
                <ArrowRight className="h-4 w-4 mr-1" /> Normalizar & Emparejar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado de Normalización</CardTitle>
            <CardDescription className="flex gap-3 mt-2">
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> {matchedCount} emparejados
              </Badge>
              {ambiguousCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {ambiguousCount} ambiguos
                </Badge>
              )}
              {unmatchedCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  {unmatchedCount} sin match
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {warnings.length > 0 && (
              <div className="mb-4 p-3 bg-accent/50 border border-accent rounded-md text-sm space-y-1">
                {warnings.slice(0, 10).map((w, i) => (
                  <div key={i} className="text-muted-foreground">⚠ {w}</div>
                ))}
                {warnings.length > 10 && <div className="text-muted-foreground">...y {warnings.length - 10} más</div>}
              </div>
            )}

            {errors.length > 0 && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm space-y-1">
                {errors.map((e, i) => (
                  <div key={i} className="text-destructive">✕ {e}</div>
                ))}
              </div>
            )}

            <div className="max-h-72 overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Empleado (Raw)</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Confianza</TableHead>
                    <TableHead>Fecha</TableHead>
                    {sourceType === "payroll" && <TableHead>Tipo Pago</TableHead>}
                    {sourceType === "payroll" && <TableHead>Total</TableHead>}
                    {sourceType !== "payroll" && <TableHead>Horas</TableHead>}
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {normalizedRows.slice(0, 20).map((row, i) => (
                    <TableRow key={i} className={row.has_conflict ? "bg-amber-500/5" : !row.matched_employee_id ? "bg-destructive/5" : ""}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{row.employee_name_raw}</TableCell>
                      <TableCell className="text-xs">{row.employee_match_method}</TableCell>
                      <TableCell>
                        <Badge variant={row.employee_match_confidence >= 0.75 ? "default" : row.employee_match_confidence >= 0.5 ? "secondary" : "destructive"} className="text-xs">
                          {Math.round(row.employee_match_confidence * 100)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.work_date || "—"}</TableCell>
                      {sourceType === "payroll" && <TableCell><Badge variant="outline" className="text-xs">{row.pay_type}</Badge></TableCell>}
                      {sourceType === "payroll" && <TableCell className="text-xs font-mono">${row.total_pay?.toFixed(2) ?? "—"}</TableCell>}
                      {sourceType !== "payroll" && <TableCell className="text-xs font-mono">{row.total_hours ?? "—"}</TableCell>}
                      <TableCell>
                        {row.has_conflict ? (
                          <Badge variant="secondary" className="text-xs">Ambiguo</Badge>
                        ) : row.matched_employee_id ? (
                          <Badge variant="default" className="text-xs">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Sin match</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {normalizedRows.length > 20 && (
              <p className="text-xs text-muted-foreground mt-2">Mostrando 20 de {normalizedRows.length} filas</p>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setStep("preview")}>Atrás</Button>
              <Button onClick={handleSave} disabled={saving || errors.length > 0}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Guardar Import Staged
              </Button>
            </div>

            {saving && (
              <div className="mt-3">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{Math.round(progress)}%</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step: Save complete */}
      {step === "save" && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="text-lg font-semibold">Import Staged Completado</h3>
            <p className="text-muted-foreground">
              Los datos han sido almacenados en las capas raw y normalizada.
              Revisa los emparejamientos en la pestaña "Revisar".
            </p>
            <Button onClick={reset}>Importar otro archivo</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
