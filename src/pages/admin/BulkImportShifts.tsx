import React, { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Calendar, Users, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { safeRead, safeSheetToJson, getSheetNames, getSheet } from "@/lib/safe-xlsx";
import type { SafeWorkbook } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface ShiftRow {
  firstName: string;
  lastName: string;
  employerId: string;
  shiftNumber: string;
  type: string;
  subItem: string;
  startDate: string;
  clockIn: string;
  clockInLocation: string;
  clockInDevice: string;
  endDate: string;
  clockOut: string;
  clockOutLocation: string;
  clockOutDevice: string;
  shiftHours: number;
  hourlyRate: number;
  customer: string;
  equipment: string;
  equipmentShortCode: string;
  ride: string;
  payRide: string;
  scheduledShiftTitle: string;
  employeeNotes: string;
  managerNotes: string;
}

interface PeriodBucket {
  startDate: string;
  endDate: string;
  shifts: ShiftRow[];
}

function parseClockDate(dateVal: string): string | null {
  if (!dateVal?.trim()) return null;
  const trimmed = dateVal.trim();
  // MM/DD/YYYY format
  const parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (parts) {
    const m = parts[1].padStart(2, "0");
    const d = parts[2].padStart(2, "0");
    return `${parts[3]}-${m}-${d}`;
  }
  // Try JS Date parse (ExcelJS date objects stringified)
  const jsDate = new Date(trimmed);
  if (!isNaN(jsDate.getTime())) {
    return jsDate.toISOString().slice(0, 10);
  }
  return null;
}

function parseTime(timeStr: string): string {
  return (timeStr ?? "").trim();
}

function isSummaryRow(row: Record<string, string>): boolean {
  const shiftNum = (row["Shift Number"] ?? "").trim();
  const type = (row["Type"] ?? "").trim();
  return !shiftNum && !type;
}

/** 
 * Find period bucket for a date. Periods are Wed-Tue.
 * Returns the period start/end dates.
 */
function getPeriodForDate(dateStr: string): { startDate: string; endDate: string } {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  // Week starts Wednesday (3)
  let diff = day - 3;
  if (diff < 0) diff += 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export default function BulkImportShifts() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [buckets, setBuckets] = useState<PeriodBucket[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [uniqueEmployees, setUniqueEmployees] = useState<string[]>([]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      toast({ title: "Error", description: "Archivo demasiado grande (máx 20MB)", variant: "destructive" });
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = evt.target?.result;
      if (!data) return;
      const wb = await safeRead(data as ArrayBuffer);
      const names = getSheetNames(wb);
      const ws = getSheet(wb, names[0]);
      if (!ws) return;
      const json = safeSheetToJson<Record<string, string>>(ws, { defval: "" });

      const parsed: ShiftRow[] = [];
      const empSet = new Set<string>();

      for (const row of json) {
        if (isSummaryRow(row)) continue;
        const firstName = (row["First name"] ?? "").trim();
        const lastName = (row["Last name"] ?? "").trim();
        if (!firstName && !lastName) continue;

        // Find the clock Start Date (not the employee profile start date)
        // The file has duplicate "Start Date" columns - ExcelJS adds _1 suffix
        const keys = Object.keys(row);
        let clockStartKey = "Start Date";
        let clockEndKey = "End Date";
        // Look for duplicated keys with _1 suffix or the one after "Sub item"
        const subItemIdx = keys.indexOf("Sub item");
        if (subItemIdx >= 0) {
          for (let i = subItemIdx + 1; i < keys.length; i++) {
            if (keys[i].startsWith("Start Date")) { clockStartKey = keys[i]; break; }
          }
          for (let i = subItemIdx + 1; i < keys.length; i++) {
            if (keys[i].startsWith("End Date")) { clockEndKey = keys[i]; break; }
          }
        }

        const startDate = parseClockDate(row[clockStartKey] ?? "");
        const endDate = parseClockDate(row[clockEndKey] ?? "");
        if (!startDate) continue;

        const shiftHours = parseFloat(row["Shift hours"] ?? "0") || 0;
        if (shiftHours <= 0) continue; // skip 0-hour entries

        empSet.add(`${firstName} ${lastName}`);

        parsed.push({
          firstName,
          lastName,
          employerId: (row["Employer identification"] ?? "").trim(),
          shiftNumber: (row["Shift Number"] ?? "").trim(),
          type: (row["Type"] ?? "").trim(),
          subItem: (row["Sub item"] ?? "").trim(),
          startDate,
          clockIn: parseTime(row["In"]),
          clockInLocation: (row["Start - location"] ?? "").trim(),
          clockInDevice: (row["Start - device"] ?? "").trim(),
          endDate: endDate || startDate,
          clockOut: parseTime(row["Out"]),
          clockOutLocation: (row["End - location"] ?? "").trim(),
          clockOutDevice: (row["End - device"] ?? "").trim(),
          shiftHours,
          hourlyRate: parseFloat(row["Hourly rate (USD)"] ?? "0") || 0,
          customer: (row["Customer"] ?? "").trim(),
          equipment: (row["Equipment"] ?? "").trim(),
          equipmentShortCode: (row["Equipment (Short code)"] ?? "").trim(),
          ride: (row["Ride"] ?? "").trim(),
          payRide: (row["Pay Ride"] ?? "").trim(),
          scheduledShiftTitle: (row["Scheduled shift title"] ?? "").trim(),
          employeeNotes: (row["Employee notes"] ?? "").trim(),
          managerNotes: (row["Manager notes"] ?? "").trim(),
        });
      }

      setRows(parsed);
      setUniqueEmployees(Array.from(empSet).sort());

      // Group by period buckets
      const bucketMap = new Map<string, PeriodBucket>();
      for (const shift of parsed) {
        const period = getPeriodForDate(shift.startDate);
        const key = period.startDate;
        if (!bucketMap.has(key)) {
          bucketMap.set(key, { ...period, shifts: [] });
        }
        bucketMap.get(key)!.shifts.push(shift);
      }
      const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => a.startDate.localeCompare(b.startDate));
      setBuckets(sortedBuckets);
      setStep(2);
    };
    reader.readAsArrayBuffer(f);
  }, [toast]);

  const handleImport = async () => {
    if (!selectedCompanyId || rows.length === 0) return;
    setImporting(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("bulk-import-shifts", {
        body: { companyId: selectedCompanyId, rows },
      });

      if (error) throw error;
      setResult(data);
      setStep(3);
      toast({ title: "Importación completada", description: `${data.inserted} turnos importados en ${data.periodSummary?.length || 0} periodos` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Error al importar", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const fmt = (d: string) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("es-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        variant="3"
        title="Importar Consolidado de Horas"
        subtitle="Carga masiva de turnos desde Connecteam a múltiples periodos"
      />

      {/* Step 1: File Upload */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-6">
            <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border/60 p-10 cursor-pointer hover:border-primary/40 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Arrastra o selecciona el archivo Excel de Connecteam
              </span>
              <span className="text-xs text-muted-foreground/60">
                Formato: Time Clock / Shift Report Overview (.xlsx)
              </span>
              <input
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview & Confirm */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <span className="font-medium">{file?.name}</span>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Clock className="h-8 w-8 text-primary/60" />
                <div>
                  <p className="text-2xl font-bold">{rows.length.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Turnos detectados</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Users className="h-8 w-8 text-primary/60" />
                <div>
                  <p className="text-2xl font-bold">{uniqueEmployees.length}</p>
                  <p className="text-xs text-muted-foreground">Empleados</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Calendar className="h-8 w-8 text-primary/60" />
                <div>
                  <p className="text-2xl font-bold">{buckets.length}</p>
                  <p className="text-xs text-muted-foreground">Periodos (cortes)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Period Buckets Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Distribución por Corte Semanal (Mié → Mar)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead className="text-right">Turnos</TableHead>
                    <TableHead className="text-right">Empleados</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buckets.map((b) => {
                    const empSet = new Set(b.shifts.map(s => `${s.firstName} ${s.lastName}`));
                    const totalHours = b.shifts.reduce((sum, s) => sum + s.shiftHours, 0);
                    return (
                      <TableRow key={b.startDate}>
                        <TableCell className="font-medium">
                          {fmt(b.startDate)} – {fmt(b.endDate)}
                        </TableCell>
                        <TableCell className="text-right">{b.shifts.length}</TableCell>
                        <TableCell className="text-right">{empSet.size}</TableCell>
                        <TableCell className="text-right">{totalHours.toFixed(1)}h</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep(1); setFile(null); setRows([]); setBuckets([]); }}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {rows.length} turnos en {buckets.length} periodos
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && result && (
        <div className="space-y-4">
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-green-900">Importación completada</p>
                  <p className="text-sm text-green-800">
                    {result.inserted} turnos importados exitosamente
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-green-600">{result.inserted}</p>
                <p className="text-xs text-muted-foreground">Insertados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{result.skippedDuplicate}</p>
                <p className="text-xs text-muted-foreground">Duplicados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-red-600">{result.skippedNoEmployee}</p>
                <p className="text-xs text-muted-foreground">Sin empleado</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-slate-600">{result.skippedNoPeriod}</p>
                <p className="text-xs text-muted-foreground">Sin periodo</p>
              </CardContent>
            </Card>
          </div>

          {/* Period breakdown */}
          {result.periodSummary?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Turnos por Periodo</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periodo</TableHead>
                      <TableHead className="text-right">Turnos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.periodSummary.map((p: any) => (
                      <TableRow key={p.periodId}>
                        <TableCell>{fmt(p.startDate)} – {fmt(p.endDate)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{p.shiftsInserted}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Unmatched employees */}
          {result.unmatchedEmployees?.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Empleados no encontrados ({result.unmatchedEmployees.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.unmatchedEmployees.map((name: string) => (
                    <Badge key={name} variant="outline" className="text-amber-700">{name}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button variant="outline" onClick={() => { setStep(1); setFile(null); setRows([]); setBuckets([]); setResult(null); }}>
            Importar otro archivo
          </Button>
        </div>
      )}
    </div>
  );
}
