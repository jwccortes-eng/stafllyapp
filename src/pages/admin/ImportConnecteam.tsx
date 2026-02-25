import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, History, Users, Clock, ChevronDown, ChevronRight, Trash2, Download, Info, UserPlus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import * as XLSX from "xlsx";
import { safeRead, safeSheetToJson } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROW_COUNT = 10000;

const ACCEPTED_EXTENSIONS = ".xls,.xlsx,.csv";

const KNOWN_HEADERS = [
  // Identity
  "First name", "Last name", "Verification SSN - EIN",
  // Summary / base pay totals
  "Weekly total hours", "Total work hours", "Total Paid Hours", "Total paid hours",
  "Total Regular", "Regular", "Total overtime", "Total pay", "Total pay USD",
  "Total paid time off hours", "Total unpaid time off hours", "Worked days",
  // Shift-level columns
  "Shift Number", "Scheduled shift title", "Type", "Job code",
  "Sub-job", "Sub-job code", "Start Date", "In", "Start - location",
  "End Date", "Out", "End - location", "Shift hours", "Hourly rate (USD)",
  "Daily total hours", "Daily total pay (USD)", "Customer", "Ride",
  "Employee notes", "Manager notes",
  "Clock In - Device", "Clock Out - Device",
  "Clock In - Time", "Clock Out - Time",
  // Profile fields
  "Gender", "Employer identification", "Birthday",
  "Address (street, apt).", "Condado", "English Level", "Role", "Qualify",
  "Social security number", "Recommended by?", "Direct manager",
  "You have car?", "Driver Licence", "Mobile phone",
  "Breaking policy/monitoring",
];

const downloadTemplate = () => {
  const templateData = [
    {
      "First name": "Juan", "Last name": "Pérez", "Verification SSN - EIN": "123-45-6789",
      "Total work hours": 40, "Total paid hours": 40, "Regular": 40,
      "Total overtime": 0, "Total pay USD": "$600.00", "Worked days": 5,
      "Start date": "02/18/2026", "End date": "02/24/2026",
    },
    {
      "First name": "María", "Last name": "López", "Verification SSN - EIN": "987-65-4321",
      "Total work hours": 45, "Total paid hours": 45, "Regular": 40,
      "Total overtime": 5, "Total pay USD": "$855.00", "Worked days": 6,
      "Start date": "02/18/2026", "End date": "02/24/2026",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Horas");
  XLSX.writeFile(wb, "plantilla_importacion_connecteam.xlsx");
};

const BASE_PAY_FIELDS: Record<string, string> = {
  "Weekly total hours": "weekly_total_hours",
  "Total work hours": "total_work_hours",
  "Total Paid Hours": "total_paid_hours",
  "Total paid hours": "total_paid_hours",
  "Total Regular": "total_regular",
  "Regular": "total_regular",
  "Total overtime": "total_overtime",
  "Total pay": "base_total_pay",
  "Total pay USD": "base_total_pay",
};

interface ImportHistory {
  id: string;
  file_name: string;
  status: string;
  row_count: number | null;
  created_at: string;
  error_message: string | null;
  period_id: string;
  pay_periods: { start_date: string; end_date: string } | null;
  _emp_count?: number;
  _base_total?: number;
}

interface Period { id: string; start_date: string; end_date: string; status: string; }

export default function ImportConnecteam() {
  const { selectedCompanyId } = useCompany();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();
  const [importHistory, setImportHistory] = useState<ImportHistory[]>([]);
  const [expandedImport, setExpandedImport] = useState<string | null>(null);
  const [expandedEmployees, setExpandedEmployees] = useState<{ first_name: string; last_name: string; base_total_pay: number; total_work_hours: number | null; total_overtime: number | null; total_paid_hours: number | null }[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const [preImportSummary, setPreImportSummary] = useState<{
    matched: { name: string; total: number }[];
    unmatched: { first_name: string; last_name: string }[];
    estimatedTotal: number;
    loading: boolean;
  } | null>(null);
  const [creatingEmployees, setCreatingEmployees] = useState(false);

  const handleCreateMissingEmployees = async () => {
    if (!preImportSummary || !workbook || !selectedSheet || !selectedCompanyId) return;
    setCreatingEmployees(true);
    try {
      const ws = workbook.Sheets[selectedSheet];
      const allRows = safeSheetToJson<Record<string, string>>(ws, { defval: "" });
      const reverseMap: Record<string, string> = {};
      Object.entries(mapping).forEach(([fileCol, knownCol]) => { reverseMap[knownCol] = fileCol; });

      // Use the edited names directly from state
      const toCreate = preImportSummary.unmatched
        .filter(u => u.first_name.trim() && u.last_name.trim())
        .map(u => ({ first_name: u.first_name.trim(), last_name: u.last_name.trim(), company_id: selectedCompanyId }));

      if (toCreate.length > 0) {
        const { error } = await supabase.from("employees").insert(toCreate);
        if (error) throw error;
      }

      toast({ title: `${toCreate.length} empleados creados`, description: "Se crearon los empleados faltantes. Recalculando resumen..." });
      // Re-run summary to reflect new employees
      await computePreImportSummary();
    } catch (err: any) {
      toast({ title: "Error", description: getUserFriendlyError(err), variant: "destructive" });
    }
    setCreatingEmployees(false);
  };

  const toggleExpand = async (importId: string) => {
    if (expandedImport === importId) {
      setExpandedImport(null);
      setExpandedEmployees([]);
      return;
    }
    setExpandedImport(importId);
    setLoadingDetail(true);
    const { data } = await supabase
      .from("period_base_pay")
      .select("base_total_pay, total_work_hours, total_overtime, total_paid_hours, employees(first_name, last_name)")
      .eq("import_id", importId)
      .order("base_total_pay", { ascending: false });
    setExpandedEmployees(
      (data ?? []).map((d: any) => ({
        first_name: d.employees?.first_name ?? "",
        last_name: d.employees?.last_name ?? "",
        base_total_pay: Number(d.base_total_pay) || 0,
        total_work_hours: d.total_work_hours,
        total_overtime: d.total_overtime,
        total_paid_hours: d.total_paid_hours,
      }))
    );
    setLoadingDetail(false);
  };

  const handleDeleteImport = async (importId: string) => {
    setDeletingImportId(importId);
    try {
      // Delete in order: shifts → period_base_pay → import_rows → imports
      await supabase.from("shifts").delete().eq("import_id", importId);
      await supabase.from("period_base_pay").delete().eq("import_id", importId);
      await supabase.from("import_rows").delete().eq("import_id", importId);
      await supabase.from("imports").delete().eq("id", importId);

      if (expandedImport === importId) {
        setExpandedImport(null);
        setExpandedEmployees([]);
      }
      toast({ title: "Importación eliminada", description: "Se revirtieron los datos base y turnos asociados." });
      fetchHistory();
    } catch (err: any) {
      toast({ title: "Error", description: getUserFriendlyError(err), variant: "destructive" });
    }
    setDeletingImportId(null);
  };

  const fetchHistory = useCallback(async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase
      .from("imports")
      .select("id, file_name, status, row_count, created_at, error_message, period_id, pay_periods(start_date, end_date)")
      .eq("company_id", selectedCompanyId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data) { setImportHistory([]); return; }

    // Enrich with employee count and base total per import
    const enriched = await Promise.all(
      (data as any[]).map(async (imp) => {
        const { count } = await supabase
          .from("period_base_pay")
          .select("id", { count: "exact", head: true })
          .eq("import_id", imp.id);
        const { data: basePays } = await supabase
          .from("period_base_pay")
          .select("base_total_pay")
          .eq("import_id", imp.id);
        const total = (basePays ?? []).reduce((s: number, bp: any) => s + Number(bp.base_total_pay || 0), 0);
        return { ...imp, _emp_count: count ?? 0, _base_total: Math.round(total * 100) / 100 } as ImportHistory;
      })
    );
    setImportHistory(enriched);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.from("pay_periods").select("*").eq("company_id", selectedCompanyId).order("start_date", { ascending: false }).then(({ data }) => {
      setPeriods((data as Period[]) ?? []);
      setSelectedPeriod("");
    });
    fetchHistory();
  }, [selectedCompanyId, fetchHistory]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      toast({ title: "Error", description: "El archivo es demasiado grande (máx 10MB)", variant: "destructive" });
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = safeRead(evt.target?.result, { type: "binary" });
      setWorkbook(wb);
      setSheets(wb.SheetNames);
      if (wb.SheetNames.length === 1) {
        setSelectedSheet(wb.SheetNames[0]);
        processSheet(wb, wb.SheetNames[0]);
        setStep(3);
      } else {
        setStep(2);
      }
    };
    reader.readAsBinaryString(f);
  }, []);

  const processSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    const json = safeSheetToJson<Record<string, string>>(ws, { defval: "" });
    if (json.length === 0) return;
    const hdrs = Object.keys(json[0]);
    setHeaders(hdrs);
    setPreviewRows(json.slice(0, 5));

    // Auto-map
    const autoMap: Record<string, string> = {};
    hdrs.forEach((h) => {
      const match = KNOWN_HEADERS.find((k) => k.toLowerCase() === h.toLowerCase());
      if (match) autoMap[h] = match;
    });
    setMapping(autoMap);
  };

  const selectSheet = (name: string) => {
    setSelectedSheet(name);
    if (workbook) processSheet(workbook, name);
    setStep(3);
  };

  const computePreImportSummary = async () => {
    if (!workbook || !selectedPeriod || !selectedSheet) return;
    setPreImportSummary({ matched: [], unmatched: [] as { first_name: string; last_name: string }[], estimatedTotal: 0, loading: true });

    const ws = workbook.Sheets[selectedSheet];
    const allRows = safeSheetToJson<Record<string, string>>(ws, { defval: "" });

    const { data: employees } = await supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId!);
    const empList = employees ?? [];

    const reverseMap: Record<string, string> = {};
    Object.entries(mapping).forEach(([fileCol, knownCol]) => { reverseMap[knownCol] = fileCol; });

    const employeeGroups: Record<string, Record<string, string>[]> = {};
    allRows.forEach((row) => {
      const fn = String(row[reverseMap["First name"] ?? "First name"] ?? "").trim();
      const ln = String(row[reverseMap["Last name"] ?? "Last name"] ?? "").trim();
      const key = `${fn.toLowerCase()}|${ln.toLowerCase()}`;
      if (!employeeGroups[key]) employeeGroups[key] = [];
      employeeGroups[key].push(row);
    });

    const parseCurrency = (val: string): number => parseFloat(String(val || "0").replace(/[$,]/g, "")) || 0;
    const matched: { name: string; total: number }[] = [];
    const unmatched: { first_name: string; last_name: string }[] = [];
    let estimatedTotal = 0;

    for (const [key, rows] of Object.entries(employeeGroups)) {
      const [fn, ln] = key.split("|");
      const displayName = `${rows[0][reverseMap["First name"] ?? "First name"] || fn} ${rows[0][reverseMap["Last name"] ?? "Last name"] || ln}`;
      const emp = empList.find(e => e.first_name.toLowerCase() === fn && e.last_name.toLowerCase() === ln);
      const summaryRow = rows[rows.length - 1];

      const getVal = (knownCol: string, ...altCols: string[]) => {
        for (const col of [knownCol, ...altCols]) {
          const fileCol = reverseMap[col];
          if (fileCol && summaryRow[fileCol]) return parseCurrency(summaryRow[fileCol]);
        }
        return 0;
      };
      const total = getVal("Total pay", "Total pay USD");

      if (emp) {
        matched.push({ name: displayName, total });
        estimatedTotal += total;
      } else {
        unmatched.push({ first_name: fn, last_name: ln });
      }
    }

    setPreImportSummary({ matched, unmatched, estimatedTotal, loading: false });
  };

  const handleImport = async () => {
    if (!workbook || !selectedPeriod || !selectedSheet) return;
    setImporting(true);
    setResult(null);

    try {
      const ws = workbook.Sheets[selectedSheet];
      const allRows = safeSheetToJson<Record<string, string>>(ws, { defval: "" });
      if (allRows.length > MAX_ROW_COUNT) {
        throw new Error(`El archivo tiene demasiadas filas (${allRows.length}). Máximo permitido: ${MAX_ROW_COUNT}`);
      }
      // Get employees for matching
      const { data: employees } = await supabase.from("employees").select("id, first_name, last_name, verification_ssn_ein").eq("company_id", selectedCompanyId!);
      const empList = employees ?? [];

      // Create import record
      const { data: importRecord, error: impErr } = await supabase.from("imports").insert({
        period_id: selectedPeriod,
        file_name: file!.name,
        column_mapping: mapping,
        row_count: allRows.length,
        status: "processing",
        company_id: selectedCompanyId!,
      }).select().single();

      if (impErr || !importRecord) throw new Error(impErr?.message ?? "Failed to create import");

      // Delete existing base pay & shifts for this period (replace strategy)
      await supabase.from("period_base_pay").delete().eq("period_id", selectedPeriod);
      await supabase.from("shifts").delete().eq("period_id", selectedPeriod);

      // Find mapped column names
      const reverseMap: Record<string, string> = {};
      Object.entries(mapping).forEach(([fileCol, knownCol]) => {
        reverseMap[knownCol] = fileCol;
      });

      // Group by employee (first + last name)
      const employeeGroups: Record<string, Record<string, string>[]> = {};
      allRows.forEach((row) => {
        const fn = String(row[reverseMap["First name"] ?? "First name"] ?? "").trim();
        const ln = String(row[reverseMap["Last name"] ?? "Last name"] ?? "").trim();
        const key = `${fn.toLowerCase()}|${ln.toLowerCase()}`;
        if (!employeeGroups[key]) employeeGroups[key] = [];
        employeeGroups[key].push(row);
      });

      let matched = 0;
      let unmatched = 0;

      for (const [key, rows] of Object.entries(employeeGroups)) {
        const [fn, ln] = key.split("|");
        const emp = empList.find(
          (e) => e.first_name.toLowerCase() === fn && e.last_name.toLowerCase() === ln
        );

        if (!emp) {
          unmatched++;
          continue;
        }
        matched++;

        // Aggregate base pay from last row (summary row) or first row with Total pay
        const summaryRow = rows[rows.length - 1];
        const parseCurrency = (val: string): number => {
          // Handle "$1,549.60" format
          return parseFloat(String(val || "0").replace(/[$,]/g, "")) || 0;
        };
        const getVal = (knownCol: string, ...altCols: string[]) => {
          const cols = [knownCol, ...altCols];
          for (const col of cols) {
            const fileCol = reverseMap[col];
            if (fileCol && summaryRow[fileCol]) return parseCurrency(summaryRow[fileCol]);
          }
          return 0;
        };

        await supabase.from("period_base_pay").upsert({
          employee_id: emp.id,
          period_id: selectedPeriod,
          weekly_total_hours: getVal("Weekly total hours"),
          total_work_hours: getVal("Total work hours"),
          total_paid_hours: getVal("Total Paid Hours", "Total paid hours"),
          total_regular: getVal("Total Regular", "Regular"),
          total_overtime: getVal("Total overtime"),
          base_total_pay: getVal("Total pay", "Total pay USD"),
          import_id: importRecord.id,
        }, { onConflict: "employee_id,period_id" });

        // Insert shifts
        for (const row of rows) {
          const shiftNum = row[reverseMap["Shift Number"] ?? "Shift Number"] ?? "";
          if (!shiftNum && !row[reverseMap["Shift hours"] ?? "Shift hours"]) continue;

          await supabase.from("shifts").insert({
            employee_id: emp.id,
            period_id: selectedPeriod,
            import_id: importRecord.id,
            shift_number: shiftNum || null,
            scheduled_shift_title: row[reverseMap["Scheduled shift title"] ?? ""] || null,
            type: row[reverseMap["Type"] ?? ""] || null,
            job_code: row[reverseMap["Job code"] ?? ""] || null,
            sub_job: row[reverseMap["Sub-job"] ?? ""] || null,
            sub_job_code: row[reverseMap["Sub-job code"] ?? ""] || null,
            shift_hours: parseFloat(row[reverseMap["Shift hours"] ?? ""] || "0") || null,
            hourly_rate_usd: parseFloat(row[reverseMap["Hourly rate (USD)"] ?? ""] || "0") || null,
            daily_total_hours: parseFloat(row[reverseMap["Daily total hours"] ?? ""] || "0") || null,
            daily_total_pay_usd: parseFloat(row[reverseMap["Daily total pay (USD)"] ?? ""] || "0") || null,
            customer: row[reverseMap["Customer"] ?? ""] || null,
            ride: row[reverseMap["Ride"] ?? ""] || null,
            employee_notes: row[reverseMap["Employee notes"] ?? ""] || null,
            manager_notes: row[reverseMap["Manager notes"] ?? ""] || null,
          });
        }
      }

      await supabase.from("imports").update({ status: "completed" }).eq("id", importRecord.id);

      setResult({
        success: true,
        message: `Importación completada: ${matched} empleados procesados, ${unmatched} no encontrados.`,
      });
      setStep(4);
      fetchHistory();
    } catch (err: any) {
      setResult({ success: false, message: getUserFriendlyError(err) });
      toast({ title: "Error", description: getUserFriendlyError(err), variant: "destructive" });
    }

    setImporting(false);
  };

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="page-title">Importar Connecteam</h1>
          <p className="page-subtitle">Importa turnos y pagos desde archivos XLS, XLSX o CSV exportados de Connecteam</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0">
          <Download className="h-4 w-4 mr-2" /> Descargar plantilla
        </Button>
      </div>

      <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Instrucciones de importación</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Formatos aceptados: <strong>XLS, XLSX, CSV</strong></li>
            <li>Tamaño máximo: 10 MB / máximo 10,000 filas</li>
            <li>El archivo debe contener las columnas: <strong>First name, Last name</strong> (obligatorias) y columnas de turnos/pago</li>
            <li>Los empleados se emparejan por nombre exacto (nombre + apellido)</li>
            <li>Al importar se <strong>reemplazan</strong> los datos base y turnos del periodo seleccionado</li>
            <li>Los movimientos/novedades manuales <strong>no</strong> se afectan</li>
          </ul>
          <p className="text-xs mt-2">Descarga la plantilla de ejemplo para ver el formato esperado con todas las columnas.</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>
            {s}. {s === 1 ? "Periodo y archivo" : s === 2 ? "Hoja" : s === 3 ? "Mapeo" : "Resultado"}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Paso 1: Selecciona periodo y archivo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Periodo</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger><SelectValue placeholder="Seleccionar periodo" /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.start_date} → {p.end_date} ({p.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPeriod && (
              <div>
                <Label>Archivo XLS / XLSX / CSV</Label>
                <div className="mt-1 border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground mb-2">Arrastra o selecciona tu archivo exportado de Connecteam</p>
                  <input type="file" accept={ACCEPTED_EXTENSIONS} onChange={handleFileUpload} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Paso 2: Selecciona la hoja</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sheets.map(s => (
              <Button key={s} variant="outline" className="w-full justify-start" onClick={() => selectSheet(s)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> {s}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Paso 3: Mapeo de columnas</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs bg-muted px-2 py-1 rounded shrink-0 max-w-32 truncate" title={h}>{h}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-xs">{mapping[h] ?? "sin mapeo"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {previewRows.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Vista previa (primeras 5 filas)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.slice(0, 8).map(h => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i}>
                        {headers.slice(0, 8).map(h => <TableCell key={h} className="text-xs">{row[h]}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Button onClick={computePreImportSummary} disabled={importing || preImportSummary?.loading} className="w-full sm:w-auto">
            {preImportSummary?.loading ? "Analizando..." : "Verificar antes de importar"}
          </Button>

          {preImportSummary && !preImportSummary.loading && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Resumen pre-importación
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">{preImportSummary.matched.length}</p>
                    <p className="text-xs text-muted-foreground">Empleados encontrados</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-destructive">{preImportSummary.unmatched.length}</p>
                    <p className="text-xs text-muted-foreground">No encontrados</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">${preImportSummary.estimatedTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">Total estimado</p>
                  </div>
                </div>

                {preImportSummary.unmatched.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-destructive mb-1 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" /> Empleados no encontrados en el sistema
                    </p>
                    <div className="space-y-1.5 mt-2">
                      {preImportSummary.unmatched.map((emp, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            className="h-7 px-2 text-xs rounded border border-destructive/30 bg-background w-36 focus:outline-none focus:ring-1 focus:ring-ring"
                            value={emp.first_name}
                            onChange={(e) => {
                              const updated = [...preImportSummary.unmatched];
                              updated[i] = { ...updated[i], first_name: e.target.value };
                              setPreImportSummary({ ...preImportSummary, unmatched: updated });
                            }}
                            placeholder="Nombre"
                          />
                          <input
                            className="h-7 px-2 text-xs rounded border border-destructive/30 bg-background w-36 focus:outline-none focus:ring-1 focus:ring-ring"
                            value={emp.last_name}
                            onChange={(e) => {
                              const updated = [...preImportSummary.unmatched];
                              updated[i] = { ...updated[i], last_name: e.target.value };
                              setPreImportSummary({ ...preImportSummary, unmatched: updated });
                            }}
                            placeholder="Apellido"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-muted-foreground">Estos empleados serán omitidos, o puedes crearlos automáticamente.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCreateMissingEmployees}
                        disabled={creatingEmployees}
                        className="shrink-0"
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        {creatingEmployees ? "Creando..." : `Crear ${preImportSummary.unmatched.length} empleados`}
                      </Button>
                    </div>
                  </div>
                )}

                {preImportSummary.matched.length > 0 && (
                  <div className="max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Empleado</TableHead>
                          <TableHead className="text-xs text-right">Pago estimado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preImportSummary.matched.map((emp, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm py-1.5">{emp.name}</TableCell>
                            <TableCell className="text-right font-mono text-xs py-1.5">${emp.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => { handleImport(); setPreImportSummary(null); }} disabled={importing || preImportSummary.matched.length === 0} className="flex-1 sm:flex-none">
                    {importing ? "Importando..." : `Confirmar importación (${preImportSummary.matched.length} empleados)`}
                  </Button>
                  <Button variant="outline" onClick={() => setPreImportSummary(null)}>Cancelar</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === 4 && result && (
        <Card>
          <CardContent className="py-12 text-center">
            {result.success ? (
              <CheckCircle2 className="h-12 w-12 text-earning mx-auto mb-4" />
            ) : (
              <AlertCircle className="h-12 w-12 text-deduction mx-auto mb-4" />
            )}
            <p className="text-lg font-medium">{result.message}</p>
            <Button className="mt-4" onClick={() => { setStep(1); setResult(null); setFile(null); setPreImportSummary(null); }}>
              Nueva importación
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      {importHistory.length > 0 && (
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Historial de importaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Periodo</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead className="text-center">Filas</TableHead>
                  <TableHead className="text-center">Empleados</TableHead>
                  <TableHead className="text-right">Base total</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {importHistory.map((imp) => (
                  <React.Fragment key={imp.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(imp.id)}>
                      <TableCell className="w-10 px-2">
                        {expandedImport === imp.id
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {imp.pay_periods
                          ? `${imp.pay_periods.start_date} → ${imp.pay_periods.end_date}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-40 truncate" title={imp.file_name}>
                        <div className="flex items-center gap-1.5">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {imp.file_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">{imp.row_count ?? "—"}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono text-xs">{imp._emp_count}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {imp._base_total ? `$${imp._base_total.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={imp.status === "completed" ? "default" : imp.status === "processing" ? "secondary" : "destructive"} className="text-xs">
                          {imp.status === "completed" ? "Completado" : imp.status === "processing" ? "Procesando" : imp.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(imp.created_at).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </TableCell>
                      <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={deletingImportId === imp.id}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar importación?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminarán los datos base y turnos asociados a esta importación ({imp.file_name}). Los movimientos manuales del periodo no se verán afectados. Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteImport(imp.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                    {expandedImport === imp.id && (
                      <TableRow key={`${imp.id}-detail`}>
                        <TableCell colSpan={9} className="p-0">
                          <div className="bg-muted/30 px-6 py-3">
                            {loadingDetail ? (
                              <p className="text-sm text-muted-foreground py-2">Cargando detalle...</p>
                            ) : expandedEmployees.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">Sin empleados procesados en esta importación</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Empleado</TableHead>
                                    <TableHead className="text-xs text-right">Horas trabajadas</TableHead>
                                    <TableHead className="text-xs text-right">Horas extra</TableHead>
                                    <TableHead className="text-xs text-right">Horas pagadas</TableHead>
                                    <TableHead className="text-xs text-right font-bold">Pago base</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {expandedEmployees.map((emp, i) => (
                                    <TableRow key={i} className="border-muted">
                                      <TableCell className="text-sm font-medium py-1.5">{emp.first_name} {emp.last_name}</TableCell>
                                      <TableCell className="text-right font-mono text-xs py-1.5">{emp.total_work_hours != null ? emp.total_work_hours.toFixed(1) : "—"}</TableCell>
                                      <TableCell className="text-right font-mono text-xs py-1.5">{emp.total_overtime != null ? emp.total_overtime.toFixed(1) : "—"}</TableCell>
                                      <TableCell className="text-right font-mono text-xs py-1.5">{emp.total_paid_hours != null ? emp.total_paid_hours.toFixed(1) : "—"}</TableCell>
                                      <TableCell className="text-right font-mono text-xs font-bold py-1.5">${emp.base_total_pay.toFixed(2)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
