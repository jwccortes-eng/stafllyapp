import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronDown, Trash2, Info, Lock, CalendarDays, Users, MapPin, Building2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { safeRead, safeSheetToJson, getSheetNames, getSheet } from "@/lib/safe-xlsx";
import type { SafeWorkbook } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parse } from "date-fns";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ".xls,.xlsx,.csv";

// Schedule Export column names from Connecteam
const SCHEDULE_HEADERS = [
  "Date", "Start", "End", "Timezone", "Availability status",
  "Shift title", "Job", "Sub item", "Address", "Users",
  "Shift tags", "Note", "Note has attachments", "Draft",
  "Unpaid Breaks", "Paid Breaks", "Last Status", "Tasks",
  "Check In", "Check In Note", "Check In GPS",
  "Complete", "Complete Note", "Complete GPS",
];

interface ShiftGroup {
  key: string;
  shiftCode: string;
  date: string;          // ISO date
  startTime: string;     // HH:mm
  endTime: string;       // HH:mm
  job: string;           // Client name
  subItem: string;       // Sub item / shift type
  address: string;
  note: string;
  tags: string;
  status: string;
  employees: string[];   // User names assigned
}

interface ImportSummary {
  totalShifts: number;
  totalAssignments: number;
  totalUnavailable: number;
  matchedEmployees: number;
  unmatchedEmployees: string[];
  matchedClients: number;
  unmatchedClients: string[];
}

/**
 * Parse time strings like "05:30am", "11:30pm", "All Day" → "HH:mm" (24h)
 */
function parseTime(raw: string): string | null {
  if (!raw || raw.toLowerCase().includes("all day")) return null;
  const cleaned = raw.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[3].toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m}`;
}

/**
 * Parse date: MM/DD/YYYY → YYYY-MM-DD
 */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

/**
 * Parse "Users" column → name (may have multiple users on same row, but Connecteam usually has one per row)
 */
function parseName(raw: string): { first: string; last: string } | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function ImportSchedule() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<SafeWorkbook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [shiftGroups, setShiftGroups] = useState<ShiftGroup[]>([]);
  const [unavailableRecords, setUnavailableRecords] = useState<{ name: string; date: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [deletePasswordOpen, setDeletePasswordOpen] = useState(false);

  // Filter dates if the range is large
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

    const hdrs = Object.keys(json[0]);
    setHeaders(hdrs);
    setPreviewRows(json.slice(0, 5));

    // Parse all rows into shift groups
    const groups: Record<string, ShiftGroup> = {};
    const unavail: { name: string; date: string }[] = [];
    const allDates: string[] = [];

    for (const row of json) {
      const dateRaw = row["Date"] ?? "";
      const isoDate = parseDate(dateRaw);
      if (!isoDate) continue;

      allDates.push(isoDate);
      const availStatus = (row["Availability status"] ?? "").trim().toLowerCase();
      const userName = (row["Users"] ?? "").trim();

      // Handle Unavailable rows
      if (availStatus === "unavailable") {
        if (userName) {
          unavail.push({ name: userName, date: isoDate });
        }
        continue;
      }

      const shiftTitle = (row["Shift title"] ?? "").trim();
      const startRaw = (row["Start"] ?? "").trim();
      const endRaw = (row["End"] ?? "").trim();
      const job = (row["Job"] ?? "").trim();

      // Skip rows without shift data
      if (!shiftTitle && !job && !startRaw) continue;

      const startTime = parseTime(startRaw);
      const endTime = parseTime(endRaw);
      if (!startTime || !endTime) continue;

      // Group key: same shift code + date + times + job
      const groupKey = `${shiftTitle}|${isoDate}|${startTime}|${endTime}|${job}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          shiftCode: shiftTitle,
          date: isoDate,
          startTime,
          endTime,
          job,
          subItem: (row["Sub item"] ?? "").trim(),
          address: (row["Address"] ?? "").trim(),
          note: (row["Note"] ?? "").trim(),
          tags: (row["Shift tags"] ?? "").trim(),
          status: (row["Last Status"] ?? "").trim(),
          employees: [],
        };
      }

      if (userName && !groups[groupKey].employees.includes(userName)) {
        groups[groupKey].employees.push(userName);
      }
    }

    const groupList = Object.values(groups);
    setShiftGroups(groupList);
    setUnavailableRecords(unavail);

    // Date range
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

  const filteredGroups = shiftGroups.filter(g => {
    if (filterFrom && g.date < filterFrom) return false;
    if (filterTo && g.date > filterTo) return false;
    return true;
  });

  const handleImport = async () => {
    if (!selectedCompanyId || filteredGroups.length === 0) return;
    setImporting(true);
    setResult(null);

    try {
      // Fetch employees and clients for matching
      const [{ data: employees }, { data: clients }] = await Promise.all([
        supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId),
        supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      ]);
      const empList = employees ?? [];
      const clientList = clients ?? [];

      // Build name→employee map (case-insensitive full name)
      const empMap = new Map<string, string>();
      empList.forEach(e => {
        empMap.set(`${e.first_name} ${e.last_name}`.toLowerCase(), e.id);
      });

      // Build client name map - fuzzy match on the name part (e.g., "02 - ELY PRODUCCION" → match "ELY PRODUCCION")
      const clientMap = new Map<string, string>(); // normalized name → id
      clientList.forEach(c => clientMap.set(c.name.toLowerCase(), c.id));

      const matchClient = (jobName: string): string | null => {
        if (!jobName) return null;
        const jobLower = jobName.toLowerCase();
        if (clientMap.has(jobLower)) return clientMap.get(jobLower)!;
        const stripped = jobName.replace(/^\d+\s*[-–]\s*/, "").trim().toLowerCase();
        for (const [key, id] of clientMap.entries()) {
          if (key === stripped || stripped.includes(key) || key.includes(stripped)) return id;
        }
        return null;
      };

      // ── Auto-create unmatched clients ──
      const allJobNames = new Set(filteredGroups.map(g => g.job).filter(Boolean));
      let createdClients = 0;
      for (const jobName of allJobNames) {
        if (matchClient(jobName)) continue;
        const cleanName = jobName.replace(/^\d+\s*[-–]\s*/, "").trim() || jobName;
        const { data: newClient } = await supabase.from("clients").insert({
          company_id: selectedCompanyId,
          name: cleanName,
          notes: `Creado automáticamente desde importación de Connecteam (original: "${jobName}")`,
        } as any).select("id, name").single();
        if (newClient) {
          clientMap.set(cleanName.toLowerCase(), newClient.id);
          clientMap.set(jobName.toLowerCase(), newClient.id);
          createdClients++;
        }
      }

      // ── Auto-create unmatched employees ──
      const allEmpNames = new Set(filteredGroups.flatMap(g => g.employees));
      let createdEmployees = 0;
      for (const empName of allEmpNames) {
        if (empMap.has(empName.toLowerCase())) continue;
        const parsed = parseName(empName);
        if (!parsed) continue;
        // Skip system/placeholder users like "SYSTEM 1"
        if (/^system\s/i.test(empName)) continue;
        const { data: newEmp } = await supabase.from("employees").insert({
          company_id: selectedCompanyId,
          first_name: parsed.first,
          last_name: parsed.last,
          is_active: true,
        } as any).select("id").single();
        if (newEmp) {
          empMap.set(empName.toLowerCase(), newEmp.id);
          createdEmployees++;
        }
      }

      let totalShifts = 0;
      let totalAssignments = 0;
      let matchedEmployees = 0;
      let unmatchedEmployeesSet = new Set<string>();
      let matchedClients = 0;
      let unmatchedClientsSet = new Set<string>();

      for (const group of filteredGroups) {
        const clientId = matchClient(group.job);
        if (clientId) matchedClients++;
        else if (group.job) unmatchedClientsSet.add(group.job);

        // Build title: "[shiftCode] Job - SubItem" or just job name
        let title = "";
        if (group.shiftCode) title += `#${group.shiftCode.padStart(4, "0")} `;
        if (group.job) title += group.job;
        if (group.subItem) title += ` - ${group.subItem}`;
        if (!title.trim()) title = "Turno importado";

        // Insert scheduled_shift
        const { data: shift, error: shiftErr } = await supabase.from("scheduled_shifts").insert({
          company_id: selectedCompanyId,
          title: title.trim(),
          date: group.date,
          start_time: group.startTime,
          end_time: group.endTime,
          client_id: clientId,
          notes: group.note || null,
          meeting_point: group.address || null,
          shift_code: group.shiftCode || null,
          status: "open",
          slots: group.employees.length || 1,
          claimable: false,
        }).select("id").single();

        if (shiftErr || !shift) {
          console.error("Shift insert error:", shiftErr);
          continue;
        }

        totalShifts++;

        // Create assignments for each employee
        for (const empName of group.employees) {
          const empId = empMap.get(empName.toLowerCase());
          if (!empId) {
            unmatchedEmployeesSet.add(empName);
            continue;
          }
          matchedEmployees++;

          const statusMap: Record<string, string> = { accept: "accepted", decline: "rejected" };
          const assignStatus = statusMap[group.status?.toLowerCase()] ?? "accepted";

          // Use try-catch per assignment to skip overlapping shifts
          try {
            await supabase.from("shift_assignments").insert({
              company_id: selectedCompanyId,
              shift_id: shift.id,
              employee_id: empId,
              status: assignStatus,
            });
            totalAssignments++;
          } catch (assignErr: any) {
            // Overlap error from trigger — skip silently
            console.warn("Assignment skipped (overlap?):", empName, assignErr?.message);
          }
        }
      }

      // Handle unavailability records
      let totalUnavailable = 0;
      const filteredUnavail = unavailableRecords.filter(u => {
        if (filterFrom && u.date < filterFrom) return false;
        if (filterTo && u.date > filterTo) return false;
        return true;
      });

      for (const u of filteredUnavail) {
        const name = parseName(u.name);
        if (!name) continue;
        const empId = empMap.get(`${name.first} ${name.last}`.toLowerCase());
        if (!empId) continue;

        try {
          await supabase.from("employee_availability_overrides").upsert({
            employee_id: empId,
            company_id: selectedCompanyId,
            date: u.date,
            is_available: false,
            reason: "Importado desde Connecteam (Schedule)",
            source: "import",
          } as any, { onConflict: "employee_id,date" });
          totalUnavailable++;
        } catch { /* skip */ }
      }

      const summaryData: ImportSummary = {
        totalShifts,
        totalAssignments,
        totalUnavailable,
        matchedEmployees,
        unmatchedEmployees: Array.from(unmatchedEmployeesSet),
        matchedClients,
        unmatchedClients: Array.from(unmatchedClientsSet),
      };
      setSummary(summaryData);

      const createdMsg = (createdClients + createdEmployees) > 0
        ? ` · ${createdClients} clientes y ${createdEmployees} empleados creados`
        : "";
      const unmatchedMsg = summaryData.unmatchedEmployees.length > 0
        ? ` · ${summaryData.unmatchedEmployees.length} empleados no encontrados`
        : "";
      const unavailMsg = totalUnavailable > 0 ? ` · ${totalUnavailable} indisponibilidades` : "";

      setResult({
        success: true,
        message: `Importación completada: ${totalShifts} turnos, ${totalAssignments} asignaciones${createdMsg}${unmatchedMsg}${unavailMsg}.`,
      });
      setStep(4);
    } catch (err: any) {
      setResult({ success: false, message: getUserFriendlyError(err) });
      toast({ title: "Error", description: getUserFriendlyError(err), variant: "destructive" });
    }

    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        variant="3"
        title="Importar Turnos Programados"
        subtitle="Schedule Export de Connecteam → Turnos y asignaciones"
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
            <li>Sube el archivo <strong>Schedule Export</strong> de Connecteam (.xlsx)</li>
            <li>Se crean <strong>turnos programados</strong> (scheduled_shifts) con asignaciones</li>
            <li>Los <strong>Jobs</strong> se emparejan con clientes existentes</li>
            <li>Los empleados se emparejan por nombre completo</li>
            <li>Las filas <strong>Unavailable</strong> se importan como indisponibilidades</li>
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
          <CardHeader><CardTitle>Paso 1: Selecciona el archivo de Schedule Export</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Archivo XLSX de Schedule Export</Label>
              <div className="mt-1 border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground mb-2">Arrastra o selecciona tu archivo Schedule Export de Connecteam</p>
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
                <CalendarDays className="h-4 w-4" /> Turnos
              </div>
              <p className="text-2xl font-bold tabular-nums">{filteredGroups.length}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Users className="h-4 w-4" /> Asignaciones
              </div>
              <p className="text-2xl font-bold tabular-nums">{filteredGroups.reduce((s, g) => s + g.employees.length, 0)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Building2 className="h-4 w-4" /> Clientes únicos
              </div>
              <p className="text-2xl font-bold tabular-nums">{new Set(filteredGroups.map(g => g.job).filter(Boolean)).size}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <AlertCircle className="h-4 w-4" /> Indisponibles
              </div>
              <p className="text-2xl font-bold tabular-nums">{unavailableRecords.filter(u => (!filterFrom || u.date >= filterFrom) && (!filterTo || u.date <= filterTo)).length}</p>
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
              <CardTitle className="text-sm">Vista previa de turnos (primeros 20)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Horario</TableHead>
                    <TableHead className="text-xs">Cliente (Job)</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Empleados</TableHead>
                    <TableHead className="text-xs">Dirección</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.slice(0, 20).map((g, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{g.shiftCode ? `#${g.shiftCode.padStart(4, "0")}` : "—"}</TableCell>
                      <TableCell className="text-xs">{g.date}</TableCell>
                      <TableCell className="text-xs">{g.startTime} - {g.endTime}</TableCell>
                      <TableCell className="text-xs font-medium">{g.job || "—"}</TableCell>
                      <TableCell className="text-xs">{g.subItem || "—"}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {g.employees.slice(0, 3).map((e, j) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">{e}</Badge>
                          ))}
                          {g.employees.length > 3 && <Badge variant="outline" className="text-[10px]">+{g.employees.length - 3}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-40 truncate" title={g.address}>{g.address || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredGroups.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2 px-1">… y {filteredGroups.length - 20} turnos más</p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep(1); setFile(null); setWorkbook(null); setShiftGroups([]); }}>
              ← Cambiar archivo
            </Button>
            <Button onClick={handleImport} disabled={importing || filteredGroups.length === 0}>
              {importing ? "Importando…" : `Importar ${filteredGroups.length} turnos`}
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{summary.totalShifts}</p>
                <p className="text-xs text-muted-foreground">Turnos creados</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{summary.totalAssignments}</p>
                <p className="text-xs text-muted-foreground">Asignaciones</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold tabular-nums">{summary.totalUnavailable}</p>
                <p className="text-xs text-muted-foreground">Indisponibilidades</p>
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

          {summary && summary.unmatchedClients.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm text-warning">Clientes no encontrados ({summary.unmatchedClients.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {summary.unmatchedClients.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Los turnos se crearon sin cliente. Puedes asignarlos manualmente desde el módulo de Turnos.
                </p>
              </CardContent>
            </Card>
          )}

          <Button variant="outline" onClick={() => { setStep(1); setFile(null); setWorkbook(null); setShiftGroups([]); setResult(null); setSummary(null); }}>
            Importar otro archivo
          </Button>
        </div>
      )}
    </div>
  );
}
