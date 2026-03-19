import { useState, useCallback, useMemo } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Eye, Loader2, Users, ShieldAlert, Info, UserX, Link2 } from "lucide-react";
import UnmatchedResolutionPanel from "./UnmatchedResolutionPanel";
import { parseAnyFileToJson } from "@/lib/safe-xlsx";
import { hashRow, detectColumns, normalizeText, type ColumnMapping } from "@/lib/reconciliation-engine";
import { normalizeScheduleRows, normalizeClockRows, normalizePayrollRows, type ImportDiagnostics, type EmployeeAlias } from "@/lib/reconciliation-normalizer";
import type { EmployeeRecord } from "@/lib/reconciliation-engine";

type SourceType = "schedule" | "clock" | "payroll";
type Step = "upload" | "preview" | "normalize" | "review" | "save";

interface Props {
  companyId: string | null;
  onComplete: () => void;
  activePeriodId?: string | null;
  onBatchLinked?: (sourceType: SourceType, batchId: string) => void;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  schedule: "Turnos Programados",
  clock: "Fichajes (Clock In/Out)",
  payroll: "Nómina / Payroll",
};

export default function StagedImportWizard({ companyId, onComplete, activePeriodId, onBatchLinked }: Props) {
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
  const [aliases, setAliases] = useState<EmployeeAlias[]>([]);
  const [diagnostics, setDiagnostics] = useState<ImportDiagnostics | null>(null);
  const [showSystemRows, setShowSystemRows] = useState(false);
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched" | "system">("all");
  const [companyName, setCompanyName] = useState<string>("");
  const [rosterExpectedCount, setRosterExpectedCount] = useState<number | null>(null);

  const loadEmployees = useCallback(async () => {
    if (!companyId) {
      console.warn("[StagedImport] No companyId, skipping employee load");
      return;
    }

    console.log("[StagedImport] Loading employees for company:", companyId);

    const [{ data: companyData }, { count: expectedCount }] = await Promise.all([
      supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    ]);

    setCompanyName(companyData?.name ?? "");
    setRosterExpectedCount(expectedCount ?? null);

    const pageSize = 500;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, phone_number, email, connecteam_employee_id, is_active, start_date, end_date")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("[StagedImport] Employee query error:", error);
        toast({ title: "Error cargando empleados", description: error.message, variant: "destructive" });
        break;
      }

      const page = data ?? [];
      allRows = allRows.concat(page);

      if (page.length < pageSize) break;
      from += pageSize;
    }

    const mapped = allRows.map((d: any) => ({
      id: d.id,
      first_name: d.first_name,
      last_name: d.last_name,
      phone: d.phone_number,
      email: d.email,
      connecteam_id: d.connecteam_employee_id || null,
      external_id: d.connecteam_employee_id || null,
      is_active: d.is_active,
      hire_date: d.start_date,
      termination_date: d.end_date,
    })) as EmployeeRecord[];

    console.log(
      "[StagedImport] Employees loaded:",
      mapped.length,
      "active:",
      mapped.filter((e) => e.is_active !== false).length,
      "inactive:",
      mapped.filter((e) => e.is_active === false).length,
      "expected:",
      expectedCount ?? "n/a",
    );
    setEmployees(mapped);

    // Load aliases
    const { data: aliasData, error: aliasErr } = await supabase
      .from("employee_aliases" as any)
      .select("employee_id, alias_name_normalized")
      .eq("company_id", companyId);

    if (aliasErr) console.warn("[StagedImport] Alias query error (table may not exist yet):", aliasErr.message);
    setAliases((aliasData || []) as unknown as EmployeeAlias[]);
    console.log("[StagedImport] Aliases loaded:", (aliasData || []).length);
  }, [companyId, toast]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    try {
      const rows = await parseAnyFileToJson(f, { defval: "" });
      if (!rows || rows.length === 0) {
        toast({ title: "Archivo vacío", description: "No se encontraron filas de datos en el archivo.", variant: "destructive" });
        return;
      }
      setRawRows(rows);
      const allHeaders = Object.keys(rows[0]);
      console.log("[StagedImport] Headers detected:", allHeaders);
      const mapping = detectColumns(allHeaders);
      console.log("[StagedImport] Column mapping:", mapping);
      setColumnMapping(mapping);
      setStep("preview");
      await loadEmployees();
    } catch (err: any) {
      console.error("[StagedImport] File parse error:", err);
      toast({ title: "Error al leer archivo", description: err.message, variant: "destructive" });
    }
  };

  const runNormalization = useCallback(() => {
    const rawWithIds = rawRows.map((r, i) => ({
      id: `temp-${i}`,
      row_number: i + 1,
      raw_data: r,
    }));

    console.log("[StagedImport] Normalizing", rawWithIds.length, "rows as", sourceType, "with", employees.length, "employees and", aliases.length, "aliases");

    let result: any;
    if (sourceType === "schedule") result = normalizeScheduleRows(rawWithIds, employees, aliases);
    else if (sourceType === "clock") result = normalizeClockRows(rawWithIds, employees, aliases);
    else result = normalizePayrollRows(rawWithIds, employees, aliases);

    console.log("[StagedImport] Normalization result:", {
      normalized: result.normalized.length,
      diagnostics: result.diagnostics,
    });

    setNormalizedRows(result.normalized);
    setWarnings(result.warnings);
    setErrors(result.errors);
    setDiagnostics(result.diagnostics);
    return result;
  }, [rawRows, sourceType, employees, aliases]);

  const handleNormalize = () => {
    const result = runNormalization();

    if (result.normalized.length === 0) {
      toast({ title: "Sin resultados", description: "No se pudieron normalizar filas. Revisa que el archivo tenga las columnas esperadas.", variant: "destructive" });
      return;
    }

    setStep("review");
  };

  const handleReNormalize = () => {
    runNormalization();
    toast({ title: "Re-normalizado", description: "Se aplicaron los alias guardados a las filas." });
  };

  const handleSaveAlias = async (nameRaw: string, employeeId: string) => {
    if (!companyId || !user?.id) return;
    const normalized = normalizeText(nameRaw);
    const { error } = await supabase.from("employee_aliases" as any).insert({
      company_id: companyId,
      employee_id: employeeId,
      alias_name: nameRaw.trim(),
      alias_name_normalized: normalized,
      source: "manual_review",
      created_by: user.id,
    } as any);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Alias ya existe", variant: "default" });
      } else {
        toast({ title: "Error al guardar alias", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: "Alias guardado", description: `"${nameRaw}" → empleado vinculado` });
    setAliases(prev => [...prev, { employee_id: employeeId, alias_name_normalized: normalized }]);
  };

  const handleSave = async () => {
    if (!companyId || !user?.id || !file) {
      toast({ title: "Error", description: "Faltan datos requeridos (empresa, usuario o archivo).", variant: "destructive" });
      return;
    }
    setSaving(true);
    setProgress(10);

    try {
      // Filter out system rows before saving
      const employeeRows = normalizedRows.filter(r => !r._is_system);

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

      // 2. Insert raw rows (all rows including system for audit)
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

      for (let i = 0; i < rawInserts.length; i += 100) {
        const chunk = rawInserts.slice(i, i + 100);
        const { error } = await supabase.from(rawTable as any).insert(chunk as any);
        if (error) throw error;
        setProgress(25 + ((i / rawInserts.length) * 25));
      }
      setProgress(50);

      // 3. Fetch raw rows with IDs
      const allSavedRaw: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data: page, error: fetchErr } = await supabase
          .from(rawTable as any)
          .select("id, row_number, raw_data")
          .eq("batch_id", batchId)
          .order("row_number")
          .range(from, from + PAGE_SIZE - 1);
        if (fetchErr) throw fetchErr;
        if (!page || page.length === 0) break;
        allSavedRaw.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setProgress(60);

      // 4. Normalize and insert (only non-system rows)
      const normTable = sourceType === "schedule" ? "normalized_schedule_rows"
        : sourceType === "clock" ? "normalized_clock_rows"
        : "normalized_payroll_rows";

      let normResult: any;
      const rawForNorm = allSavedRaw.map((r: any) => ({
        id: r.id, row_number: r.row_number, raw_data: r.raw_data,
      }));

      if (sourceType === "schedule") normResult = normalizeScheduleRows(rawForNorm, employees, aliases);
      else if (sourceType === "clock") normResult = normalizeClockRows(rawForNorm, employees, aliases);
      else normResult = normalizePayrollRows(rawForNorm, employees, aliases);

      // Only insert non-system rows into normalized table
      const normInserts = normResult.normalized
        .filter((n: any) => !n._is_system)
        .map((n: any) => {
          const { _is_system, _system_reason, _match_status, ...rest } = n;
          return { ...rest, batch_id: batchId, company_id: companyId };
        });

      for (let i = 0; i < normInserts.length; i += 100) {
        const chunk = normInserts.slice(i, i + 100);
        const { error } = await supabase.from(normTable as any).insert(chunk as any);
        if (error) {
          console.error("[StagedImport] Normalized insert error:", error);
          throw error;
        }
        setProgress(60 + ((i / normInserts.length) * 25));
      }
      setProgress(85);

      // 5. Create exceptions for unmatched employees (non-system only)
      const unmatched = normResult.normalized.filter((n: any) => !n.matched_employee_id && !n._is_system);
      if (unmatched.length > 0) {
        const exceptions = unmatched.map((n: any) => ({
          company_id: companyId,
          batch_id: batchId,
          exception_type: n.has_conflict ? "ambiguous_employee" : "unknown_employee",
          severity: n.has_conflict ? "medium" : "high",
          source_type: sourceType,
          description: `No match for "${n.employee_name_raw}" (method: ${n.employee_match_method}, conf: ${Math.round(n.employee_match_confidence * 100)}%)`,
          source_data: { name: n.employee_name_raw, phone: n.employee_phone, email: n.employee_email },
          status: "open",
        }));
        const { error: excErr } = await supabase.from("reconciliation_exceptions" as any).insert(exceptions as any);
        if (excErr) console.error("[StagedImport] Exception insert error:", excErr);
      }

      // 6. Update batch status
      await supabase.from("import_batches" as any)
        .update({ status: "completed" } as any)
        .eq("id", batchId);

      // 7. Link batch to active period
      if (activePeriodId) {
        const fieldMap: Record<string, string> = {
          schedule: "schedule_batch_id",
          clock: "clock_batch_id",
          payroll: "payroll_batch_id",
        };
        const field = fieldMap[sourceType];
        if (field) {
          await supabase.from("reconciliation_period_status" as any)
            .update({ [field]: batchId, updated_at: new Date().toISOString() } as any)
            .eq("id", activePeriodId);
        }
        onBatchLinked?.(sourceType, batchId);
      }

      setProgress(100);
      setStep("save");
      const diag = normResult.diagnostics;
      toast({
        title: "Import completado",
        description: `${diag.realEmployeeRows} filas de empleados, ${diag.matched} emparejados, ${diag.systemRows} filas de sistema excluidas.`,
      });
      onComplete();
    } catch (err: any) {
      console.error("[StagedImport] Save error:", err);
      toast({ title: "Error al guardar", description: err.message || "Error desconocido", variant: "destructive" });
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
    setDiagnostics(null);
    setStep("upload");
    setProgress(0);
    setFilter("all");
  };

  const realRows = normalizedRows.filter(r => !r._is_system);
  const systemRows = normalizedRows.filter(r => r._is_system);
  const matchedCount = realRows.filter(r => r.matched_employee_id).length;
  const unmatchedCount = realRows.filter(r => !r.matched_employee_id).length;
  const ambiguousCount = realRows.filter(r => r.has_conflict).length;

  const filteredRows = filter === "all" ? realRows
    : filter === "matched" ? realRows.filter(r => r.matched_employee_id)
    : filter === "unmatched" ? realRows.filter(r => !r.matched_employee_id)
    : systemRows;

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
            {/* Employee roster diagnostic */}
            <Alert className={`mb-4 ${employees.length === 0 ? "border-destructive" : ""}`} variant={employees.length === 0 ? "destructive" : "default"}>
              <Users className="h-4 w-4" />
              <AlertTitle>Diagnóstico de Empleados — Roster de Empresa</AlertTitle>
              <AlertDescription className="text-sm space-y-1">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                  <span><span className="font-semibold">{employees.filter((e: any) => e.is_active !== false).length}</span> activos</span>
                  <span><span className="font-semibold">{employees.filter((e: any) => e.is_active === false).length}</span> inactivos</span>
                  <span><span className="font-semibold">{employees.length}</span> total roster</span>
                  <span><span className="font-semibold">{aliases.length}</span> alias</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-1">
                  <div>
                    Empresa: <code className="bg-muted px-1 rounded">{companyName || "N/A"}</code> · Company ID: <code className="bg-muted px-1 rounded">{companyId || "N/A"}</code>
                  </div>
                  <div>
                    Fuente: <code className="bg-muted px-1 rounded">employees</code> · Carga: <code className="bg-muted px-1 rounded">server paginated</code> · Esperado DB: <code className="bg-muted px-1 rounded">{rosterExpectedCount ?? "N/A"}</code>
                  </div>
                </div>
                {employees.length === 0 && (
                  <div className="mt-2 p-2 bg-destructive/10 rounded text-destructive font-semibold text-sm">
                    🚫 Roster vacío — No hay empleados cargados para esta empresa. Verifica que el contexto de empresa sea correcto y que existan empleados registrados antes de importar.
                  </div>
                )}
              </AlertDescription>
            </Alert>

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
              <Button onClick={handleNormalize} disabled={employees.length === 0}>
                <ArrowRight className="h-4 w-4 mr-1" /> Normalizar & Emparejar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <>
          {/* Diagnostics Panel */}
          {diagnostics && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-5 w-5" /> Diagnóstico de Import
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <DiagnosticStat label="Total filas" value={diagnostics.totalRows} />
                  <DiagnosticStat label="Filas de sistema" value={diagnostics.systemRows} variant="muted" />
                  <DiagnosticStat label="Filas de empleados" value={diagnostics.realEmployeeRows} />
                  <DiagnosticStat label="Emparejados" value={diagnostics.matched} variant="success" />
                  <DiagnosticStat label="Sin match" value={diagnostics.unmatched} variant={diagnostics.unmatched > 0 ? "destructive" : "success"} />
                </div>

                {/* Match breakdown by status */}
                {diagnostics.matched > 0 && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <DiagnosticStat label="✅ Activos" value={diagnostics.matchedActive} variant="success" />
                    <DiagnosticStat label="📦 Inactivos" value={diagnostics.matchedInactive} variant="warning" />
                    <DiagnosticStat label="🔗 Por alias" value={diagnostics.matchedByAlias} variant="muted" />
                    <DiagnosticStat label="⚠ Ambiguos" value={diagnostics.ambiguous} variant={diagnostics.ambiguous > 0 ? "warning" : "muted"} />
                  </div>
                )}

                {diagnostics.matchedInactive > 0 && (
                  <Alert className="mt-3">
                    <Info className="h-4 w-4" />
                    <AlertTitle className="text-sm">Empleados inactivos emparejados</AlertTitle>
                    <AlertDescription className="text-xs">
                      {diagnostics.matchedInactive} filas se emparejaron con empleados actualmente inactivos. Esto es normal para importaciones históricas — estos empleados estaban activos durante el periodo importado.
                    </AlertDescription>
                  </Alert>
                )}

                {diagnostics.matchedByMethod && Object.keys(diagnostics.matchedByMethod).length > 0 && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Métodos: {Object.entries(diagnostics.matchedByMethod).map(([m, c]) => `${m}: ${c}`).join(" · ")}
                  </div>
                )}

                {diagnostics.systemRowNames.length > 0 && (
                  <div className="mt-3">
                    <button className="text-xs text-muted-foreground underline" onClick={() => setShowSystemRows(!showSystemRows)}>
                      {showSystemRows ? "Ocultar" : "Ver"} filas de sistema excluidas ({diagnostics.systemRowNames.length})
                    </button>
                    {showSystemRows && (
                      <div className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded p-2 max-h-20 overflow-auto">
                        {diagnostics.systemRowNames.map((n, i) => <span key={i} className="inline-block mr-2 mb-1 px-1.5 py-0.5 bg-muted rounded">{n}</span>)}
                      </div>
                    )}
                  </div>
                )}

                {diagnostics.likelyAliasNames.length > 0 && (
                  <Alert className="mt-3" variant="default">
                    <Link2 className="h-4 w-4" />
                    <AlertTitle className="text-sm">Posibles alias detectados</AlertTitle>
                    <AlertDescription className="text-xs">
                      Nombres con coincidencia parcial: {diagnostics.likelyAliasNames.slice(0, 10).join(", ")}
                      {diagnostics.likelyAliasNames.length > 10 && ` ...y ${diagnostics.likelyAliasNames.length - 10} más`}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="mt-3 text-xs text-muted-foreground">
                  Roster: {diagnostics.companyEmployeesActive} activos + {diagnostics.companyEmployeesInactive} inactivos = {diagnostics.companyEmployeesActive + diagnostics.companyEmployeesInactive} total
                </div>
              </CardContent>
            </Card>
          )}

          {/* Unmatched / Ambiguous Resolution Panel */}
          <UnmatchedResolutionPanel
            normalizedRows={normalizedRows}
            employees={employees}
            companyId={companyId}
            companyName={companyName}
            onAssignAlias={handleSaveAlias}
            onReNormalize={handleReNormalize}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado de Normalización</CardTitle>
              <CardDescription className="flex gap-2 mt-2 flex-wrap">
                <Badge
                  variant={filter === "all" ? "default" : "outline"}
                  className="gap-1 cursor-pointer"
                  onClick={() => setFilter("all")}
                >
                  Todos ({realRows.length})
                </Badge>
                <Badge
                  variant={filter === "matched" ? "default" : "outline"}
                  className="gap-1 cursor-pointer"
                  onClick={() => setFilter("matched")}
                >
                  <CheckCircle2 className="h-3 w-3" /> Emparejados ({matchedCount})
                </Badge>
                {unmatchedCount > 0 && (
                  <Badge
                    variant={filter === "unmatched" ? "destructive" : "outline"}
                    className="gap-1 cursor-pointer"
                    onClick={() => setFilter("unmatched")}
                  >
                    <UserX className="h-3 w-3" /> Sin match ({unmatchedCount})
                  </Badge>
                )}
                {systemRows.length > 0 && (
                  <Badge
                    variant={filter === "system" ? "secondary" : "outline"}
                    className="gap-1 cursor-pointer"
                    onClick={() => setFilter("system")}
                  >
                    <ShieldAlert className="h-3 w-3" /> Sistema ({systemRows.length})
                  </Badge>
                )}
                {ambiguousCount > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> {ambiguousCount} ambiguos
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {warnings.length > 0 && (
                <div className="mb-4 p-3 bg-accent/50 border border-accent rounded-md text-sm space-y-1">
                  {warnings.slice(0, 5).map((w, i) => (
                    <div key={i} className="text-muted-foreground">⚠ {w}</div>
                  ))}
                  {warnings.length > 5 && <div className="text-muted-foreground">...y {warnings.length - 5} más</div>}
                </div>
              )}

              {errors.length > 0 && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm space-y-1">
                  {errors.map((e, i) => (
                    <div key={i} className="text-destructive">✕ {e}</div>
                  ))}
                </div>
              )}

              <div className="max-h-96 overflow-auto border rounded-md">
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
                      {filter === "unmatched" && <TableHead>Acción</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.slice(0, 50).map((row, i) => (
                      <TableRow
                        key={i}
                        className={
                          row._is_system ? "bg-muted/30 opacity-60"
                          : row.has_conflict ? "bg-amber-500/5"
                          : !row.matched_employee_id ? "bg-destructive/5"
                          : ""
                        }
                      >
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs font-medium">{row.employee_name_raw || "(vacío)"}</TableCell>
                        <TableCell className="text-xs">{row.employee_match_method}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row._is_system ? "outline"
                              : row.employee_match_confidence >= 0.75 ? "default"
                              : row.employee_match_confidence >= 0.3 ? "secondary"
                              : "destructive"
                            }
                            className="text-xs"
                          >
                            {row._is_system ? "—" : `${Math.round(row.employee_match_confidence * 100)}%`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{row.work_date || "—"}</TableCell>
                        {sourceType === "payroll" && <TableCell><Badge variant="outline" className="text-xs">{row.pay_type}</Badge></TableCell>}
                        {sourceType === "payroll" && <TableCell className="text-xs font-mono">${row.total_pay?.toFixed(2) ?? "—"}</TableCell>}
                        {sourceType !== "payroll" && <TableCell className="text-xs font-mono">{row.total_hours ?? "—"}</TableCell>}
                        <TableCell>
                          {row._is_system ? (
                            <Badge variant="outline" className="text-xs">Excluido</Badge>
                          ) : row.has_conflict ? (
                            <Badge variant="secondary" className="text-xs">Ambiguo</Badge>
                          ) : row.matched_employee_id ? (
                            row._match_status === "matched_inactive_employee" ? (
                              <Badge variant="secondary" className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300">📦 Inactivo</Badge>
                            ) : row._match_status === "likely_alias_match" ? (
                              <Badge variant="secondary" className="text-xs">🔗 Alias</Badge>
                            ) : (
                              <Badge variant="default" className="text-xs">✅ Activo</Badge>
                            )
                          ) : (
                            <Badge variant="destructive" className="text-xs">Sin match</Badge>
                          )}
                        </TableCell>
                        {filter === "unmatched" && !row._is_system && (
                          <TableCell>
                            <MatchAssignDropdown
                              employees={employees}
                              nameRaw={row.employee_name_raw}
                              onAssign={(empId) => handleSaveAlias(row.employee_name_raw, empId)}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filteredRows.length > 50 && (
                <p className="text-xs text-muted-foreground mt-2">Mostrando 50 de {filteredRows.length} filas</p>
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
        </>
      )}

      {/* Step: Save complete */}
      {step === "save" && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
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

// ─── Small sub-components ───

function DiagnosticStat({ label, value, variant = "default" }: { label: string; value: number; variant?: "default" | "success" | "destructive" | "warning" | "muted" }) {
  const colors = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    destructive: "text-destructive",
    warning: "text-amber-600 dark:text-amber-400",
    muted: "text-muted-foreground",
  };
  return (
    <div className="rounded-md border p-2.5 text-center">
      <div className={`text-xl font-bold ${colors[variant]}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function MatchAssignDropdown({ employees, nameRaw, onAssign }: { employees: EmployeeRecord[]; nameRaw: string; onAssign: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalized = normalizeText(nameRaw);

  // Sort employees by name similarity
  const sorted = employees
    .map(e => ({
      ...e,
      fullName: `${e.first_name} ${e.last_name}`,
      norm: normalizeText(`${e.first_name} ${e.last_name}`),
    }))
    .filter(e => !search || e.norm.includes(normalizeText(search)))
    .sort((a, b) => {
      // Prioritize partial matches with import name
      const aMatch = a.norm.includes(normalized) || normalized.includes(a.norm) ? 0 : 1;
      const bMatch = b.norm.includes(normalized) || normalized.includes(b.norm) ? 0 : 1;
      return aMatch - bMatch || a.fullName.localeCompare(b.fullName);
    })
    .slice(0, 10);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        Asignar
      </Button>
    );
  }

  return (
    <div className="min-w-48 space-y-1">
      <input
        className="w-full text-xs border rounded px-2 py-1 bg-background"
        placeholder="Buscar empleado..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      <div className="max-h-32 overflow-auto space-y-0.5">
        {sorted.map(e => (
          <button
            key={e.id}
            className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-accent truncate"
            onClick={() => { onAssign(e.id); setOpen(false); }}
          >
            {e.fullName}
          </button>
        ))}
      </div>
      <button className="text-xs text-muted-foreground underline" onClick={() => setOpen(false)}>Cancelar</button>
    </div>
  );
}
