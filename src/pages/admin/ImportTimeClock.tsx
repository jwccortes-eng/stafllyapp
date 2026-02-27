import React, { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronDown, Info, CalendarDays, Users, Clock, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { safeRead, safeSheetToJson, getSheetNames, getSheet } from "@/lib/safe-xlsx";
import type { SafeWorkbook } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ".xls,.xlsx";

interface ClockEntry {
  firstName: string;
  lastName: string;
  job: string;        // "02 - ELY PRODUCCION"
  subItem: string;    // "Event A"
  clockIn: Date;
  clockOut: Date | null;
  clockInLocation: string;
  clockOutLocation: string;
  clockInDevice: string;
  clockOutDevice: string;
  shiftHours: number;
  hourlyRate: number;
  scheduledShiftTitle: string;
  employeeNotes: string;
  managerNotes: string;
}

interface ImportSummary {
  totalEntries: number;
  matchedEmployees: number;
  linkedShifts: number;
  unmatchedEmployees: string[];
  skippedOverlap: number;
}

/**
 * Parse "01/31/2026 Sat" + "08:00 AM" → Date
 */
function parseClockTimestamp(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  // Extract the date part: "01/31/2026"
  const dateParts = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!dateParts) return null;

  const month = parseInt(dateParts[1], 10);
  const day = parseInt(dateParts[2], 10);
  const year = parseInt(dateParts[3], 10);

  // Parse time: "08:00 AM"
  const timeParts = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!timeParts) return null;

  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const ampm = timeParts[3].toUpperCase();

  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  return new Date(year, month - 1, day, hours, minutes, 0);
}

/**
 * Check if a row is a summary row (no shift data, just totals)
 */
function isSummaryRow(row: Record<string, string>): boolean {
  const shiftNum = (row["Shift Number"] ?? "").trim();
  const type = (row["Type"] ?? "").trim();
  // Summary rows have no Shift Number and no Type but have Total fields
  return !shiftNum && !type;
}

export default function ImportTimeClock() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<SafeWorkbook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

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
      if (names.length === 1) {
        setSelectedSheet(names[0]);
        processSheet(wb, names[0]);
      } else {
        setStep(2);
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const processSheet = (wb: SafeWorkbook, sheetName: string) => {
    const ws = getSheet(wb, sheetName);
    if (!ws) return;
    const json = safeSheetToJson<Record<string, string>>(ws, { defval: "" });
    if (json.length === 0) return;

    const parsed: ClockEntry[] = [];
    const allDates: string[] = [];

    for (const row of json) {
      if (isSummaryRow(row)) continue;

      const firstName = (row["First name"] ?? "").trim();
      const lastName = (row["Last name"] ?? "").trim();
      if (!firstName && !lastName) continue;

      // There are TWO "Start Date" columns - the first is profile start date, the second is clock start date
      // ExcelJS handles duplicates by appending _1, _2 etc. Let's find the right ones.
      // The clock columns come after "Sub-job code"
      const startDateKey = findClockDateKey(row, "Start Date", true);
      const endDateKey = findClockDateKey(row, "End Date", true);

      const startDateRaw = row[startDateKey] ?? "";
      const inRaw = (row["In"] ?? "").trim();
      const endDateRaw = row[endDateKey] ?? "";
      const outRaw = (row["Out"] ?? "").trim();

      const clockIn = parseClockTimestamp(startDateRaw, inRaw);
      if (!clockIn) continue;

      const clockOut = parseClockTimestamp(endDateRaw, outRaw);

      const isoDate = clockIn.toISOString().slice(0, 10);
      allDates.push(isoDate);

      parsed.push({
        firstName,
        lastName,
        job: (row["Type"] ?? "").trim(),
        subItem: (row["Sub item"] ?? "").trim(),
        clockIn,
        clockOut,
        clockInLocation: (row["Start - location"] ?? "").trim(),
        clockOutLocation: (row["End - location"] ?? "").trim(),
        clockInDevice: (row["Start - device"] ?? "").trim(),
        clockOutDevice: (row["End - device"] ?? "").trim(),
        shiftHours: parseFloat(row["Shift hours"] ?? "0") || 0,
        hourlyRate: parseFloat(row["Hourly rate (USD)"] ?? "0") || 0,
        scheduledShiftTitle: (row["Scheduled shift title"] ?? "").trim(),
        employeeNotes: (row["Employee notes"] ?? "").trim(),
        managerNotes: (row["Manager notes"] ?? "").trim(),
      });
    }

    setEntries(parsed);

    if (allDates.length > 0) {
      allDates.sort();
      setDateRange({ from: allDates[0], to: allDates[allDates.length - 1] });
      setFilterFrom(allDates[0]);
      setFilterTo(allDates[allDates.length - 1]);
    }

    setStep(3);
  };

  const selectSheet = (name: string) => {
    setSelectedSheet(name);
    if (workbook) processSheet(workbook, name);
  };

  const filteredEntries = entries.filter(e => {
    const d = e.clockIn.toISOString().slice(0, 10);
    if (filterFrom && d < filterFrom) return false;
    if (filterTo && d > filterTo) return false;
    return true;
  });

  const handleImport = async () => {
    if (!selectedCompanyId || filteredEntries.length === 0) return;
    setImporting(true);
    setResult(null);

    try {
      // Fetch employees and scheduled_shifts for matching
      const [{ data: employees }, { data: shifts }] = await Promise.all([
        supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId),
        supabase.from("scheduled_shifts").select("id, shift_code, date").eq("company_id", selectedCompanyId).is("deleted_at", null),
      ]);
      const empList = employees ?? [];
      const shiftList = shifts ?? [];

      // Build name→employee map
      const empMap = new Map<string, string>();
      empList.forEach(e => {
        empMap.set(`${e.first_name} ${e.last_name}`.toLowerCase(), e.id);
      });

      // Build shift_code→shift map (by code + date for precision)
      const shiftMap = new Map<string, string>();
      shiftList.forEach(s => {
        if (s.shift_code) {
          shiftMap.set(`${s.shift_code}|${s.date}`, s.id);
        }
      });

      let totalEntries = 0;
      let matchedEmployees = 0;
      let linkedShifts = 0;
      let skippedOverlap = 0;
      const unmatchedSet = new Set<string>();

      for (const entry of filteredEntries) {
        const empName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
        const empId = empMap.get(empName);
        if (!empId) {
          unmatchedSet.add(`${entry.firstName} ${entry.lastName}`);
          continue;
        }
        matchedEmployees++;

        // Try to link to scheduled_shift via shift code
        let shiftId: string | null = null;
        if (entry.scheduledShiftTitle) {
          const clockDate = entry.clockIn.toISOString().slice(0, 10);
          shiftId = shiftMap.get(`${entry.scheduledShiftTitle}|${clockDate}`) ?? null;
          if (shiftId) linkedShifts++;
        }

        // Build notes from employee + manager notes
        const notesParts: string[] = [];
        if (entry.employeeNotes) notesParts.push(`Empleado: ${entry.employeeNotes}`);
        if (entry.managerNotes) notesParts.push(`Manager: ${entry.managerNotes}`);
        notesParts.push("[Importado Connecteam]");

        const { error } = await supabase.from("time_entries").insert({
          company_id: selectedCompanyId,
          employee_id: empId,
          shift_id: shiftId,
          clock_in: entry.clockIn.toISOString(),
          clock_out: entry.clockOut?.toISOString() ?? null,
          notes: notesParts.join(" | "),
          status: "approved",
        });

        if (error) {
          if (error.message?.includes("overlap") || error.code === "23505") {
            skippedOverlap++;
          } else {
            console.warn("Time entry insert error:", error.message);
          }
          continue;
        }

        totalEntries++;
      }

      const summaryData: ImportSummary = {
        totalEntries,
        matchedEmployees,
        linkedShifts,
        unmatchedEmployees: Array.from(unmatchedSet),
        skippedOverlap,
      };
      setSummary(summaryData);

      const overlapMsg = skippedOverlap > 0 ? ` · ${skippedOverlap} omitidos (solapamiento)` : "";
      const unmatchedMsg = summaryData.unmatchedEmployees.length > 0
        ? ` · ${summaryData.unmatchedEmployees.length} empleados no encontrados`
        : "";

      setResult({
        success: true,
        message: `Importación completada: ${totalEntries} registros de reloj, ${linkedShifts} vinculados a turnos${unmatchedMsg}${overlapMsg}.`,
      });
      setStep(4);
    } catch (err: any) {
      setResult({ success: false, message: getUserFriendlyError(err) });
      toast({ title: "Error", description: getUserFriendlyError(err), variant: "destructive" });
    }

    setImporting(false);
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setWorkbook(null);
    setEntries([]);
    setResult(null);
    setSummary(null);
    setDateRange(null);
  };

  // Unique employees in filtered entries
  const uniqueEmployees = new Set(filteredEntries.map(e => `${e.firstName} ${e.lastName}`));
  const uniqueClients = new Set(filteredEntries.map(e => e.job).filter(Boolean));
  const totalHours = filteredEntries.reduce((s, e) => s + e.shiftHours, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        variant="3"
        title="Importar Registros de Reloj"
        subtitle="Time Clock Shift Report de Connecteam → Entradas de reloj"
      />

      {/* Instructions */}
      <details className="rounded-2xl border bg-card group">
        <summary className="flex items-center gap-3 p-4 cursor-pointer text-sm font-medium text-foreground select-none">
          <Info className="h-4 w-4 text-primary shrink-0" />
          Instrucciones de importación
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 text-sm text-muted-foreground space-y-1 border-t pt-3 mx-4">
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>Sube el archivo <strong>Time Clock Shift Report</strong> de Connecteam (.xlsx)</li>
            <li>Se crean <strong>entradas de reloj</strong> (time_entries) con clock in/out</li>
            <li>Los registros se vinculan a <strong>turnos programados</strong> por código de turno</li>
            <li>Los empleados se emparejan por nombre completo</li>
            <li>Los registros duplicados o con solapamiento se omiten automáticamente</li>
            <li>Puedes filtrar por rango de fechas antes de importar</li>
          </ul>
        </div>
      </details>

      {/* Steps */}
      <div className="flex items-center gap-1.5">
        {[
          { n: 1, label: "Archivo" },
          { n: 2, label: "Hoja" },
          { n: 3, label: "Revisión" },
          { n: 4, label: "Resultado" },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            {i > 0 && <div className={`h-px flex-1 ${step >= s.n ? "bg-primary" : "bg-border"}`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              step === s.n ? "bg-primary text-primary-foreground" : step > s.n ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              <span className="tabular-nums">{s.n}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Paso 1: Selecciona el archivo de Time Clock Shift Report</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Archivo XLSX de Time Clock Shift Report</Label>
              <div className="mt-1 border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground mb-2">Arrastra o selecciona tu archivo Time Clock Shift Report de Connecteam</p>
                <input type="file" accept={ACCEPTED_EXTENSIONS} onChange={handleFileUpload} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Sheet selection */}
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

      {/* Step 3: Review & Import */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4" /> Registros
              </div>
              <p className="text-2xl font-bold tabular-nums">{filteredEntries.length}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Users className="h-4 w-4" /> Empleados
              </div>
              <p className="text-2xl font-bold tabular-nums">{uniqueEmployees.size}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Building2 className="h-4 w-4" /> Clientes
              </div>
              <p className="text-2xl font-bold tabular-nums">{uniqueClients.size}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CalendarDays className="h-4 w-4" /> Horas totales
              </div>
              <p className="text-2xl font-bold tabular-nums">{totalHours.toFixed(1)}</p>
            </Card>
          </div>

          {/* Date filter */}
          {dateRange && (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <Label className="text-xs">Desde</Label>
                    <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="block mt-1 border rounded-lg px-3 py-1.5 text-sm bg-background" />
                  </div>
                  <div>
                    <Label className="text-xs">Hasta</Label>
                    <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="block mt-1 border rounded-lg px-3 py-1.5 text-sm bg-background" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Archivo: {dateRange.from} → {dateRange.to}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Vista previa (primeros 20 registros)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Empleado</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Entrada</TableHead>
                    <TableHead className="text-xs">Salida</TableHead>
                    <TableHead className="text-xs">Horas</TableHead>
                    <TableHead className="text-xs">Cliente (Job)</TableHead>
                    <TableHead className="text-xs">Turno vinculado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.slice(0, 20).map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{e.firstName} {e.lastName}</TableCell>
                      <TableCell className="text-xs">{e.clockIn.toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs">{e.clockIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                      <TableCell className="text-xs">{e.clockOut?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) ?? "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">{e.shiftHours.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{e.job || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{e.scheduledShiftTitle ? `#${e.scheduledShiftTitle}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredEntries.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2 px-1">… y {filteredEntries.length - 20} registros más</p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={reset}>
              ← Cambiar archivo
            </Button>
            <Button onClick={handleImport} disabled={importing || filteredEntries.length === 0}>
              {importing ? "Importando…" : `Importar ${filteredEntries.length} registros`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 4 && result && (
        <div className="space-y-4">
          <Card className={result.success ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-destructive/30 bg-destructive/5"}>
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                {result.success ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />}
                <div>
                  <p className="font-semibold text-sm">{result.success ? "Importación exitosa" : "Error en importación"}</p>
                  <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{summary.totalEntries}</p>
                <p className="text-xs text-muted-foreground">Registros creados</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{summary.linkedShifts}</p>
                <p className="text-xs text-muted-foreground">Vinculados a turnos</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold tabular-nums">{summary.skippedOverlap}</p>
                <p className="text-xs text-muted-foreground">Omitidos (solapamiento)</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold tabular-nums">{summary.unmatchedEmployees.length}</p>
                <p className="text-xs text-muted-foreground">No encontrados</p>
              </Card>
            </div>
          )}

          {summary && summary.unmatchedEmployees.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm text-warning">Empleados no encontrados ({summary.unmatchedEmployees.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {summary.unmatchedEmployees.map((e, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{e}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button variant="outline" onClick={reset}>
            Importar otro archivo
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Find the correct "Start Date" or "End Date" key for clock data.
 * Connecteam exports have duplicate headers — the profile "Start Date" comes first,
 * then the clock "Start Date" appears later. ExcelJS may rename duplicates.
 * We look for the key that contains a day-of-week pattern (e.g., "01/31/2026 Sat").
 */
function findClockDateKey(row: Record<string, string>, baseName: string, _isClock: boolean): string {
  // First, check if there are multiple keys containing the base name
  const candidates = Object.keys(row).filter(k =>
    k.toLowerCase().replace(/[_\d]/g, "").trim() === baseName.toLowerCase()
    || k === baseName
  );

  if (candidates.length <= 1) return baseName;

  // Find the one with a day-of-week pattern (Mon, Tue, Wed, etc.)
  for (const key of candidates) {
    const val = (row[key] ?? "").trim();
    if (/\d{1,2}\/\d{1,2}\/\d{4}\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(val)) {
      return key;
    }
  }

  // Fallback: return the last one (usually the clock date)
  return candidates[candidates.length - 1];
}
