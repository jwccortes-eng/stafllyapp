import React, { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, DollarSign, Info, ArrowLeft, Download, UserPlus } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { safeRead, safeSheetToJson, getSheetNames, getSheet } from "@/lib/safe-xlsx";
import type { SafeWorkbook } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Map of Excel column header → concept name in DB.
 * Keys are case-insensitive matched.
 */
const COLUMN_CONCEPT_MAP: Record<string, { conceptName: string; category: "extra" | "deduction" }> = {
  "payper day": { conceptName: "Weekend Job", category: "extra" },
  "ryde": { conceptName: "Pago de Transporte Regular", category: "extra" },
  "tips": { conceptName: "Propinas", category: "extra" },
  "reimbursements": { conceptName: "Reintegros", category: "extra" },
  "travel hours": { conceptName: "Horas de viaje", category: "extra" },
  "otros": { conceptName: "Otros pagos", category: "extra" },
  "discount": { conceptName: "Descuentos", category: "deduction" },
};

const parseCurrency = (val: string): number => {
  if (!val || typeof val !== "string") return 0;
  const cleaned = val.replace(/[$,\s]/g, "").replace(/^\((.+)\)$/, "-$1");
  return parseFloat(cleaned) || 0;
};

interface Period {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface EmployeeExtras {
  firstName: string;
  lastName: string;
  employeeId: string | null;
  extras: { column: string; conceptName: string; value: number; category: string }[];
  total: number;
  notes: string;
}

export default function ImportPayrollExtras() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();

  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<SafeWorkbook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [employeeExtras, setEmployeeExtras] = useState<EmployeeExtras[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [createConfirmIdx, setCreateConfirmIdx] = useState<number | null>(null);
  const [creatingEmployee, setCreatingEmployee] = useState(false);

  // Load periods
  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase
      .from("pay_periods")
      .select("*")
      .eq("company_id", selectedCompanyId)
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        setPeriods((data as Period[]) ?? []);
      });
  }, [selectedCompanyId]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      toast({ title: "Error", description: "Archivo demasiado grande (máx 10MB)", variant: "destructive" });
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = evt.target?.result;
      if (!data) return;
      const wb = await safeRead(data as ArrayBuffer);
      setWorkbook(wb);
      const names = getSheetNames(wb);
      setSheets(names);
      // Auto-select second sheet if exists (Nómina Final)
      if (names.length >= 2) {
        setSelectedSheet(names[1]);
        processSheet(wb, names[1]);
      } else if (names.length === 1) {
        setSelectedSheet(names[0]);
        processSheet(wb, names[0]);
      } else {
        setStep(2);
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const processSheet = async (wb: SafeWorkbook, sheetName: string) => {
    const ws = getSheet(wb, sheetName);
    if (!ws) return;
    const json = safeSheetToJson<Record<string, string>>(ws, { defval: "" });
    if (json.length === 0) return;

    const headers = Object.keys(json[0]);

    // Detect extra columns
    const detected: string[] = [];
    const headerMap: Record<string, string> = {}; // lowercase → actual header
    headers.forEach(h => {
      const lower = h.toLowerCase().trim();
      headerMap[lower] = h;
      if (COLUMN_CONCEPT_MAP[lower]) {
        detected.push(h);
      }
    });
    setDetectedColumns(detected);

    if (detected.length === 0) {
      toast({
        title: "Sin columnas adicionales",
        description: "No se encontraron columnas de pagos adicionales (Payper Day, Ryde, Tips, etc.) en esta hoja.",
        variant: "destructive",
      });
      return;
    }

    // Fetch employees for matching
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("company_id", selectedCompanyId!);
    const empList = employees ?? [];

    // Group rows by employee (take summary row = last row per employee)
    const employeeGroups: Record<string, Record<string, string>> = {};
    for (const row of json) {
      const fn = (row["First name"] ?? "").trim();
      const ln = (row["Last name"] ?? "").trim();
      if (!fn && !ln) continue;
      // Skip SYSTEM users
      if (/^SYSTEM$/i.test(fn)) continue;
      const key = `${fn.toLowerCase()}|${ln.toLowerCase()}`;
      employeeGroups[key] = row; // Keep last row (summary)
    }

    const results: EmployeeExtras[] = [];

    for (const [key, row] of Object.entries(employeeGroups)) {
      const fn = (row["First name"] ?? "").trim();
      const ln = (row["Last name"] ?? "").trim();

      // Match employee
      const emp = empList.find(
        e => e.first_name.toLowerCase() === fn.toLowerCase() && e.last_name.toLowerCase() === ln.toLowerCase()
      );

      const extras: EmployeeExtras["extras"] = [];
      let total = 0;

      for (const col of detected) {
        const lower = col.toLowerCase().trim();
        const mapping = COLUMN_CONCEPT_MAP[lower];
        if (!mapping) continue;
        const val = parseCurrency(row[col]);
        if (val === 0) continue;
        extras.push({
          column: col,
          conceptName: mapping.conceptName,
          value: Math.abs(val),
          category: mapping.category,
        });
        total += val;
      }

      // Find notes column (last text column after Grand Total)
      // Look for a column that contains text descriptions like "TRAVEL HOURS MONTAÑA"
      const notesHeaders = headers.filter(h => {
        const lower = h.toLowerCase();
        return !COLUMN_CONCEPT_MAP[lower] &&
          !["first name", "last name", "total pay", "grand total"].some(k => lower.includes(k)) &&
          /note|comment|observ/i.test(lower);
      });
      let notes = "";
      // Also check the last few columns for notes (the file has unnamed columns)
      const lastCols = headers.slice(-4);
      for (const col of [...notesHeaders, ...lastCols]) {
        const v = (row[col] ?? "").trim();
        if (v && !/^\$/.test(v) && !/^\d{2}\/\d{2}\/\d{4}/.test(v) && v.length > 3) {
          notes = v;
          break;
        }
      }

      if (extras.length > 0) {
        results.push({
          firstName: fn,
          lastName: ln,
          employeeId: emp?.id ?? null,
          extras,
          total,
          notes,
        });
      }
    }

    setEmployeeExtras(results);
    setStep(3);
  };

  const selectSheet = (name: string) => {
    setSelectedSheet(name);
    if (workbook) processSheet(workbook, name);
  };

  const handleImport = async () => {
    if (!selectedCompanyId || !selectedPeriod || employeeExtras.length === 0) return;

    const targetPeriod = periods.find(p => p.id === selectedPeriod);
    if (targetPeriod?.status === "closed") {
      toast({ title: "Periodo cerrado", description: "No se pueden importar en un periodo cerrado.", variant: "destructive" });
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      // Fetch concepts for this company
      const { data: concepts } = await supabase
        .from("concepts")
        .select("id, name, category")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true);
      const conceptList = concepts ?? [];
      const conceptByName = new Map(conceptList.map(c => [c.name.toLowerCase(), c]));

      let created = 0;
      let skipped = 0;
      let noEmployee = 0;
      let noConcept = 0;
      const missingConcepts = new Set<string>();

      for (const emp of employeeExtras) {
        if (!emp.employeeId) {
          noEmployee++;
          continue;
        }

        for (const extra of emp.extras) {
          const concept = conceptByName.get(extra.conceptName.toLowerCase());
          if (!concept) {
            missingConcepts.add(extra.conceptName);
            noConcept++;
            continue;
          }

          // Check if movement already exists for this employee/concept/period
          const { count } = await supabase
            .from("movements")
            .select("id", { count: "exact", head: true })
            .eq("employee_id", emp.employeeId)
            .eq("concept_id", concept.id)
            .eq("period_id", selectedPeriod)
            .eq("company_id", selectedCompanyId);

          if ((count ?? 0) > 0) {
            skipped++;
            continue;
          }

          const { error } = await supabase.from("movements").insert({
            employee_id: emp.employeeId,
            concept_id: concept.id,
            period_id: selectedPeriod,
            company_id: selectedCompanyId,
            total_value: extra.value,
            note: emp.notes ? `[Import] ${emp.notes}` : "[Import Nómina Final]",
            created_by: user?.id,
          });

          if (error) {
            console.warn("Movement insert error:", error.message);
            continue;
          }
          created++;
        }
      }

      const parts = [`${created} movimientos creados`];
      if (skipped > 0) parts.push(`${skipped} omitidos (ya existían)`);
      if (noEmployee > 0) parts.push(`${noEmployee} sin empleado`);
      if (missingConcepts.size > 0) parts.push(`Conceptos no encontrados: ${Array.from(missingConcepts).join(", ")}`);

      setResult({ success: true, message: parts.join(" · ") });
      setStep(4);
    } catch (err: any) {
      setResult({ success: false, message: getUserFriendlyError(err) });
      toast({ title: "Error", description: getUserFriendlyError(err), variant: "destructive" });
    }

    setImporting(false);
  };

  const matchedCount = employeeExtras.filter(e => e.employeeId).length;
  const unmatchedCount = employeeExtras.filter(e => !e.employeeId).length;
  const grandTotal = employeeExtras.reduce((s, e) => s + e.total, 0);

  const handleCreateEmployee = async (idx: number) => {
    const emp = employeeExtras[idx];
    if (!emp || emp.employeeId || !selectedCompanyId) return;
    setCreatingEmployee(true);
    try {
      const { data, error } = await supabase.from("employees").insert({
        first_name: emp.firstName,
        last_name: emp.lastName,
        company_id: selectedCompanyId,
        tags: "datos-pendientes",
        added_via: "import-extras",
        added_by: user?.id ?? null,
      }).select("id").single();

      if (error) throw error;

      // Update local state with the new employee id
      setEmployeeExtras(prev => prev.map((e, i) =>
        i === idx ? { ...e, employeeId: data.id } : e
      ));
      toast({ title: "Empleado creado", description: `${emp.firstName} ${emp.lastName} — datos pendientes por completar.` });
    } catch (err: any) {
      toast({ title: "Error", description: getUserFriendlyError(err), variant: "destructive" });
    }
    setCreatingEmployee(false);
    setCreateConfirmIdx(null);
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const period = periods.find(p => p.id === selectedPeriod);
    const periodLabel = period ? `${period.start_date} → ${period.end_date}` : "";

    doc.setFontSize(16);
    doc.text("Reporte de Pagos Adicionales", 14, 18);
    doc.setFontSize(10);
    doc.text(`Periodo: ${periodLabel}`, 14, 26);
    doc.text(`Archivo: ${file?.name ?? "—"}`, 14, 32);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-US")}`, 14, 38);

    // Summary KPIs
    doc.setFontSize(11);
    doc.text(`Empleados: ${employeeExtras.length}  ·  Vinculados: ${matchedCount}  ·  Sin vincular: ${unmatchedCount}  ·  Total: $${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 14, 46);

    const head = [["Empleado", ...detectedColumns, "Total", "Notas", "Estado"]];
    const body = employeeExtras.map(emp => {
      const cols = detectedColumns.map(col => {
        const extra = emp.extras.find(e => e.column === col);
        return extra ? `$${extra.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";
      });
      return [
        `${emp.firstName} ${emp.lastName}`,
        ...cols,
        `$${emp.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        emp.notes || "—",
        emp.employeeId ? "Vinculado" : "No encontrado",
      ];
    });

    autoTable(doc, {
      startY: 52,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        0: { cellWidth: 40 },
      },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === head[0].length - 1) {
          const val = String(data.cell.raw);
          if (val === "No encontrado") {
            data.cell.styles.textColor = [220, 38, 38];
          } else {
            data.cell.styles.textColor = [22, 163, 74];
          }
        }
      },
    });

    doc.save(`pagos-adicionales-${period?.start_date ?? "reporte"}.pdf`);
  };

  const reset = () => {
    setFile(null);
    setWorkbook(null);
    setSheets([]);
    setSelectedSheet("");
    setStep(1);
    setEmployeeExtras([]);
    setResult(null);
    setDetectedColumns([]);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        variant="3"
        title="Importar Pagos Adicionales"
        subtitle="Importa Payper Day, Ride, Tips, Reimbursements, Travel Hours y más desde la Nómina Final"
      />

      <div className="flex items-center gap-2 mb-4">
        <Link to="/app/import">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Importar Horas Base
          </Button>
        </Link>
      </div>

      {/* Step 1: Select period + Upload file */}
      {step === 1 && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-5 w-5 text-primary" />
                1. Seleccionar Periodo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Periodo de nómina</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar periodo..." /></SelectTrigger>
                  <SelectContent>
                    {periods.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.start_date} → {p.end_date}
                        {p.status === "closed" && " 🔒"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                2. Subir Archivo (Nómina Final)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <p>Sube el reporte final que contiene las columnas adicionales: Payper Day, Ryde, Tips, Reimbursements, Travel Hours, Otros, Discount.</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={!selectedPeriod}
                  />
                  <Button variant="outline" asChild disabled={!selectedPeriod}>
                    <span className="gap-2"><Upload className="h-4 w-4" />Seleccionar archivo</span>
                  </Button>
                </label>
                {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
              </div>
              {!selectedPeriod && (
                <p className="text-xs text-destructive">Selecciona un periodo primero</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Select sheet */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Seleccionar Hoja</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Se detectaron {sheets.length} hojas. Selecciona la que contiene la Nómina Final con pagos adicionales:
            </p>
            <div className="flex flex-wrap gap-2">
              {sheets.map((name, i) => (
                <Button
                  key={name}
                  variant={i === 1 ? "default" : "outline"}
                  onClick={() => selectSheet(name)}
                >
                  {name}
                  {i === 1 && <Badge variant="secondary" className="ml-2">Recomendado</Badge>}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Resumen de Pagos Adicionales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{employeeExtras.length}</p>
                  <p className="text-xs text-muted-foreground">Empleados con extras</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-earning">{matchedCount}</p>
                  <p className="text-xs text-muted-foreground">Vinculados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-destructive">{unmatchedCount}</p>
                  <p className="text-xs text-muted-foreground">Sin vincular</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}</p>
                  <p className="text-xs text-muted-foreground">Total adicionales</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs text-muted-foreground">Columnas detectadas:</span>
                {detectedColumns.map(col => (
                  <Badge key={col} variant="outline">{col}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 bg-background">Empleado</TableHead>
                      {detectedColumns.map(col => (
                        <TableHead key={col} className="sticky top-0 bg-background text-right">{col}</TableHead>
                      ))}
                      <TableHead className="sticky top-0 bg-background text-right">Total</TableHead>
                      <TableHead className="sticky top-0 bg-background">Notas</TableHead>
                      <TableHead className="sticky top-0 bg-background">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeExtras.map((emp, i) => (
                      <TableRow key={i} className={!emp.employeeId ? "opacity-50" : ""}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {emp.firstName} {emp.lastName}
                        </TableCell>
                        {detectedColumns.map(col => {
                          const extra = emp.extras.find(e => e.column === col);
                          return (
                            <TableCell key={col} className="text-right tabular-nums">
                              {extra ? (
                                <span className={extra.category === "deduction" ? "text-destructive" : "text-earning"}>
                                  ${extra.value.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                </span>
                              ) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-semibold tabular-nums">
                          ${emp.total.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={emp.notes}>
                          {emp.notes || "—"}
                        </TableCell>
                        <TableCell>
                          {emp.employeeId ? (
                            <Badge variant="outline" className="text-earning border-earning/30">Vinculado</Badge>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="destructive">No encontrado</Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title="Crear empleado"
                                onClick={() => setCreateConfirmIdx(i)}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={downloadPdf} className="gap-2">
              <Download className="h-4 w-4" />
              Descargar PDF
            </Button>
            <Button variant="outline" onClick={reset}>Cancelar</Button>
            <Button
              onClick={handleImport}
              disabled={importing || matchedCount === 0}
              className="gap-2"
            >
              {importing ? "Importando..." : `Importar ${matchedCount} empleados`}
              <DollarSign className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 4 && result && (
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            {result.success ? (
              <CheckCircle2 className="h-12 w-12 text-earning mx-auto" />
            ) : (
              <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            )}
            <p className="text-lg font-medium">{result.success ? "Importación completada" : "Error en la importación"}</p>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">{result.message}</p>
            <div className="flex gap-3 justify-center pt-4">
              <Button variant="outline" onClick={reset}>Nueva importación</Button>
              <Link to="/app/movements">
                <Button>Ver Novedades</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create employee confirmation */}
      <AlertDialog open={createConfirmIdx !== null} onOpenChange={(open) => { if (!open) setCreateConfirmIdx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear empleado nuevo?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {createConfirmIdx !== null && employeeExtras[createConfirmIdx] && (
                <>
                  <p>
                    Se creará <strong>{employeeExtras[createConfirmIdx].firstName} {employeeExtras[createConfirmIdx].lastName}</strong> con datos pendientes por completar.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    El empleado quedará etiquetado como <Badge variant="outline" className="text-xs">datos-pendientes</Badge> hasta que se complete su información en el directorio.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creatingEmployee}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={creatingEmployee}
              onClick={() => createConfirmIdx !== null && handleCreateEmployee(createConfirmIdx)}
            >
              {creatingEmployee ? "Creando..." : "Crear empleado"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
